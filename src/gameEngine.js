export const PHASES = ['PROFESSION_REVEAL','SKILL_REVEAL','BAGGAGE_REVEAL','PERSONALITY_AND_SECRET_REVEAL','DISCUSSION','ELIMINATION_VOTE','TIEBREAK_VOTE','FINAL_CAPSULE_VOTE','RESULTS'];
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
 const success = occupants.length >= disaster.seats && occupants.filter(p=>p.role!=='Саботажник').length >= disaster.required;
 if (mode==='hidden' && saboteurs) return {winner:'saboteurs',reason:'Саботажник проник в капсулу.'};
 return success ? {winner:'survivors',reason:'Капсула укомплектована, требования катастрофы выполнены.'} : {winner:'nobody',reason:'Капсула не смогла выполнить условия спасения.'};
}
