import { randomBytes } from 'node:crypto';
import { validRoomCode } from './validation.js';
export class RoomManager {
 constructor(){this.rooms=new Map();}
 create(data){let code; do{code=randomBytes(4).toString('base64url').toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,5)}while(code.length!==5||this.rooms.has(code));const room={code,...data,players:new Map(),game:null,timers:new Set(),createdAt:Date.now()};this.rooms.set(code,room);return room;}
 get(code){return validRoomCode(code)?this.rooms.get(code):undefined;}
 remove(code){const r=this.rooms.get(code);if(r){for(const t of r.timers)clearTimeout(t);this.rooms.delete(code);return true;}return false;}
 publicList(){return [...this.rooms.values()].filter(r=>r.isPublic&&r.game===null).map(r=>({code:r.code,players:r.players.size,maxPlayers:r.maxPlayers,status:'Ожидание',isPublic:true}));}
}
