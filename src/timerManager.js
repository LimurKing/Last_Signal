export function replaceTimer(room, callback, delay) { clearRoomTimers(room); const timer=setTimeout(()=>{room.timers.delete(timer);callback();},delay); timer.unref?.(); room.timers.add(timer); return timer; }
export function clearRoomTimers(room){for(const t of room.timers||[])clearTimeout(t);room.timers?.clear();}
