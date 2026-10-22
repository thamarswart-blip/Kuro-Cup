// Evenementgegevens, velden, programma, wedstrijdregels, prijzen en benodigdheden.
import { esc, uid, parseTime } from '../util.js';
import { icon, note } from '../ui.js';
import { DISCIPLINES } from '../model.js';
import { syncLegs } from '../pools.js';

const inp = (path, value, { type = 'text', label, hint = '', attrs = '', cls = '' } = {}) =>
  `<label class="field ${cls}"><span>${esc(label)}${hint ? ` <span class="hint">${esc(hint)}</span>` : ''}</span><input class="input" type="${type}" value="${esc(value ?? '')}" data-change="set" data-path="${esc(path)}" data-type="${type}" ${attrs}></label>`;
const chk = (path, value, label) => `<label class="check"><input type="checkbox" ${value ? 'checked' : ''} data-change="set" data-path="${esc(path)}" data-type="bool">${esc(label)}</label>`;

export function render(c) {
  const ev = c.ev, s = ev.settings;
  const tab = c.ui.settingsTab || 'algemeen';
  const tabs = [['algemeen', 'Algemeen'], ['velden', 'Velden'], ['programma', 'Programma'], ['regels', 'Wedstrijdregels'], ['prijzen', 'Prijzen & benodigdheden']];
  let body = '';
  if (tab === 'algemeen') body = `<div class="card"><h3>Evenementgegevens</h3><div class="form-grid">
      ${inp('info.name', ev.info.name, { label: 'Naam' })}
      ${inp('info.date', ev.info.date, { type: 'date', label: 'Wedstrijddatum', hint: '(bepaalt leeftijd)' })}
      ${inp('info.location', ev.info.location, { label: 'Locatie' })}
      ${inp('info.startTime', ev.info.startTime, { type: 'time', label: 'Aanvang dag', hint: '(vrijwilligers aanwezig)' })}
      ${inp('info.endTime', ev.info.endTime, { type: 'time', label: 'Gewenste eindtijd' })}
      ${inp('info.organizer', ev.info.organizer, { label: 'Organisatie' })}
      ${inp('info.certificatePlace', ev.info.certificatePlace || '', { label: 'Plaats op certificaat', hint: '(bijv. "de Banninghal te Soesterberg")', attrs: `placeholder="${esc(ev.info.location ? 'de ' + ev.info.location : 'de Banninghal te Soesterberg')}"` })}
    </div>
    <label class="field"><span>Notities voor het draaiboek</span><textarea class="input" rows="3" data-change="set" data-path="info.notes">${esc(ev.info.notes || '')}</textarea></label>
    ${!ev.info.date ? note('warn', 'Er is nog geen wedstrijddatum.', 'Zonder datum kan de leeftijd (en dus de kumitetijd en indeling) niet worden berekend.') : ''}</div>`;

  if (tab === 'velden') body = `<div class="card"><div class="card-head"><h3>Velden / matten</h3><button class="btn" data-act="addField">${icon.plus}Veld toevoegen</button></div>
    <p class="muted">Standaard is er één kata-veld en één kumite-veld. Een veld mag later op de dag het andere onderdeel overnemen zodra het eigen onderdeel klaar is. Er worden nooit twee wedstrijden tegelijk op hetzelfde veld gepland.</p>
    <div class="table-wrap"><table class="t"><thead><tr><th>Naam</th><th>Begint met</th><th>Mag ander onderdeel overnemen</th><th></th></tr></thead><tbody>
    ${ev.fields.map((f, i) => `<tr><td><input class="input s" value="${esc(f.name)}" data-change="set" data-path="fields.${i}.name"></td>
      <td><select class="select s" data-change="set" data-path="fields.${i}.discipline">${Object.entries(DISCIPLINES).map(([k, l]) => `<option value="${k}" ${f.discipline === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td><label class="check"><input type="checkbox" ${f.flexible ? 'checked' : ''} data-change="set" data-path="fields.${i}.flexible" data-type="bool">Ja</label></td>
      <td class="right"><button class="btn s danger" data-act="delField" data-i="${i}">Verwijderen</button></td></tr>`).join('')}
    </tbody></table></div>
    ${chk('settings.fieldSwitching', s.fieldSwitching, 'Velden mogen na afloop van hun eigen onderdeel het andere onderdeel overnemen')}
    ${!ev.fields.some(f => f.discipline === 'kata') || !ev.fields.some(f => f.discipline === 'kumite') ? note('warn', 'Niet elk onderdeel heeft een eigen veld.', 'Dat mag, maar zorg dan dat "mag ander onderdeel overnemen" aan staat.') : ''}
    <p class="small muted">Na wijzigen van velden: ga naar Planning en kies "Planning maken" om het schema bij te werken.</p></div>`;

  if (tab === 'programma') body = `<div class="card"><div class="card-head"><h3>Vaste programmaonderdelen</h3><button class="btn" data-act="addProgram">${icon.plus}Onderdeel toevoegen</button></div>
    <p class="muted">Zaal klaarzetten, vrijwilligersoverleg, opening, pauzes, demonstratie en prijsuitreiking. Tijdens deze blokken worden geen wedstrijden gepland. Onderdelen "na de laatste wedstrijd" volgen elkaar op in deze volgorde (bijv. eerst de demonstratie, dan de prijsuitreiking).</p>
    <div class="table-wrap"><table class="t"><thead><tr><th>Onderdeel</th><th>Starttijd</th><th>Duur (min)</th><th>Na laatste wedstrijd</th><th></th></tr></thead><tbody>
    ${ev.program.map((p, i) => `<tr><td><input class="input s" value="${esc(p.title)}" data-change="set" data-path="program.${i}.title"></td>
      <td><input class="input s" type="time" value="${esc(p.start || '')}" ${p.afterMatches ? 'disabled' : ''} data-change="set" data-path="program.${i}.start" data-type="time"></td>
      <td><input class="input s" type="number" min="0" step="5" value="${p.durationMin}" data-change="set" data-path="program.${i}.durationMin" data-type="number" style="max-width:110px"></td>
      <td><label class="check"><input type="checkbox" ${p.afterMatches ? 'checked' : ''} data-change="set" data-path="program.${i}.afterMatches" data-type="bool">Ja</label></td>
      <td class="right"><button class="btn s danger" data-act="delProgram" data-i="${i}">Verwijderen</button></td></tr>`).join('')}
    </tbody></table></div></div>`;

  if (tab === 'regels') body = `<div class="grid two">
    <div class="card"><h3>Poules</h3>
      ${chk('settings.linkedPools', s.linkedPools !== false, 'Kata en kumite gelijk indelen (standaard; aparte prijzen per onderdeel)')}
      <div class="form-grid">
      ${inp('settings.poolTarget', s.poolTarget, { type: 'number', label: 'Gewenste poulegrootte', attrs: 'min="3" max="8"' })}
      ${inp('settings.poolMax', s.poolMax, { type: 'number', label: 'Maximaal per poule', attrs: 'min="3" max="12"' })}
      ${inp('settings.poolMin', s.poolMin, { type: 'number', label: 'Waarschuwen onder', attrs: 'min="2" max="6"' })}
      ${inp('settings.prizePlaces', s.prizePlaces, { type: 'number', label: 'Prijsplaatsen per poule', attrs: 'min="1" max="4"' })}
      ${inp('settings.doubleRoundUpTo', s.doubleRoundUpTo ?? 3, { type: 'number', label: 'Twee keer tegen elkaar t/m', hint: '(deelnemers per poule)', attrs: 'min="0" max="5"' })}
    </div></div>
    <div class="card"><h3>Kata</h3><div class="form-grid">
      ${inp('settings.kataMatchSec', s.kataMatchSec / 60, { type: 'number', label: 'Minuten per wedstrijd', hint: '(incl. wissel en uitslag)', attrs: 'min="1" step="0.5" data-scale="60"' })}
    </div><p class="small muted">Drie scheidsrechters per wedstrijd met rode en blauwe vlaggen. Winnaar 20 poulepunten, verliezer 10.</p></div>
    <div class="card"><h3>Kumite op ${s.kumiteTarget === 'bal' ? 'de bal' : 'het stootkussen'}</h3>
      <div class="seg" role="group" aria-label="Kumite op">
        <button class="${s.kumiteTarget === 'bal' ? 'on' : ''}" data-act="setTarget" data-v="bal">Bal</button>
        <button class="${s.kumiteTarget === 'stootkussen' ? 'on' : ''}" data-act="setTarget" data-v="stootkussen">Stootkussen</button></div>
      <div class="form-grid">
      ${inp('settings.kumiteYoungSec', s.kumiteYoungSec, { type: 'number', label: `Seconden t/m ${s.kumiteYoungMaxAge} jaar`, attrs: 'min="10" step="5"' })}
      ${inp('settings.kumiteOldSec', s.kumiteOldSec, { type: 'number', label: `Seconden vanaf ${s.kumiteYoungMaxAge + 1} jaar`, attrs: 'min="10" step="5"' })}
      ${inp('settings.kumiteOverheadSec', s.kumiteOverheadSec / 60, { type: 'number', label: 'Wissel + uitslag (min)', attrs: 'min="0" step="0.5" data-scale="60"' })}
      </div><p class="small muted">De kumitetijd volgt altijd de werkelijke leeftijd op de wedstrijddatum, ook als een deelnemer handmatig in een andere poule staat.</p></div>
    <div class="card"><h3>Scheidsrechters & planning</h3><div class="form-grid">
      ${inp('settings.crossFieldBufferSec', s.crossFieldBufferSec / 60, { type: 'number', label: 'Minuten tussen velden', hint: '(deelnemer wisselt veld)', attrs: 'min="0" step="1" data-scale="60"' })}
      ${inp('settings.shiftMinutes', s.shiftMinutes, { type: 'number', label: 'Lengte vrijwilligersblok (min)', attrs: 'min="15" step="15"' })}
      ${inp('settings.maxConsecutiveShifts', s.maxConsecutiveShifts, { type: 'number', label: 'Max. blokken achter elkaar', hint: '(daarna pauze)', attrs: 'min="1" max="8"' })}
      </div>
      <label class="field"><span>Vrijwilligers inplannen</span><select class="select" data-change="set" data-path="settings.rosterMode"><option value="heledag" ${s.rosterMode !== 'blokken' ? 'selected' : ''}>Hele dag, van begin tot eind (standaard)</option><option value="blokken" ${s.rosterMode === 'blokken' ? 'selected' : ''}>In tijdsblokken met roulatie en pauzes</option></select></label>
      ${chk('settings.useReserveReferee', s.useReserveReferee, 'Reserve-scheidsrechter per veld inplannen (roulatie)')}
      ${chk('settings.allowEmergencySingleReferee', s.allowEmergencySingleReferee, 'Noodoptie toestaan: wedstrijd met één scheidsrechter')}
      ${s.allowEmergencySingleReferee ? note('warn', 'Noodoptie staat aan.', 'De standaard blijft drie scheidsrechters. Vlaggen vergelijken voor de eindstand is alleen betrouwbaar als wedstrijden met een vergelijkbaar aantal scheidsrechters zijn beoordeeld; de app waarschuwt bij gemengde poules.') : ''}
    </div></div>`;

  if (tab === 'prijzen') body = `<div class="grid two">
    <div class="card"><h3>Prijzen per plaats</h3>
      ${[1, 2, 3, 4].slice(0, s.prizePlaces).map(n => inp(`settings.prizeTypes.${n}`, s.prizeTypes[n] || '', { label: `${n}e plaats` })).join('')}
      ${chk('settings.participationMedal', s.participationMedal, 'Ook een deelnamemedaille voor iedere deelnemer')}
      <p class="small muted">Iedere deelnemer krijgt standaard een deelnemersvaantje en een certificaat van deelname.</p>
      ${inp('settings.thanksGift', s.thanksGift || '', { label: 'Bedankje voor vrijwilligers', hint: '(bijv. bosje bloemen)' })}
      <p class="small muted">Aantallen worden berekend op het aantal poules (zie Documenten > Prijzen- en bestellijst).</p></div>
    <div class="card"><div class="card-head"><h3>Benodigdheden</h3><button class="btn s" data-act="addSupply">${icon.plus}Toevoegen</button></div>
      <p class="small muted">Aantal = vast aantal + aantal per actief veld (+ per poule voor formulieren).</p>
      <div class="table-wrap"><table class="t"><thead><tr><th>Artikel</th><th>Vast</th><th>Per veld</th><th>Per poule</th><th></th></tr></thead><tbody>
      ${ev.supplies.map((x, i) => `<tr><td><input class="input s" value="${esc(x.name)}" data-change="set" data-path="supplies.${i}.name"></td>
        <td><input class="input s" type="number" min="0" value="${x.fixed || 0}" data-change="set" data-path="supplies.${i}.fixed" data-type="number" style="width:76px"></td>
        <td><input class="input s" type="number" min="0" value="${x.perField || 0}" data-change="set" data-path="supplies.${i}.perField" data-type="number" style="width:76px"></td>
        <td><input class="input s" type="number" min="0" value="${x.perPool || 0}" data-change="set" data-path="supplies.${i}.perPool" data-type="number" style="width:76px"></td>
        <td><button class="btn s danger" data-act="delSupply" data-i="${i}" aria-label="Verwijderen">${icon.close}</button></td></tr>`).join('')}
      </tbody></table></div></div></div>
    <div class="card"><div class="card-head"><h3>Verzorging vrijwilligers</h3><button class="btn s" data-act="addCatering">${icon.plus}Toevoegen</button></div>
      <p class="small muted">Komt in het draaiboek. Aantal = per vrijwilliger × aantal vrijwilligers + vast aantal.</p>
      <div class="table-wrap"><table class="t"><thead><tr><th>Wat</th><th>Per vrijwilliger</th><th>Vast</th><th></th></tr></thead><tbody>
      ${(ev.catering || []).map((x, i) => `<tr><td><input class="input s" value="${esc(x.name)}" data-change="set" data-path="catering.${i}.name"></td>
        <td><input class="input s" type="number" min="0" step="0.5" value="${x.perVolunteer || 0}" data-change="set" data-path="catering.${i}.perVolunteer" data-type="number" style="width:90px"></td>
        <td><input class="input s" type="number" min="0" value="${x.fixed || 0}" data-change="set" data-path="catering.${i}.fixed" data-type="number" style="width:80px"></td>
        <td><button class="btn s danger" data-act="delCatering" data-i="${i}" aria-label="Verwijderen">${icon.close}</button></td></tr>`).join('')}
      </tbody></table></div></div>`;

  return `<main class="page">
    <div class="page-head"><div class="grow"><span class="eyebrow">Voorbereiden</span><h1>Evenement & velden</h1><p class="sub">Wijzigingen worden direct op dit apparaat bewaard.</p></div></div>
    <div class="seg" role="tablist">${tabs.map(([k, l]) => `<button role="tab" class="${tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div>
    ${body}
  </main>`;
}

export function setPath(obj, path, value) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = value;
}

export const actions = {
  tab(c, el) { c.ui.settingsTab = el.dataset.tab; c.render(); },
  set(c, el) {
    const t = el.dataset.type;
    let v = el.value;
    if (t === 'bool') v = el.checked;
    else if (t === 'number') { v = parseFloat(String(v).replace(',', '.')); if (isNaN(v)) { c.toast('Vul een getal in.', 'error'); return; } if (el.dataset.scale) v = Math.round(v * +el.dataset.scale); }
    else if (t === 'time' && v && parseTime(v) == null) { c.toast('Gebruik een tijd als 09:30.', 'error'); return; }
    c.mutate(ev => {
      setPath(ev, el.dataset.path, v);
      if (el.dataset.path === 'settings.doubleRoundUpTo' && syncLegs(ev)) c.toast('Wedstrijden bijgewerkt. Maak de planning opnieuw.');
    });
  },
  setTarget(c, el) { c.mutate(ev => { ev.settings.kumiteTarget = el.dataset.v; }); },
  addField(c) { c.mutate(ev => { const n = ev.fields.length + 1; ev.fields.push({ id: uid('f'), name: `Veld ${n}`, discipline: n % 2 ? 'kata' : 'kumite', flexible: true }); }); },
  async delField(c, el) {
    const f = c.ev.fields[+el.dataset.i];
    const used = c.ev.matches.filter(m => m.fieldId === f.id).length;
    if (!await c.confirm({ title: `${f.name} verwijderen?`, text: used ? `Er staan ${used} wedstrijden op dit veld. Die moeten daarna opnieuw worden ingepland.` : 'Het veld wordt verwijderd.', ok: 'Verwijderen', danger: true })) return;
    c.mutate(ev => { ev.fields.splice(+el.dataset.i, 1); ev.pools.forEach(p => { if (p.pinnedFieldId === f.id) p.pinnedFieldId = null; }); });
  },
  addProgram(c) { c.mutate(ev => ev.program.push({ id: uid('p'), title: 'Nieuw onderdeel', kind: 'overig', start: '12:00', durationMin: 15, afterMatches: false })); },
  delProgram(c, el) { c.mutate(ev => ev.program.splice(+el.dataset.i, 1)); },
  addCatering(c) { c.mutate(ev => ev.catering.push({ id: uid('c'), name: 'Nieuw', perVolunteer: 1, fixed: 0, note: '' })); },
  delCatering(c, el) { c.mutate(ev => ev.catering.splice(+el.dataset.i, 1)); },
  addSupply(c) { c.mutate(ev => ev.supplies.push({ id: uid('s'), name: 'Nieuw artikel', fixed: 1, perField: 0, perPool: 0 })); },
  delSupply(c, el) { c.mutate(ev => ev.supplies.splice(+el.dataset.i, 1)); },
};
