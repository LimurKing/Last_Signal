import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import { Server } from 'socket.io';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { RoomManager } from './src/roomManager.js';
import { validSettings, cleanText } from './src/validation.js';
import { cards, validateCards } from './src/cardDatabase.js';
import { capsuleSeats, countVotes, resolveWinner } from './src/gameEngine.js';
import { newToken, tokenHash, tokenMatches } from './src/security.js';
import { replaceTimer, clearRoomTimers } from './src/timerManager.js';

validateCards();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'","https://cdn.socket.io"],styleSrc:["'self'","'unsafe-inline'"],connectSrc:["'self'","ws:","wss:"],imgSrc:["'self'","data:"]}}}));
app.use(rateLimit({windowMs:60000,limit:180,standardHeaders:true,legacyHeaders:false}));
app.get('/health',(_req,res)=>res.json({status:'ok'}));
app.use(express.static(path.join(__dirname,'public')));
app.get('*',(_req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
const server=http.createServer(app);
const io=new Server(server,{serveClient:true,maxHttpBufferSize:1e5, pingTimeout:20000});
const manager=new RoomManager();
const bySocket=new Map();
function socketRate(socket,key,limit,windowMs){const now=Date.now();socket.data.rates??={};const recent=(socket.data.rates[key]||[]).filter(t=>now-t<windowMs);if(recent.length>=limit)throw Error('Слишком много запросов. Подождите немного.');recent.push(now);socket.data.rates[key]=recent;}
const reconnectMs=Number(process.env.RECONNECT_GRACE_MS)||120000;
const disasters=cards.disasters;
const safe=(socket,fn)=>{try{Promise.resolve(fn()).catch(e=>socket.emit('error:notice',{message:e.message||'Не удалось выполнить действие.'}));}catch(e){socket.emit('error:notice',{message:e.message||'Не удалось выполнить действие.'});}};
function playerFor(socket){const x=bySocket.get(socket.id);if(!x)throw Error('Сначала войдите в комнату.');const room=manager.get(x.room);const player=room?.players.get(x.player);if(!player||player.socketId!==socket.id)throw Error('Сессия больше не активна.');return {room,player};}
function publicState(room){return {code:room.code,hostId:room.hostId,settings:{maxPlayers:room.maxPlayers,roundSeconds:room.roundSeconds,mode:room.mode,isPublic:room.isPublic},players:[...room.players.values()].map(p=>({id:p.id,name:p.name,connected:!!p.socketId,host:p.id===room.hostId,alive:p.alive!==false,revealed:p.revealed||[],...(room.game?.phase==='RESULTS'?{role:p.role}: {})})),game:room.game?{phase:room.game.phase,round:room.game.round,deadline:room.game.deadline,disaster:room.game.disaster,log:room.game.log.slice(-40),reveals:room.game.reveals,votesOpen:room.game.phase.includes('VOTE'),capsule:room.game.phase==='RESULTS'?room.game.capsule:undefined,result:room.game.phase==='RESULTS'?room.game.result:undefined}:null};}
function emitRoom(room){io.to(room.code).emit('room:state',publicState(room));}
function system(room,text){room.game?.log.push({text,at:Date.now()});io.to(room.code).emit('chat:system',{text,at:Date.now()});}
function auth(socket,room,player){if(!player||player.socketId!==socket.id)throw Error('Нет прав.');}
function assignCards(){return Object.fromEntries(['professions','personalities','skills','baggage','secrets'].map(k=>[k,cards[k][Math.floor(Math.random()*cards[k].length)]]));}
function startGame(room){for(const [id,p] of room.players)if(!p.socketId)room.players.delete(id);const ps=[...room.players.values()].filter(p=>p.socketId);if(ps.length>room.maxPlayers)throw Error('Комната переполнена.');if(ps.length<6)throw Error('Нужно 6 подключённых игроков.');const pool=[...disasters];const disaster=pool[Math.floor(Math.random()*pool.length)];const sabotage=room.mode==='hidden'?Math.max(1,Math.floor(ps.length/6)):0;const shuffled=[...ps].sort(()=>Math.random()-.5);shuffled.forEach((p,i)=>{p.alive=true;p.cards=assignCards();p.role=i<sabotage?'Саботажник':'Выживший';p.uses={};p.revealed=[];});room.game={phase:'PROFESSION_REVEAL',round:1,deadline:Date.now()+room.roundSeconds*1000,disaster:{...disaster,seats:capsuleSeats(ps.length),required:Math.max(2,capsuleSeats(ps.length)-1)},reveals:[],votes:{},log:[],capsule:[]};clearRoomTimers(room);replaceTimer(room,()=>advance(room),room.roundSeconds*1000);for(const p of ps)io.to(p.socketId).emit('game:private',{cards:p.cards,role:p.role});system(room,`Началась игра. Катастрофа: ${disaster.title}.`);emitRoom(room);}
function active(room){return [...room.players.values()].filter(p=>p.alive!==false&&p.role);}
function advance(room){const g=room.game;if(!g)return;clearRoomTimers(room);g.votes={};g.reveals=[];g.deadline=Date.now()+room.roundSeconds*1000;
 if(g.phase.endsWith('REVEAL')){g.phase='DISCUSSION';system(room,'Карты раскрыты. Время обсуждать, кто достоин места.');}
 else if(g.phase==='DISCUSSION'){g.phase='ELIMINATION_VOTE';system(room,'Голосование за исключение открыто.');}
 else if(g.phase==='ELIMINATION_VOTE'||g.phase==='TIEBREAK_VOTE'){
  const candidates=g.phase==='TIEBREAK_VOTE'?g.tied:active(room).map(p=>p.id);const result=countVotes(g.votes,candidates);
  if(result.leaders.length===1){const out=room.players.get(result.leaders[0]);if(out)out.alive=false;system(room,`${out?.name||'Игрок'} покидает убежище.`);}
  else if(result.leaders.length>1&&g.phase==='ELIMINATION_VOTE'){g.tied=result.leaders;g.phase='TIEBREAK_VOTE';g.deadline=Date.now()+room.roundSeconds*1000;system(room,'Ничья. Решающий раунд голосования!');replaceTimer(room,()=>advance(room),room.roundSeconds*1000);emitRoom(room);return;}
  else system(room,'Голоса разделились. Никто не исключён.');
  const survivors=active(room);g.round++;
  if(survivors.length<=g.disaster.seats||g.round>4){g.phase='FINAL_CAPSULE_VOTE';system(room,'Финальный выбор: голосуйте за кандидатов в капсулу.');}
  else {g.phase=['SKILL_REVEAL','BAGGAGE_REVEAL','PERSONALITY_AND_SECRET_REVEAL'][Math.min(g.round-2,2)];}
 }
 else if(g.phase==='FINAL_CAPSULE_VOTE'){
  const res=countVotes(g.votes,active(room).map(p=>p.id));const ranked=Object.entries(res.counts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));g.capsule=ranked.slice(0,g.disaster.seats).map(x=>x[0]);g.phase='RESULTS';g.result=resolveWinner([...room.players.values()],g.capsule,g.disaster,room.mode);for(const p of room.players.values())io.to(p.socketId).emit('game:private',{cards:p.cards,role:p.role});system(room,`Игра окончена. ${g.result.reason}`);clearRoomTimers(room);
 }
 if(g.phase!=='RESULTS')replaceTimer(room,()=>advance(room),room.roundSeconds*1000);emitRoom(room);
}
io.on('connection',socket=>{
 socket.emit('rooms:list',manager.publicList());
 socket.on('room:create',data=>safe(socket,async()=>{socketRate(socket,'create',4,60000);const password=typeof data?.password==='string'?data.password:'';if(password.length>72)throw Error('Пароль слишком длинный.');const room=manager.create({...settings,hostId:null,passwordHash:password?await bcrypt.hash(password,10):null,bans:new Set()});const p={id:randomUUID(),name,host:true,socketId:socket.id,tokenHash:tokenHash(newToken()),alive:true};const token=newToken();p.tokenHash=tokenHash(token);room.players.set(p.id,p);room.hostId=p.id;socket.join(room.code);bySocket.set(socket.id,{room:room.code,player:p.id});socket.emit('room:joined',{code:room.code,playerId:p.id,token,name,host:true});emitRoom(room);}));
 socket.on('room:join',data=>safe(socket,async()=>{socketRate(socket,'join',12,60000);const room=manager.get(String(data?.code||'').toUpperCase());if(!room)throw Error('Комната не найдена.');const token=typeof data.token==='string'?data.token:'';let p=[...room.players.values()].find(x=>tokenMatches(token,x.tokenHash));const providedName=cleanText(data?.name);const name=providedName||p?.name||'';if(!name)throw Error('Проверьте имя игрока.');if(p){clearTimeout(room.hostTimer);if(p.socketId)bySocket.delete(p.socketId);p.socketId=socket.id;p.name=name;}
 else {if(room.game)throw Error('Игра уже началась.');if(room.players.size>=room.maxPlayers)throw Error('Комната заполнена.');if(room.bans.has(name.toLocaleLowerCase()))throw Error('Вас исключили из комнаты.');if(room.passwordHash&&!await bcrypt.compare(String(data.password||''),room.passwordHash))throw Error('Неверный пароль комнаты.');const newSession=newToken();p={id:randomUUID(),name,socketId:socket.id,tokenHash:tokenHash(newSession),alive:true,revealed:[]};p._token=newSession;room.players.set(p.id,p);}
 if(!p._token){const t=newToken();p._token=t;p.tokenHash=tokenHash(t);}socket.join(room.code);bySocket.set(socket.id,{room:room.code,player:p.id});socket.emit('room:joined',{code:room.code,playerId:p.id,token:p._token,name:p.name,host:p.id===room.hostId});io.to(socket.id).emit('game:private',room.game?{cards:p.cards,role:p.role}:null);emitRoom(room);}));
 socket.on('rooms:list',()=>socket.emit('rooms:list',manager.publicList()));
 socket.on('host:start',()=>safe(socket,()=>{const {room,player}=playerFor(socket);if(player.id!==room.hostId)throw Error('Только ведущий может начать игру.');if(room.game)throw Error('Игра уже началась.');startGame(room);}));
 socket.on('host:kick',data=>safe(socket,()=>{const {room,player}=playerFor(socket);if(player.id!==room.hostId)throw Error('Только ведущий может исключать игроков.');const target=room.players.get(String(data?.playerId));if(!target||target.id===player.id)throw Error('Игрок не найден.');room.bans.add(target.name.toLocaleLowerCase());if(target.socketId){io.to(target.socketId).emit('error:notice',{message:'Вас исключили из комнаты.'});io.sockets.sockets.get(target.socketId)?.leave(room.code);bySocket.delete(target.socketId);}room.players.delete(target.id);emitRoom(room);}));
 socket.on('game:reveal',data=>safe(socket,()=>{const {room,player}=playerFor(socket);const g=room.game;if(!g||g.phase!=='PROFESSION_REVEAL'&&g.phase!=='SKILL_REVEAL'&&g.phase!=='BAGGAGE_REVEAL'&&g.phase!=='PERSONALITY_AND_SECRET_REVEAL')throw Error('Сейчас карты не раскрываются.');if(g.reveals.includes(player.id))throw Error('Вы уже раскрыли карту.');const key={PROFESSION_REVEAL:'professions',SKILL_REVEAL:'skills',BAGGAGE_REVEAL:'baggage',PERSONALITY_AND_SECRET_REVEAL:'personalities'}[g.phase];const c=player.cards[key];if(!c)throw Error('Карта не найдена.');g.reveals.push(player.id);io.to(room.code).emit('game:card-revealed',{playerId:player.id,name:player.name,card:c});system(room,`${player.name} раскрывает карту «${c.title}».`);emitRoom(room);if(g.reveals.length>=active(room).length)advance(room);}));
 socket.on('game:vote',data=>safe(socket,()=>{const {room,player}=playerFor(socket);const g=room.game;if(!g||!['ELIMINATION_VOTE','TIEBREAK_VOTE','FINAL_CAPSULE_VOTE'].includes(g.phase)||Date.now()>g.deadline)throw Error('Голосование закрыто.');if(player.alive===false)throw Error('Вы выбыли и не можете голосовать.');if(g.votes[player.id])throw Error('Ваш голос уже учтён.');const target=room.players.get(String(data?.targetId));if(!target||target.alive===false||target.id===player.id)throw Error('Выберите другого действующего игрока.');if(g.phase==='TIEBREAK_VOTE'&&!g.tied.includes(target.id))throw Error('Выберите одного из участников ничьей.');g.votes[player.id]=target.id;socket.emit('game:vote:accepted');if(Object.keys(g.votes).length>=active(room).length)advance(room);}));
 socket.on('chat:send',data=>safe(socket,()=>{socketRate(socket,'chat',6,5000);const {room,player}=playerFor(socket);const message=cleanText(data?.message,1,300);if(!message)throw Error('Сообщение должно быть не длиннее 300 символов.');player.lastChat||=0;if(Date.now()-player.lastChat<700)throw Error('Пишите немного медленнее.');player.lastChat=Date.now();io.to(room.code).emit('chat:message',{name:player.name,message,at:Date.now()});}));
 socket.on('room:leave',()=>{const x=bySocket.get(socket.id);if(x){const room=manager.get(x.room);const p=room?.players.get(x.player);if(p){p.socketId=null;if(p.id===room.hostId){clearTimeout(room.hostTimer);room.hostTimer=setTimeout(()=>{if(p.socketId)return;const next=[...room.players.values()].find(q=>q.socketId);if(next){room.hostId=next.id;system(room,`${next.name} стал ведущим.`);emitRoom(room);}else manager.remove(room.code);},reconnectMs);room.hostTimer.unref?.();}emitRoom(room);}socket.leave(x.room);bySocket.delete(socket.id);}});
 socket.on('disconnect',()=>{const x=bySocket.get(socket.id);if(!x)return;const room=manager.get(x.room);const p=room?.players.get(x.player);if(p){p.socketId=null;emitRoom(room);if(p.id===room.hostId)clearTimeout(room.hostTimer);room.hostTimer=setTimeout(()=>{if(p.socketId)return;const next=[...room.players.values()].find(q=>q.socketId);if(next){room.hostId=next.id;system(room,`${next.name} стал ведущим.`);emitRoom(room);}else manager.remove(room.code);},reconnectMs);room.hostTimer.unref?.();}bySocket.delete(socket.id);});
});
const port=Number(process.env.PORT)||3000;server.listen(port,'0.0.0.0',()=>console.log(`Last Signal listening on 0.0.0.0:${port}`));
function shutdown(){for(const r of manager.rooms.values())clearRoomTimers(r);server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),5000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
