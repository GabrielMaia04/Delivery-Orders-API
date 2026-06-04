function money(v) { return typeof v === 'number' ?v.toFixed(2).replace('.', ',') : '0,00'; }
function dateBR(d) { return d ?String(d).split('-').reverse().join('/') : ''; }
function phoneBR(v = '') { return String(v).replace(/\D/g, '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3'); }
function formatCEP(v = '') { return String(v).replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2'); }
function formatStatus(status = '') { return String(status); }
window.money = money; window.dateBR = dateBR; window.phoneBR = phoneBR; window.formatCEP = formatCEP; window.formatStatus = formatStatus;
