import cards from './cards.json' with { type: 'json' };
export function validateCards(data = cards) {
  for (const [category, list] of Object.entries(data)) {
    if (!Array.isArray(list) || list.length === 0) throw new Error(`Нет карт категории ${category}`);
    const ids = new Set();
    for (const card of list) {
      if (!card.id || !card.title || !card.description || !Array.isArray(card.tags) || ids.has(card.id)) throw new Error(`Некорректная карта ${category}`);
      ids.add(card.id);
    }
  }
  return true;
}
export { cards };
