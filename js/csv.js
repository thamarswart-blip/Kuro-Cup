// CSV-import (export uit Google Sheets): parsen, kolommen koppelen, controleren.
import { parseDate, ageOn, uid } from './util.js';

export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delim = [',', ';', '\t'].map(d => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter(r => r.some(c => String(c).trim() !== ''));
  if (!clean.length) return { headers: [], rows: [] };
  const headers = clean[0].map(h => h.trim());
  return { headers, rows: clean.slice(1).map(r => headers.map((_, i) => (r[i] ?? '').trim())) };
}

export const IMPORT_FIELDS = [
  { key: 'name', label: 'Naam (volledig)', hints: ['naam', 'name', 'volledige naam', 'deelnemer'] },
  { key: 'firstName', label: 'Voornaam', hints: ['voornaam', 'roepnaam', 'first name'] },
  { key: 'lastName', label: 'Achternaam', hints: ['achternaam', 'familienaam', 'last name', 'tussenvoegsel + achternaam'] },
  { key: 'birthDate', label: 'Geboortedatum', required: true, hints: ['geboortedatum', 'geb. datum', 'geboren', 'birth', 'dob'] },
  { key: 'sex', label: 'Jongen/meisje', required: true, hints: ['geslacht', 'sekse', 'jongen/meisje', 'm/v', 'categorie', 'gender'] },
  { key: 'kyu', label: 'Kyu-graad', hints: ['kyu', 'graad', 'kyu-graad', 'kyu graad'] },
  { key: 'belt', label: 'Bandkleur', hints: ['band', 'bandkleur', 'belt'] },
  { key: 'weight', label: 'Gewicht (kg, optioneel)', hints: ['gewicht', 'kg', 'weight'] },
  { key: 'experience', label: 'Wedstrijdervaring (optioneel)', hints: ['ervaring', 'wedstrijdervaring', 'toernooien', 'experience'] },
  { key: 'disciplines', label: 'Onderdelen (kata/kumite)', hints: ['onderdeel', 'onderdelen', 'discipline', 'doet mee aan', 'inschrijving'] },
];

export function guessMapping(headers) {
  const map = {};
  const used = new Set();
  const norm = h => h.toLowerCase().trim();
  // Eerst exacte kolomnamen, daarna kolommen die het woord bevatten.
  for (const exact of [true, false]) {
    for (const f of IMPORT_FIELDS) {
      if (map[f.key] != null) continue;
      const idx = headers.findIndex((h, i) => !used.has(i) && f.hints.some(x => exact ? norm(h) === x : norm(h).includes(x)));
      if (idx >= 0) { map[f.key] = idx; used.add(idx); }
    }
  }
  // Volledige naam niet combineren met aparte voor- en achternaam.
  if (map.firstName != null && map.name != null) delete map.name;
  return map;
}

function parseSex(v) {
  const s = String(v || '').toLowerCase().trim();
  if (/^(j|jongen|jongens|m|man|male|boy|heren)$/.test(s)) return 'M';
  if (/^(meisje|meisjes|meid|v|vrouw|f|female|girl|dames)$/.test(s)) return 'V';
  return null;
}
function parseKyu(v) {
  const s = String(v || '').toLowerCase().trim();
  if (!s) return { kyu: null };
  if (/dan/.test(s)) return { kyu: 0 };
  const m = s.match(/(\d{1,2})/);
  if (m && +m[1] >= 0 && +m[1] <= 10) return { kyu: +m[1] };
  return { kyu: null, invalid: true };
}
function parseExperience(v) {
  const s = String(v || '').toLowerCase().trim();
  if (!s) return null;
  const n = s.match(/\d+/);
  if (n) return Math.min(+n[0], 10);
  if (/^(ja|yes|y|veel)$/.test(s)) return 2;
  if (/^(nee|no|n|geen)$/.test(s)) return 0;
  if (/beetje|weinig|1x|een keer/.test(s)) return 1;
  return null;
}
function parseDisciplines(v) {
  const s = String(v || '').toLowerCase();
  if (!s.trim()) return { kata: true, kumite: true };
  return { kata: /kata|beide|allebei/.test(s), kumite: /kumite|beide|allebei/.test(s) };
}

const BELT_WORDS = ['wit', 'geel', 'oranje', 'groen', 'blauw', 'paars', 'bruin', 'zwart'];

// Zet rijen om naar deelnemer-voorstellen met controles.
export function buildPreview(parsed, map, eventDate, existing = []) {
  const get = (r, k) => (map[k] != null && map[k] !== '' ? r[map[k]] : '');
  const seen = new Map(existing.map(p => [dupKey(p), p]));
  return parsed.rows.map((r, i) => {
    const issues = [];
    let name = get(r, 'name');
    if (!name) {
      name = [get(r, 'firstName'), get(r, 'lastName')].filter(Boolean).join(' ');
      if (name && map.firstName != null && !get(r, 'firstName')) issues.push({ level: 'warn', field: 'name', text: 'Voornaam ontbreekt' });
    }
    name = name.replace(/\s+/g, ' ').trim();
    if (!name) issues.push({ level: 'error', field: 'name', text: 'Naam ontbreekt' });

    const rawBirth = get(r, 'birthDate');
    const birthDate = parseDate(rawBirth);
    if (!rawBirth) issues.push({ level: 'error', field: 'birthDate', text: 'Geboortedatum ontbreekt' });
    else if (!birthDate) issues.push({ level: 'error', field: 'birthDate', text: `Geboortedatum "${rawBirth}" niet herkend (gebruik bijv. 14-03-2016)` });
    const age = birthDate && eventDate ? ageOn(birthDate, eventDate) : null;
    if (age != null && (age < 3 || age > 18)) issues.push({ level: 'warn', field: 'birthDate', text: `Leeftijd ${age} jaar is ongebruikelijk — klopt de geboortedatum?` });

    const rawSex = get(r, 'sex');
    const sex = parseSex(rawSex);
    if (!sex) issues.push({ level: 'error', field: 'sex', text: rawSex ? `"${rawSex}" niet herkend als jongen of meisje` : 'Jongen/meisje ontbreekt' });

    const kp = parseKyu(get(r, 'kyu'));
    let kyu = kp.kyu;
    let belt = String(get(r, 'belt') || '').toLowerCase().trim();
    belt = BELT_WORDS.find(w => belt.includes(w)) || '';
    const assumptions = [];
    if (kp.invalid) issues.push({ level: 'warn', field: 'kyu', text: `Kyu-graad "${get(r, 'kyu')}" niet herkend` });
    if (kyu == null) {
      assumptions.push('Geen kyu-graad: als beginner behandeld');
      issues.push({ level: 'check', field: 'kyu', text: 'Kyu-graad ontbreekt — behandeld als beginner (controleren)' });
    }

    const rawW = get(r, 'weight');
    let weight = null;
    if (rawW) {
      weight = parseFloat(String(rawW).replace(',', '.'));
      if (isNaN(weight) || weight < 10 || weight > 150) { issues.push({ level: 'warn', field: 'weight', text: `Gewicht "${rawW}" lijkt niet te kloppen` }); weight = null; }
    }
    const experience = parseExperience(get(r, 'experience'));
    const disc = parseDisciplines(get(r, 'disciplines'));
    if (!disc.kata && !disc.kumite) issues.push({ level: 'warn', field: 'disciplines', text: 'Geen onderdeel herkend — staat nu nergens ingeschreven' });

    const p = { id: uid('p'), name, birthDate, sex, kyu, belt: belt || null, weight, experience, kata: disc.kata, kumite: disc.kumite, assumptions, checked: false };
    const dup = seen.get(dupKey(p));
    if (dup) issues.push({ level: 'warn', field: 'name', text: `Lijkt dubbel: ${dup.name} staat al in de lijst` });
    else seen.set(dupKey(p), p);
    return { row: i + 2, p, issues, include: !issues.some(x => x.level === 'error') && !dup };
  });
}

const dupKey = p => (p.name || '').toLowerCase().replace(/\s+/g, ' ').trim() + '|' + (p.birthDate || '');

// Problemen bij een bestaande deelnemer (voor de deelnemerslijst).
export function participantIssues(p, eventDate) {
  const out = [];
  if (!p.name) out.push({ level: 'error', text: 'Naam ontbreekt' });
  if (!p.birthDate) out.push({ level: 'error', text: 'Geboortedatum ontbreekt' });
  if (!p.sex) out.push({ level: 'error', text: 'Jongen/meisje ontbreekt' });
  if (p.kyu == null && !p.checked) out.push({ level: 'check', text: 'Geen kyu-graad: als beginner behandeld' });
  if (!p.kata && !p.kumite) out.push({ level: 'warn', text: 'Doet aan geen enkel onderdeel mee' });
  if (p.birthDate && eventDate) {
    const a = ageOn(p.birthDate, eventDate);
    if (a < 3 || a > 18) out.push({ level: 'warn', text: `Leeftijd ${a} jaar is ongebruikelijk` });
  }
  return out;
}

export const SAMPLE_CSV_HEADER = 'Voornaam,Achternaam,Geboortedatum,Jongen/meisje,Kyu-graad,Gewicht,Wedstrijdervaring,Onderdelen';
