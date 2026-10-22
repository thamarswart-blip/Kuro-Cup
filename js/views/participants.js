// Deelnemers: lijst, controleren, bewerken en CSV-import met kolomkoppeling.
import { esc, uid, ageOn, parseDate, fmtDate, downloadFile } from '../util.js';
import { icon, note, beltChip, sexLabel } from '../ui.js';
import { parseCsv, guessMapping, buildPreview, IMPORT_FIELDS, participantIssues } from '../csv.js';
import { kumiteSecondsFor, LEVELS, levelIndex } from '../model.js';
import { SAMPLE_CSV } from '../sample.js';

const LVL_CLASS = { error: 'error', warn: 'warn', check: 'check' };

function issueBadges(issues) {
  return issues.map(i => `<span class="badge ${i.level === 'check' ? '' : LVL_CLASS[i.level]}" title="${esc(i.text)}">${esc(i.text)}</span>`).join(' ');
}

function listView(c) {
  const ev = c.ev;
  const f = c.ui.pFilter || 'alle';
  const q = (c.ui.pSearch || '').toLowerCase();
  const withIssues = ev.participants.map(p => ({ p, issues: participantIssues(p, ev.info.date) }));
  const counts = { alle: withIssues.length, fouten: withIssues.filter(x => x.issues.some(i => i.level === 'error' || i.level === 'warn')).length, controleren: withIssues.filter(x => x.issues.some(i => i.level === 'check')).length };
  let rows = withIssues;
  if (f === 'fouten') rows = rows.filter(x => x.issues.some(i => i.level === 'error' || i.level === 'warn'));
  if (f === 'controleren') rows = rows.filter(x => x.issues.some(i => i.level === 'check'));
  if (q) rows = rows.filter(x => x.p.name.toLowerCase().includes(q));
  rows.sort((a, b) => a.p.name.localeCompare(b.p.name));
  const poolsOf = id => ev.pools.filter(pl => pl.participantIds.includes(id)).map(pl => pl.name).join(', ');

  return `
    <div class="card">
      <div class="row">
        <div class="seg">${[['alle', 'Alle'], ['fouten', 'Fouten'], ['controleren', 'Te controleren']].map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-act="filter" data-f="${k}">${l} (${counts[k]})</button>`).join('')}</div>
        <input class="input" id="psearch" style="max-width:320px" placeholder="Zoek op naam" value="${esc(c.ui.pSearch || '')}" data-input="search" aria-label="Zoek deelnemer">
        <div class="spacer" style="flex:1"></div>
        ${counts.controleren ? `<button class="btn" data-act="checkAll">Alle aannames gecontroleerd</button>` : ''}
      </div>
      ${!ev.info.date ? note('warn', 'Geen wedstrijddatum ingesteld.', 'Leeftijden worden pas berekend als de datum bij Evenement & velden is ingevuld.') : ''}
      <div class="table-wrap"><table class="t"><thead><tr><th>Naam</th><th>Leeftijd</th><th></th><th>Band</th><th>Gewicht</th><th>Ervaring</th><th>Onderdelen</th><th>Poule(s)</th><th>Controle</th><th></th></tr></thead><tbody>
      ${rows.map(({ p, issues }) => {
        const age = ageOn(p.birthDate, ev.info.date);
        const err = issues.some(i => i.level === 'error');
        return `<tr class="${err ? 'errrow' : issues.some(i => i.level === 'warn') ? 'warnrow' : ''}">
          <td><strong>${esc(p.name || '(zonder naam)')}</strong>${p.withdrawn ? ' <span class="badge">afgemeld</span>' : ''}<div class="small muted">${esc(p.birthDate ? fmtDate(p.birthDate) : 'geen geboortedatum')}</div></td>
          <td class="num">${age ?? '–'}${age != null && p.kumite ? `<div class="small muted">${kumiteSecondsFor(ev, p)} s kumite</div>` : ''}</td>
          <td>${sexLabel(p.sex)}</td>
          <td>${beltChip(p)}<div class="small muted">${LEVELS[levelIndex(p.kyu)].label}</div></td>
          <td class="num">${p.weight ? p.weight + ' kg' : '–'}</td>
          <td class="num">${p.experience ?? '–'}</td>
          <td>${[p.kata && 'Kata', p.kumite && 'Kumite'].filter(Boolean).join(' + ') || '–'}</td>
          <td class="small">${esc(poolsOf(p.id) || '–')}</td>
          <td style="max-width:280px">${issueBadges(issues) || '<span class="badge ok">In orde</span>'}</td>
          <td class="right"><button class="btn s" data-act="edit" data-id="${esc(p.id)}">${icon.edit}Wijzigen</button></td></tr>`;
      }).join('') || `<tr><td colspan="10" class="muted">Geen deelnemers gevonden.</td></tr>`}
      </tbody></table></div>
    </div>`;
}

function editModal(c) {
  const ev = c.ev;
  const p = c.ui.editing === 'new' ? { id: '', name: '', birthDate: '', sex: '', kyu: null, belt: '', weight: null, experience: null, kata: true, kumite: true } : ev.participants.find(x => x.id === c.ui.editing);
  if (!p) return '';
  const age = ageOn(p.birthDate, ev.info.date);
  return `<div class="scrim" data-act="closeEdit"></div><div class="modal small" role="dialog" aria-modal="true" aria-labelledby="pe-title">
    <div class="modal-head"><h2 id="pe-title">${p.id ? 'Deelnemer wijzigen' : 'Deelnemer toevoegen'}</h2><button class="icon-btn" data-act="closeEdit" aria-label="Sluiten">${icon.close}</button></div>
    <div class="modal-body"><div class="form-grid">
      <label class="field"><span>Naam</span><input class="input" id="pe-name" value="${esc(p.name)}" autocomplete="off"></label>
      <label class="field"><span>Geboortedatum <span class="hint">(dd-mm-jjjj)</span></span><input class="input" id="pe-birth" value="${esc(p.birthDate ? p.birthDate.split('-').reverse().join('-') : '')}" inputmode="numeric" placeholder="14-03-2016"></label>
      <label class="field"><span>Jongen / meisje</span><select class="select" id="pe-sex"><option value="">Kies…</option><option value="M" ${p.sex === 'M' ? 'selected' : ''}>Jongen</option><option value="V" ${p.sex === 'V' ? 'selected' : ''}>Meisje</option></select></label>
      <label class="field"><span>Kyu-graad <span class="hint">(leeg = beginner)</span></span><select class="select" id="pe-kyu"><option value="">Onbekend</option>${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(k => `<option value="${k}" ${p.kyu === k ? 'selected' : ''}>${k}e kyu</option>`).join('')}<option value="0" ${p.kyu === 0 ? 'selected' : ''}>Dan</option></select></label>
      <label class="field"><span>Bandkleur <span class="hint">(optioneel)</span></span><select class="select" id="pe-belt"><option value="">Volgens kyu</option>${['wit', 'geel', 'oranje', 'groen', 'blauw', 'paars', 'bruin', 'zwart'].map(b => `<option ${p.belt === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
      <label class="field"><span>Gewicht in kg <span class="hint">(optioneel)</span></span><input class="input" id="pe-weight" inputmode="decimal" value="${p.weight ?? ''}"></label>
      <label class="field"><span>Wedstrijdervaring <span class="hint">(aantal toernooien)</span></span><input class="input" id="pe-exp" inputmode="numeric" value="${p.experience ?? ''}"></label>
    </div>
    <div class="row"><label class="check"><input type="checkbox" id="pe-kata" ${p.kata ? 'checked' : ''}>Doet mee aan kata</label><label class="check"><input type="checkbox" id="pe-kumite" ${p.kumite ? 'checked' : ''}>Doet mee aan kumite</label>${p.id ? `<label class="check"><input type="checkbox" id="pe-withdrawn" ${p.withdrawn ? 'checked' : ''}>Afgemeld</label>` : ''}</div>
    ${age != null ? `<p class="muted">Leeftijd op de wedstrijddag: <strong>${age} jaar</strong>${p.kumite ? ` · kumitetijd ${kumiteSecondsFor(ev, p)} seconden` : ''}</p>` : ''}
    ${(p.assumptions || []).length ? note('check', p.assumptions.join('; '), 'Vul de kyu-graad in of markeer als gecontroleerd.') : ''}
    </div>
    <div class="modal-foot">${p.id ? `<button class="btn danger" data-act="delete" data-id="${esc(p.id)}">Verwijderen</button><div style="flex:1"></div>` : ''}<button class="btn" data-act="closeEdit">Annuleren</button><button class="btn dark l" data-act="saveEdit">Opslaan</button></div></div>`;
}

function importView(c) {
  const imp = c.ui.imp;
  if (!imp || imp.step === 'file') {
    return `<div class="card bar-blue"><h2>Ledenlijst importeren</h2>
      <ol class="big" style="margin:0;padding-left:22px;line-height:1.6">
        <li>Open de ledenlijst in Google Sheets.</li>
        <li>Kies <strong>Bestand → Downloaden → Door komma's gescheiden waarden (.csv)</strong>.</li>
        <li>Kies hieronder het bestand. De gegevens blijven op dit apparaat; er wordt niets verstuurd.</li></ol>
      <div class="row"><label class="btn primary l">${icon.upload}CSV-bestand kiezen<input type="file" accept=".csv,text/csv,.txt" data-change="csvFile" hidden></label>
        <button class="btn l" data-act="csvExample">Voorbeeldbestand gebruiken</button>
        <button class="btn l" data-act="csvTemplate">${icon.download}Leeg sjabloon downloaden</button>
        <button class="btn l" data-act="cancelImport">Annuleren</button></div>
      <details><summary class="muted" style="cursor:pointer;min-height:44px;display:flex;align-items:center">Of plak de gegevens (inclusief kopregel)</summary>
        <textarea class="input" id="csvpaste" rows="6" placeholder="Voornaam,Achternaam,Geboortedatum,…"></textarea>
        <div class="row" style="margin-top:8px"><button class="btn" data-act="csvPaste">Geplakte gegevens gebruiken</button></div></details>
      <p class="small muted">Gebruikte kolommen: naam (of voor- en achternaam), geboortedatum, jongen/meisje, kyu-graad of band, en optioneel gewicht, wedstrijdervaring en onderdelen (kata/kumite). Andere kolommen (adres, telefoon, e-mail) worden genegeerd en niet bewaard.</p></div>`;
  }
  const { parsed, map } = imp;
  const preview = buildPreview(parsed, map, c.ev.info.date, c.ev.participants);
  imp.preview = preview;
  const included = preview.filter((r, i) => (imp.include?.[i] ?? r.include)).length;
  const errs = preview.filter(r => r.issues.some(i => i.level === 'error')).length;
  const checks = preview.filter(r => r.issues.some(i => i.level === 'check')).length;
  return `<div class="card bar-blue"><div class="card-head"><h2>Stap 2 · Kolommen koppelen</h2><button class="btn" data-act="cancelImport">Annuleren</button></div>
      <p class="muted">${parsed.rows.length} rijen gevonden in "${esc(imp.fileName)}". Controleer welke kolom bij welk gegeven hoort.</p>
      <div class="form-grid">${IMPORT_FIELDS.map(f => `<label class="field"><span>${esc(f.label)}${f.required ? ' *' : ''}</span><select class="select s" data-change="mapCol" data-key="${f.key}"><option value="">— niet gebruiken —</option>${parsed.headers.map((h, i) => `<option value="${i}" ${map[f.key] === i ? 'selected' : ''}>${esc(h || `Kolom ${i + 1}`)}</option>`).join('')}</select></label>`).join('')}</div>
      ${map.name == null && map.firstName == null ? note('error', 'Er is geen kolom voor de naam gekoppeld.', 'Kies een kolom bij "Naam" of bij "Voornaam" en "Achternaam".') : ''}
      ${!c.ev.info.date ? note('warn', 'Er is nog geen wedstrijddatum.', 'Leeftijden worden berekend zodra de datum is ingevuld.') : ''}
    </div>
    <div class="card"><div class="card-head"><h2>Stap 3 · Controleren</h2>
      <span class="badge ok">${included} worden toegevoegd</span>${errs ? `<span class="badge error">${errs} met fouten</span>` : ''}${checks ? `<span class="badge warn">${checks} aannames</span>` : ''}</div>
      <p class="muted">Rijen met fouten staan standaard uit. Je kunt ze toch toevoegen en later corrigeren. Aannames (zoals "geen kyu = beginner") worden gemarkeerd zodat je ze later kunt controleren.</p>
      <div class="table-wrap"><table class="t"><thead><tr><th>Toevoegen</th><th>Rij</th><th>Naam</th><th>Geboortedatum</th><th>Leeftijd</th><th></th><th>Kyu</th><th>Kg</th><th>Onderdelen</th><th>Controle</th></tr></thead><tbody>
      ${preview.map((r, i) => {
        const on = imp.include?.[i] ?? r.include;
        const p = r.p;
        return `<tr class="${r.issues.some(x => x.level === 'error') ? 'errrow' : r.issues.some(x => x.level === 'warn') ? 'warnrow' : ''}">
          <td><label class="check"><input type="checkbox" ${on ? 'checked' : ''} data-change="toggleRow" data-i="${i}"><span class="sr-only">Rij ${r.row} toevoegen</span></label></td>
          <td class="muted num">${r.row}</td><td>${esc(p.name || '–')}</td><td>${esc(p.birthDate ? fmtDate(p.birthDate) : '–')}</td>
          <td class="num">${ageOn(p.birthDate, c.ev.info.date) ?? '–'}</td><td>${sexLabel(p.sex)}</td><td>${p.kyu ?? '–'}</td><td>${p.weight ?? '–'}</td>
          <td>${[p.kata && 'Kata', p.kumite && 'Kumite'].filter(Boolean).join(' + ') || '–'}</td>
          <td style="max-width:320px">${issueBadges(r.issues) || '<span class="badge ok">In orde</span>'}</td></tr>`;
      }).join('')}
      </tbody></table></div>
      <div class="row end"><button class="btn" data-act="cancelImport">Annuleren</button><button class="btn dark l" data-act="confirmImport" ${included ? '' : 'disabled'}>${included} deelnemers toevoegen</button></div>
    </div>`;
}

export function render(c) {
  const ev = c.ev;
  const importing = !!c.ui.imp;
  return `<main class="page">
    <div class="page-head"><div class="grow"><span class="eyebrow">Voorbereiden</span><h1>Deelnemers</h1>
      <p class="sub">${ev.participants.length} deelnemers · ${ev.participants.filter(p => p.kata).length} kata · ${ev.participants.filter(p => p.kumite).length} kumite</p></div>
      ${importing ? '' : `<div class="row"><button class="btn primary l" data-act="startImport">${icon.upload}CSV importeren</button><button class="btn l" data-act="add">${icon.plus}Deelnemer toevoegen</button><a class="btn l" href="#${esc(c.evPath('documenten', 'certificaten'))}">${icon.print}Certificaten printen</a></div>`}</div>
    ${importing ? importView(c) : (ev.participants.length ? listView(c) : `<div class="card"><h3>Nog geen deelnemers</h3><p class="big muted">Importeer de ledenlijst als CSV uit Google Sheets, of voeg deelnemers één voor één toe.</p><div class="row"><button class="btn primary l" data-act="startImport">${icon.upload}CSV importeren</button><button class="btn l" data-act="add">${icon.plus}Deelnemer toevoegen</button></div></div>`)}
    ${c.ui.editing ? editModal(c) : ''}
  </main>`;
}

function loadCsv(c, text, fileName) {
  const parsed = parseCsv(text);
  if (!parsed.headers.length || !parsed.rows.length) { c.toast('Geen gegevens gevonden. Staat er een kopregel met kolomnamen in het bestand?', 'error'); return; }
  c.ui.imp = { step: 'map', parsed, map: guessMapping(parsed.headers), fileName, include: {} };
  c.render();
}

export const actions = {
  filter(c, el) { c.ui.pFilter = el.dataset.f; c.render(); },
  search(c, el) { c.ui.pSearch = el.value; c.render(); },
  add(c) { c.ui.editing = 'new'; c.render(); },
  edit(c, el) { c.ui.editing = el.dataset.id; c.render(); },
  closeEdit(c) { c.ui.editing = null; c.render(); },
  saveEdit(c) {
    const $ = id => document.getElementById(id);
    const name = $('pe-name').value.trim();
    const birthRaw = $('pe-birth').value.trim();
    const birthDate = parseDate(birthRaw);
    if (!name) { c.toast('Vul een naam in.', 'error'); return; }
    if (birthRaw && !birthDate) { c.toast('Geboortedatum niet herkend. Gebruik bijvoorbeeld 14-03-2016.', 'error'); return; }
    const kyuV = $('pe-kyu').value;
    const w = parseFloat($('pe-weight').value.replace(',', '.'));
    const x = parseInt($('pe-exp').value, 10);
    const data = { name, birthDate, sex: $('pe-sex').value || null, kyu: kyuV === '' ? null : +kyuV, belt: $('pe-belt').value || null, weight: isNaN(w) ? null : w, experience: isNaN(x) ? null : x, kata: $('pe-kata').checked, kumite: $('pe-kumite').checked };
    if ($('pe-withdrawn')) data.withdrawn = $('pe-withdrawn').checked;
    data.assumptions = data.kyu == null ? ['Geen kyu-graad: als beginner behandeld'] : [];
    c.mutate(ev => {
      if (c.ui.editing === 'new') ev.participants.push({ id: uid('p'), checked: false, ...data });
      else { const p = ev.participants.find(p => p.id === c.ui.editing); Object.assign(p, data); if (data.kyu != null) p.checked = false; }
      c.ui.editing = null;
    });
    c.toast('Opgeslagen. Controleer bij Poules of de indeling nog klopt.');
  },
  async delete(c, el) {
    const p = c.ev.participants.find(x => x.id === el.dataset.id);
    const played = c.ev.results.some(r => { const m = c.ev.matches.find(m => m.id === r.matchId); return m && (m.redId === p.id || m.blueId === p.id); });
    if (played) { c.toast('Deze deelnemer heeft al uitslagen. Kies "Afgemeld" in plaats van verwijderen.', 'error'); return; }
    if (!await c.confirm({ title: 'Deelnemer verwijderen?', text: `${p.name} wordt uit de lijst en uit alle poules verwijderd.`, ok: 'Verwijderen', danger: true })) return;
    c.mutate(ev => {
      ev.participants = ev.participants.filter(x => x.id !== p.id);
      ev.pools.forEach(pl => { pl.participantIds = pl.participantIds.filter(id => id !== p.id); });
      ev.matches = ev.matches.filter(m => m.redId !== p.id && m.blueId !== p.id);
      c.ui.editing = null;
    });
  },
  checkAll(c) { c.mutate(ev => ev.participants.forEach(p => { if (p.kyu == null) p.checked = true; })); },
  startImport(c) { c.ui.imp = { step: 'file' }; c.render(); },
  cancelImport(c) { c.ui.imp = null; c.render(); },
  async csvFile(c, el) { const f = el.files[0]; if (f) loadCsv(c, await f.text(), f.name); },
  csvPaste(c) { loadCsv(c, document.getElementById('csvpaste').value, 'geplakte gegevens'); },
  csvExample(c) { loadCsv(c, SAMPLE_CSV, 'voorbeeld-leden.csv (fictief)'); },
  csvTemplate() { downloadFile('kuro-cup-deelnemers-sjabloon.csv', 'Voornaam,Achternaam,Geboortedatum,Jongen/meisje,Kyu-graad,Gewicht,Wedstrijdervaring,Onderdelen\n', 'text/csv'); },
  mapCol(c, el) { const v = el.value; if (v === '') delete c.ui.imp.map[el.dataset.key]; else c.ui.imp.map[el.dataset.key] = +v; c.ui.imp.include = {}; c.render(); },
  toggleRow(c, el) { c.ui.imp.include[+el.dataset.i] = el.checked; c.render(); },
  confirmImport(c) {
    const imp = c.ui.imp;
    const add = imp.preview.filter((r, i) => imp.include[i] ?? r.include).map(r => r.p);
    c.mutate(ev => { ev.participants.push(...add); }, { reason: `CSV-import (${add.length})`, snapshot: true });
    c.ui.imp = null;
    c.toast(`${add.length} deelnemers toegevoegd. Ga naar Poules om een indeling te maken.`);
    c.render();
  },
};
