export function cleanText(value, min = 1, max = 32) {
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFKC').replace(/[<>\u0000-\u001f]/g, '').trim();
  return text.length >= min && text.length <= max ? text : null;
}
export function validSettings(s) {
  return s && Number.isInteger(s.maxPlayers) && s.maxPlayers >= 6 && s.maxPlayers <= 12 &&
    Number.isInteger(s.roundSeconds) && s.roundSeconds >= 30 && s.roundSeconds <= 600 &&
    ['standard','hidden'].includes(s.mode) && typeof s.isPublic === 'boolean';
}
export function validRoomCode(code) { return typeof code === 'string' && /^[A-Z2-9]{5}$/.test(code); }
