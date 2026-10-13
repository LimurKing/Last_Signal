export const $=s=>document.querySelector(s);
export function escapeText(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function flash(message,type='error'){const el=$('#notice');if(el){el.textContent=message;el.className=`notice ${type}`;}}
export function setView(html){$('#view').innerHTML=html;}
