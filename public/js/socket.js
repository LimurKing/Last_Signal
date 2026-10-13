export const socket=io({transports:['websocket','polling']});
export function remembered(){try{return JSON.parse(localStorage.getItem('lastSignalSession')||'null')}catch{return null}}
export function remember(value){localStorage.setItem('lastSignalSession',JSON.stringify(value))}
