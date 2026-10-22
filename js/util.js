// Kleine hulpfuncties: id's, tijd, datum, leeftijd, escaping.

export function uid(prefix = '') {
  const rnd = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
  return prefix + rnd.replace(/-/g, '').slice(0, 16);
}

export const nowIso = () => new Date().toISOString();

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "09:30" -> seconden sinds middernacht
export function parseTime(hhmm) {
  if (!hhmm) return null;
  const m = String(hhmm).trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60;
}

// seconden -> "09:30"
export function fmtTime(sec, withSeconds = false) {
  if (sec == null || isNaN(sec)) return '–';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const base = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  return withSeconds && s ? base + ':' + String(s).padStart(2, '0') : base;
}

export function fmtDuration(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h && m) return `${h} u ${m} min`;
  if (h) return `${h} uur`;
  return `${m} min`;
}

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

export function fmtDate(iso, withDay = false) {
  if (!iso) return '–';
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
  if (isNaN(d)) return iso;
  return (withDay ? DAYS[d.getDay()] + ' ' : '') + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

export function fmtDateTime(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// Accepteert 2015-03-08, 8-3-2015, 08/03/2015, 8.3.2015
export function parseDate(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return mkDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return mkDate(+m[3], +m[2], +m[1]);
  return null;
}
function mkDate(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Leeftijd in hele jaren op peildatum
export function ageOn(birthIso, onIso) {
  if (!birthIso || !onIso) return null;
  const [by, bm, bd] = birthIso.split('-').map(Number);
  const [y, m, d] = onIso.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age;
}
// Leeftijd als decimaal getal (voor sorteren)
export function ageExact(birthIso, onIso) {
  if (!birthIso || !onIso) return null;
  return (new Date(onIso) - new Date(birthIso)) / (365.2425 * 864e5);
}

export function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

// Stabiele JSON (gesorteerde sleutels) voor vergelijken en hashen
export function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

export function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export const byId = (list) => Object.fromEntries((list || []).map(x => [x.id, x]));

export function groupBy(list, fn) {
  const out = new Map();
  for (const x of list) { const k = fn(x); if (!out.has(k)) out.set(k, []); out.get(k).push(x); }
  return out;
}

export function downloadFile(name, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }
