export const PHASES = ['PROFESSION_REVEAL','SKILL_REVEAL','SECRET_REVEAL','BAGGAGE_REVEAL','IDENTITY_REVEAL','DISCUSSION','ELIMINATION_VOTE','TIEBREAK_VOTE','RESULTS'];
export function capsuleSeats(count) { return count === 3 ? 2 : count <= 8 ? 4 : 5; }
export function countVotes(votes, candidates) {
  const counts = Object.fromEntries(candidates.map(id => [id, 0]));
  for (const target of Object.values(votes)) if (target in counts) counts[target]++;
  const max = Math.max(0, ...Object.values(counts));
  return {counts, leaders:Object.keys(counts).filter(id => counts[id] === max && max > 0)};
}
export function resolveWinner(players, capsule, disaster, mode) {
 const occupants = capsule.map(id => players.find(p => p.id === id)).filter(Boolean);
 const saboteurs = occupants.filter(p=>p.role==='Саботажник').length;
 if (mode==='hidden' && saboteurs) return {winner:'saboteurs',reason:'Саботажник попал в эвакуационную группу и сорвал спасение.'};
 return occupants.length===disaster.seats ? {winner:'survivors',reason:'Эвакуационная группа укомплектована точно по числу мест.'} : {winner:'nobody',reason:'Список эвакуации не соответствует вместимости капсулы.'};
}
