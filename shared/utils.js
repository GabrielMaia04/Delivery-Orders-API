function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function byId(id) { return document.getElementById(id); }
function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function setText(id, value) { const el = byId(id); if (el) el.textContent = value; return el; }
function setHTML(id, value) { const el = byId(id); if (el) el.innerHTML = value; return el; }
function show(id, display = 'block') { const el = byId(id); if (el) el.style.display = display; return el; }
function hide(id) { const el = byId(id); if (el) el.style.display = 'none'; return el; }
function mascaraCep(el) {
  if (!el) return;
  let v = String(el.value || '').replace(/\D/g, '').slice(0, 8);
  if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
  el.value = v;
}
function mascaraTel(el) {
  if (!el) return;
  let v = String(el.value || '').replace(/\D/g, '').slice(0, 11);
  if (v.length > 10) v = v.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
  else if (v.length > 6) v = v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
  else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,5}).*/, '($1) $2');
  else if (v.length > 0) v = v.replace(/^(\d{0,2}).*/, '($1');
  el.value = v;
}
window.qs = qs; window.qsa = qsa; window.byId = byId; window.escapeHTML = escapeHTML;
window.setText = setText; window.setHTML = setHTML; window.show = show; window.hide = hide;
window.mascaraCep = mascaraCep; window.mascaraTel = mascaraTel;
