import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
export const newToken=()=>randomBytes(32).toString('base64url');
export const tokenHash=t=>createHash('sha256').update(t).digest('hex');
export function tokenMatches(token,hash){if(typeof token!=='string'||typeof hash!=='string')return false;const a=Buffer.from(tokenHash(token)),b=Buffer.from(hash);return a.length===b.length&&timingSafeEqual(a,b);}
