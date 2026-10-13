// Безопасный рендер карточного текста; экранирование выполняется перед выводом.
export function cardText(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
