// Documenten en papieren back-up: draaiboek (PDF via afdrukken), poulebladen, roosters, lijsten.
import { esc, byId, fmtTime, fmtDate, fmtDuration, ageOn, fmtDateTime } from '../util.js';
import { icon, note } from '../ui.js';
import { displayName, DISCIPLINES, ROLES, GENERAL_FIELD, beltFor, kumiteSecondsFor } from '../model.js';
import { categoryLabel, poolMatches, explainPool } from '../pools.js';
import { checkSchedule, matchesByField } from '../schedule.js';
import { coverage } from '../volunteers.js';
import { standings, resultFor } from '../results.js';
import { costSummary, euro, participantCount } from '../costs.js';
import { buildPoolForms, formPlan } from '../xlsx.js';

const DOCS = [
  ['draaiboek', 'Draaiboek', 'Programma, zaalopzet, poules per mat, vrijwilligersrooster en -verzorging, benodigdheden, prijzen, kosten en instructies. Zonder poule-indeling.'],
  ['certificaten', 'Certificaten van deelname', 'Eén certificaat per deelnemer met naam, voor mooi papier en zwarte inkt.'],
  ['formulieren', 'Poule-formulieren (Excel)', 'Het vertrouwde formulier rood/blauw: per poule een tabblad met de namen, het veldnummer (Shiao) en de datum. Om met de hand in te vullen.'],
  ['poules', 'Wedstrijdpoules (download)', 'Alle poules met deelnemers, leeftijd, band en kumitetijd, plus per poule een scoreblad.'],
  ['matoverzicht', 'Roostersamenvatting per mat', 'Per mat alleen de poules met de deelnemers in die poule.'],
  ['schema', 'Wedstrijdschema’s per veld', 'Per veld alle partijen op tijd, met rood en blauw.'],
  ['poulebladen', 'Poulebladen (score)', 'Per poule één pagina met alle onderlinge partijen, vakjes voor vlaggen en een eindstand.'],
  ['zaalopzet', 'Zaalopzet', 'Tekening van de zaalindeling op één A4.'],
  ['rooster', 'Vrijwilligersrooster', 'Wie op welk veld welke rol heeft.'],
  ['benodigdheden', 'Benodigdheden en verzorging', 'Afvinklijst op basis van velden, poules, deelnemers en vrijwilligers.'],
  ['prijzen', 'Prijzen- en bestellijst', 'Bekers, medailles, vaantjes en certificaten om te bestellen.'],
  ['kosten', 'Kostenoverzicht', 'Geschatte en werkelijke kosten van dit toernooi.'],
  ['uitslagen', 'Poulestanden en uitslagen', 'Eindstanden en prijswinnaars voor zover ingevoerd.'],
  ['instructies', 'Instructies tafel en scheidsrechters', 'Korte uitleg voor de wedstrijddag.'],
];

const rb = (ev, id, pById) => esc(displayName(pById[id]));

function header(ev, title) {
  return `<div class="pd-head"><img src="assets/logo-white-bg.png" alt=""><div><div class="pd-title">${esc(title)}</div><div class="pd-sub">${esc(ev.info.name)} · ${esc(fmtDate(ev.info.date, true))} · ${esc(ev.info.location || '')}</div></div></div>`;
}

function docProgram(ev) {
  const chk = checkSchedule(ev);
  const fields = ev.fields.map(f => { const sp = chk.fieldSpans[f.id]; return `<tr><td>${esc(f.name)}</td><td>${DISCIPLINES[f.discipline]}${sp && sp.disciplines.length > 1 ? ' → daarna ' + sp.disciplines.filter(d => d !== f.discipline).map(d => DISCIPLINES[d]).join(', ') : ''}</td><td>${sp ? `${fmtTime(sp.s)}–${fmtTime(sp.e)}` : '–'}</td><td>${ev.pools.filter(p => p.fieldId === f.id).map(p => esc(p.name)).join(', ')}</td></tr>`; }).join('');
  return `<section class="pd-sec"><h2>Evenement en programma</h2>
    <table class="pd-t kv"><tr><th>Evenement</th><td>${esc(ev.info.name)}</td></tr><tr><th>Datum</th><td>${esc(fmtDate(ev.info.date, true))}</td></tr><tr><th>Locatie</th><td>${esc(ev.info.location)}</td></tr>
    <tr><th>Tijden</th><td>Aanvang vrijwilligers ${esc(ev.info.startTime)} · eerste wedstrijd ${(() => { const st = ev.matches.filter(m => m.start != null).map(m => m.start); return st.length ? fmtTime(Math.min(...st)) : '–'; })()} · gewenst einde ${esc(ev.info.endTime)} · verwacht einde ${fmtTime(chk.finalEnd)}${chk.overrun ? ` (${fmtDuration(chk.overrun)} later)` : ''}</td></tr>
    <tr><th>Omvang</th><td>${ev.participants.length} deelnemers · ${ev.pools.length} poules · ${ev.matches.filter(m => !m.orphan).length} wedstrijden · ${ev.fields.length} velden</td></tr>
    ${ev.info.notes ? `<tr><th>Notities</th><td>${esc(ev.info.notes)}</td></tr>` : ''}</table>
    <h3>Vaste programmaonderdelen</h3><table class="pd-t"><thead><tr><th>Tijd</th><th>Onderdeel</th><th>Duur</th></tr></thead><tbody>
    ${chk.blocks.map(b => `<tr><td>${fmtTime(b.s)}–${fmtTime(b.e)}</td><td>${esc(b.title)}</td><td>${b.durationMin} min</td></tr>`).join('')}</tbody></table>
    <h3>Velden</h3><table class="pd-t"><thead><tr><th>Veld</th><th>Onderdeel</th><th>Tijd</th><th>Poules</th></tr></thead><tbody>${fields}</tbody></table></section>`;
}

function docParticipants(ev) {
  const pById = byId(ev.participants);
  return `<section class="pd-sec"><h2>Categorieën en deelnemers per poule</h2>
    ${ev.pools.map(p => { const ex = explainPool(ev, p); return `<div class="pd-keep"><h3>${esc(p.name)} — ${esc(categoryLabel(ev, p))} · ${DISCIPLINES[p.discipline]}</h3>
      <p class="pd-small">${esc(ex.reasons.join(' · '))}${ex.warnings.filter(w => !w.info).length ? ' · Let op: ' + esc(ex.warnings.filter(w => !w.info).map(w => w.text).join(' ')) : ''}</p>
      <table class="pd-t"><thead><tr><th>Naam</th><th>Leeftijd</th><th>Jongen/meisje</th><th>Band / kyu</th>${p.discipline === 'kumite' ? '<th>Kumitetijd</th>' : ''}</tr></thead><tbody>
      ${p.participantIds.map(id => pById[id]).filter(Boolean).map(x => `<tr><td>${esc(displayName(x))}</td><td>${ageOn(x.birthDate, ev.info.date)}</td><td>${x.sex === 'M' ? 'jongen' : 'meisje'}</td><td>${esc(beltFor(x))} · ${x.kyu == null ? 'geen kyu (beginner)' : x.kyu + 'e kyu'}</td>${p.discipline === 'kumite' ? `<td>${kumiteSecondsFor(ev, x)} s</td>` : ''}</tr>`).join('')}
      </tbody></table></div>`; }).join('')}</section>`;
}

function docSchedule(ev, perPage = false) {
  const pById = byId(ev.participants), poolById = byId(ev.pools);
  const byField = matchesByField(ev);
  const chk = checkSchedule(ev);
  return `<section class="pd-sec"><h2>Wedstrijdschema’s per veld</h2>
    ${ev.fields.map(f => `<div class="${perPage ? 'pd-page' : 'pd-keep'}">${perPage ? header(ev, `Wedstrijdschema · ${f.name}`) : `<h3>${esc(f.name)}</h3>`}
      <table class="pd-t"><thead><tr><th>Tijd</th><th>Poule</th><th>#</th><th>■ ROOD</th><th>□ BLAUW</th><th>Uitslag</th></tr></thead><tbody>
      ${(() => { const rows = []; const list = byField[f.id]; let bi = 0; const blocks = chk.blocks.slice();
        for (const m of list) { while (bi < blocks.length && blocks[bi].s <= m.start) { rows.push(`<tr class="pd-block"><td>${fmtTime(blocks[bi].s)}</td><td colspan="5">${esc(blocks[bi].title)} (${blocks[bi].durationMin} min)</td></tr>`); bi++; }
          const r = resultFor(ev, m.id);
          rows.push(`<tr><td>${fmtTime(m.start)}</td><td>${esc(poolById[m.poolId]?.name)}</td><td>${m.num}${m.kind === 'beslis' ? ' (beslis)' : ''}</td><td>${rb(ev, m.redId, pById)}</td><td>${rb(ev, m.blueId, pById)}</td><td>${r ? `${r.flagsRed}–${r.flagsBlue}` : ''}</td></tr>`); }
        while (bi < blocks.length) { rows.push(`<tr class="pd-block"><td>${fmtTime(blocks[bi].s)}</td><td colspan="5">${esc(blocks[bi].title)}</td></tr>`); bi++; }
        return rows.join('') || '<tr><td colspan="6">Geen wedstrijden gepland.</td></tr>'; })()}
      </tbody></table></div>`).join('')}
    ${ev.matches.some(m => m.start == null && !m.orphan) ? '<p class="pd-small"><strong>Let op:</strong> niet alle wedstrijden zijn ingepland.</p>' : ''}</section>`;
}

function docPoolSheets(ev) {
  const pById = byId(ev.participants);
  const refs = ev.settings.referees;
  return ev.pools.map(p => {
    const ms = poolMatches(ev, p.id);
    const members = p.participantIds.map(id => pById[id]).filter(Boolean);
    return `<div class="pd-page">${header(ev, `Pouleblad · ${p.name}`)}
      <p class="pd-meta"><strong>${esc(categoryLabel(ev, p))}</strong> · ${DISCIPLINES[p.discipline]}${p.discipline === 'kumite' ? ` op ${ev.settings.kumiteTarget}` : ''} · ${members.length} deelnemers · veld: ${esc(byId(ev.fields)[p.fieldId]?.name || '…………')} · ${refs} scheidsrechters</p>
      <table class="pd-t pd-score"><thead><tr><th>#</th><th>Tijd</th><th>■ ROOD</th><th>Vlaggen rood</th><th>Vlaggen blauw</th><th>□ BLAUW</th><th>Winnaar (R/B)</th></tr></thead><tbody>
      ${ms.map(m => { const r = resultFor(ev, m.id); return `<tr><td>${m.num}</td><td>${m.start != null ? fmtTime(m.start) : ''}</td><td>${rb(ev, m.redId, pById)}${m.discipline === 'kumite' ? ` <span class="pd-small">(${kumiteSecondsFor(ev, pById[m.redId])}s)</span>` : ''}</td><td class="box">${r ? r.flagsRed : ''}</td><td class="box">${r ? r.flagsBlue : ''}</td><td>${rb(ev, m.blueId, pById)}${m.discipline === 'kumite' ? ` <span class="pd-small">(${kumiteSecondsFor(ev, pById[m.blueId])}s)</span>` : ''}</td><td class="box">${r ? (r.winnerId === m.redId ? 'R' : 'B') : ''}</td></tr>`; }).join('')}
      </tbody></table>
      <h3>Eindstand</h3><p class="pd-small">Winst = 20 poulepunten, verlies = 10. Rangorde: punten, dan totaal vlaggen. Gelijk op een prijsplaats: beslispartij, anders beslissing hoofdscheidsrechter.</p>
      <table class="pd-t pd-score"><thead><tr><th>Naam</th><th>Gewonnen</th><th>Verloren</th><th>Punten</th><th>Vlaggen</th><th>Plaats</th></tr></thead><tbody>
      ${members.map(x => `<tr><td>${esc(displayName(x))}</td><td class="box"></td><td class="box"></td><td class="box"></td><td class="box"></td><td class="box"></td></tr>`).join('')}
      </tbody></table>
      <p class="pd-sign">Tafel: ……………………………… &nbsp; Hoofdscheidsrechter: ……………………………… &nbsp; Tijd afgerond: ………</p></div>`;
  }).join('');
}

function docRoster(ev) {
  const cov = coverage(ev);
  const vById = byId(ev.volunteers), fById = byId(ev.fields);
  return `<section class="pd-sec"><h2>Vrijwilligersrooster</h2>
    <p class="pd-small">Per actief veld: ${Object.entries(cov.needs).map(([r, n]) => `${n} × ${ROLES[r].label.replace(/^./, ch => ch.toLowerCase())}`).join(', ')}.</p>
    <table class="pd-t"><thead><tr><th>Blok</th><th>Veld</th>${Object.keys(cov.needs).map(r => `<th>${ROLES[r].label}</th>`).join('')}</tr></thead><tbody>
    ${cov.shifts.flatMap(s => s.activeFields.map(fid => `<tr><td>${s.label}</td><td>${esc(fById[fid]?.name)}</td>${Object.entries(cov.needs).map(([role, n]) => { const names = ev.assignments.filter(a => a.shiftIndex === s.index && a.fieldId === fid && a.role === role).map(a => esc(vById[a.volunteerId]?.name || '?')); return `<td>${names.join('<br>')}${names.length < n && role !== 'reserve' ? `<br><strong>${n - names.length} open</strong>` : ''}</td>`; }).join('')}</tr>`)).join('')}
    </tbody></table>
    <h3>EHBO (hele zaal)</h3><table class="pd-t"><thead><tr><th>Blok</th>${Object.keys(cov.eventNeeds).map(r => `<th>${ROLES[r].label}</th>`).join('')}</tr></thead><tbody>
    ${cov.shifts.filter(s => s.activeFields.length).map(s => `<tr><td>${s.label}</td>${Object.keys(cov.eventNeeds).map(role => { const names = ev.assignments.filter(a => a.shiftIndex === s.index && a.fieldId === GENERAL_FIELD && a.role === role).map(a => esc(vById[a.volunteerId]?.name || '?')); return `<td>${names.join('<br>') || '<strong>open</strong>'}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table>
    <h3>Per persoon</h3><table class="pd-t"><thead><tr><th>Naam</th><th>Rollen</th><th>Beschikbaar</th><th>Ingepland</th></tr></thead><tbody>
    ${ev.volunteers.map(v => `<tr><td>${esc(v.name)}</td><td>${v.roles.map(r => ROLES[r]?.label).join(', ')}</td><td>${esc(v.from || ev.info.startTime)}–${esc(v.to || 'einde')}</td><td>${cov.shifts.map(s => { return ev.assignments.filter(a => a.volunteerId === v.id && a.shiftIndex === s.index).map(a => `${s.label} ${esc(a.fieldId === GENERAL_FIELD ? 'hele zaal' : fById[a.fieldId]?.name || '')} (${ROLES[a.role].label.replace(/^./, ch => ch.toLowerCase())})`).join('<br>'); }).filter(Boolean).join('<br>') || '–'}</td></tr>`).join('')}
    </tbody></table></section>`;
}

export function supplyList(ev) {
  const chk = checkSchedule(ev);
  const active = Object.keys(chk.fieldSpans).length || ev.fields.length;
  const kumiteFields = ev.fields.filter(f => chk.fieldSpans[f.id]?.disciplines.includes('kumite') || (!chk.fieldSpans[f.id] && f.discipline === 'kumite')).length;
  return ev.supplies.map(s => {
    const fields = s.onlyKumite ? kumiteFields : active;
    const parts = participantCount(ev), vols = ev.volunteers.length;
    const qty = Math.ceil((s.fixed || 0) + (s.perField || 0) * fields + (s.perPool || 0) * ev.pools.length + (s.perParticipant || 0) * parts + (s.perVolunteer || 0) * vols);
    let name = s.onlyKumite ? s.name.replace('Ballen of stootkussens', ev.settings.kumiteTarget === 'bal' ? 'Ballen' : 'Stootkussens') : s.name;
    name = name.replace('{bedankje}', ev.settings.thanksGift || 'bosje bloemen');
    const basis = [s.fixed ? `${s.fixed} vast` : '', s.perField ? `${s.perField} × ${fields} ${s.onlyKumite ? 'kumitevelden' : 'velden'}` : '', s.perPool ? `${s.perPool} × ${ev.pools.length} poules` : '', s.perParticipant ? `${s.perParticipant} × ${parts} deelnemers` : '', s.perVolunteer ? `${s.perVolunteer} × ${vols} vrijwilligers` : ''].filter(Boolean).join(' + ');
    return { ...s, name, qty, basis };
  });
}

export function cateringList(ev) {
  const vols = ev.volunteers.length;
  const fields = ev.fields.length;
  return (ev.catering || []).map(x => ({ ...x, qty: Math.ceil((x.fixed || 0) + (x.perVolunteer || 0) * vols + (x.perField || 0) * fields),
    basis: [x.perVolunteer ? `${String(x.perVolunteer).replace('.', ',')} × ${vols} vrijwilligers` : '', x.fixed ? `${x.fixed} vast` : '', x.perField ? `${x.perField} × ${fields} velden` : ''].filter(Boolean).join(' + ') }));
}

function docCatering(ev) {
  return `<section class="pd-sec pd-keep"><h2>Verzorging vrijwilligers</h2><p class="pd-small">Voor ${ev.volunteers.length} vrijwilligers: per persoon 1,5 flesje water, koffiebonnen, een tussendoortje/reepje en fruit (appels en bananen), plus een pot snoep (dropjes). Bij afscheid: een bedankje (${esc(ev.settings.thanksGift || 'bosje bloemen')}).</p>
    <table class="pd-t"><thead><tr><th>✓</th><th>Wat</th><th>Aantal</th><th>Berekening</th><th>Opmerking</th></tr></thead><tbody>
    ${cateringList(ev).map(x => `<tr><td class="box"></td><td>${esc(x.name)}</td><td><strong>${x.qty}</strong></td><td class="pd-small">${esc(x.basis)}</td><td class="pd-small">${esc(x.note || '')}</td></tr>`).join('')}
    <tr><td class="box"></td><td>Bedankje: ${esc(ev.settings.thanksGift || 'bosje bloemen')}</td><td><strong>${ev.volunteers.length}</strong></td><td class="pd-small">1 × ${ev.volunteers.length} vrijwilligers</td><td></td></tr>
    </tbody></table></section>`;
}

function docZaalopzet(ev, withHeader) {
  return `<section class="pd-sec">${withHeader ? '' : '<h2>Zaalopzet</h2>'}<img class="pd-zaal" src="assets/zaalopzet.svg" alt="Zaalopzet: kleedkamers en publiek links, deelnemersbanken en administratie boven, veld 1 (kata, tatami 12 × 12 m) met tafel en drie scheidsrechters, veld 2 (kumite op de bal) met scheidsrechters links en tafel met stopwatch rechts, podium, Kuro kar en eten & drinken rechtsonder.">
    <p class="pd-small">ROOD-banden links op de tafel, BLAUW rechts. Stroomkabel naar de kumitetafel afplakken. Podium van gymkasten met gelamineerde 1, 2 en 3.</p></section>`;
}

// Poules per mat: zonder deelnemers (draaiboek) of met deelnemers (roostersamenvatting).
function docMats(ev, withParticipants) {
  const pById = byId(ev.participants);
  return `<section class="pd-sec"><h2>${withParticipants ? 'Roostersamenvatting: poules per mat' : 'Poules per mat'}</h2>
    ${ev.fields.map(f => { const pools = ev.pools.filter(p => p.fieldId === f.id).map(p => { const ms = ev.matches.filter(m => m.poolId === p.id && m.start != null); return { p, s: ms.length ? Math.min(...ms.map(m => m.start)) : null, e: ms.length ? Math.max(...ms.map(m => m.end)) : null }; }).sort((a, b) => (a.s ?? 1e9) - (b.s ?? 1e9));
      return `<div class="pd-keep"><h3>${esc(f.name)}</h3>${withParticipants ? pools.map(({ p, s, e }) => `<div class="pd-keep pd-matpool"><strong>${esc(p.name)}</strong> <span class="pd-small">${s != null ? `${fmtTime(s)}–${fmtTime(e)} · ` : ''}${p.participantIds.length} deelnemers</span>
          <div class="pd-names">${p.participantIds.map(id => pById[id]).filter(Boolean).map(x => esc(displayName(x))).join(' · ')}</div></div>`).join('')
        : `<table class="pd-t"><thead><tr><th>Tijd</th><th>Poule</th><th>Deelnemers</th><th>Partijen</th></tr></thead><tbody>${pools.map(({ p, s, e }) => `<tr><td>${s != null ? `${fmtTime(s)}–${fmtTime(e)}` : '–'}</td><td>${esc(p.name)}</td><td>${p.participantIds.length}</td><td>${poolMatches(ev, p.id).length}</td></tr>`).join('')}</tbody></table>`}
        ${!pools.length ? '<p class="pd-small">Nog geen poules op deze mat (maak de planning).</p>' : ''}</div>`; }).join('')}
    ${ev.pools.some(p => !p.fieldId) ? `<p class="pd-small"><strong>Let op:</strong> ${ev.pools.filter(p => !p.fieldId).length} poule(s) hebben nog geen mat. Maak eerst de planning.</p>` : ''}</section>`;
}

// Certificaat van deelname volgens het aangeleverde ontwerp. Alleen naam, wedstrijdnaam, datum en plaats veranderen.
export function certificatePlace(ev) {
  if (ev.info.certificatePlace) return ev.info.certificatePlace;
  const loc = (ev.info.location || '').trim();
  return loc ? (/^(de|het)\s/i.test(loc) ? loc : `de ${loc}`) : '';
}

function docCertificates(ev) {
  const list = ev.participants.filter(p => !p.withdrawn && (p.kata || p.kumite)).sort((a, b) => displayName(a).localeCompare(displayName(b)));
  if (!list.length) return '<div class="pd-page"><p>Er zijn nog geen deelnemers.</p></div>';
  const name = ev.info.name || 'Kuro Cup';
  const place = certificatePlace(ev);
  return list.map(p => `<div class="pd-page cert"><div class="cert-frame"><div class="cert-inner">
      <div class="cert-kanji" lang="ja">空<span>手</span>道</div>
      <div class="cert-rule"></div>
      <div class="cert-event">${esc(name)}</div>
      <div class="cert-title">Certificaat<br>van deelname</div>
      <div class="cert-accent"></div>
      <div class="cert-intro">Dit certificaat wordt uitgereikt aan</div>
      <div class="cert-name${displayName(p).length > 18 ? ' long' : ''}">${esc(displayName(p))}</div>
      <div class="cert-line"></div>
      <div class="cert-text">voor deelname aan de ${esc(name)}, karatewedstrijd van Dojo Kuro,<br>gehouden op ${esc(fmtDate(ev.info.date))}${place ? `<br>in ${esc(place)}.` : '.'}</div>
      <div class="cert-seal" lang="ja">黒</div>
    </div></div></div>`).join('');
}

function docCosts(ev) {
  const s = costSummary(ev);
  return `<section class="pd-sec"><h2>Kosten</h2><table class="pd-t"><thead><tr><th>Post</th><th>Aantal</th><th>Per stuk</th><th>Schatting</th><th>Werkelijk</th></tr></thead><tbody>
    ${s.lines.map(l => `<tr><td>${esc(l.label)}</td><td>${l.qty}</td><td>${euro(l.unit)}</td><td>${euro(l.est)}</td><td>${l.actual != null ? euro(l.actual) : ''}</td></tr>`).join('')}
    ${s.oneOff.map(o => `<tr><td>Eenmalig: ${esc(o.label || '–')}</td><td></td><td></td><td>${euro(o.est)}</td><td>${o.actual != null ? euro(o.actual) : ''}</td></tr>`).join('')}
    <tr><td colspan="3"><strong>Totaal</strong></td><td><strong>${euro(s.est)}</strong></td><td><strong>${s.filled ? euro(s.actual) : ''}</strong></td></tr></tbody></table>
    <p><strong>Dit toernooi kost: ${euro(s.final)}</strong>${s.filled < s.count ? ' (werkelijke bedragen waar ingevuld, anders de schatting)' : ''}.</p></section>`;
}

function docSupplies(ev) {
  return `<section class="pd-sec"><h2>Benodigdheden</h2><p class="pd-small">Inclusief 1 tablet/laptop met de app per tafel, bedankjes voor vrijwilligers en gelamineerde A4's met 1, 2 en 3 voor het podium.</p><table class="pd-t"><thead><tr><th>✓</th><th>Artikel</th><th>Aantal</th><th>Berekening</th><th>Opmerking</th></tr></thead><tbody>
    ${supplyList(ev).map(s => `<tr><td class="box"></td><td>${esc(s.name)}</td><td><strong>${s.qty}</strong></td><td class="pd-small">${esc(s.basis)}</td><td class="pd-small">${esc(s.note || '')}</td></tr>`).join('')}</tbody></table></section>`;
}

export function prizeList(ev) {
  const n = ev.pools.length, places = ev.settings.prizePlaces;
  const rows = [];
  for (let i = 1; i <= places; i++) rows.push({ place: `${i}e plaats`, type: ev.settings.prizeTypes[i] || `Prijs ${i}`, qty: n });
  if (ev.settings.participationMedal) rows.push({ place: 'Deelname', type: 'Deelnamemedaille', qty: ev.participants.filter(p => !p.withdrawn && (p.kata || p.kumite)).length });
  const byType = {};
  rows.forEach(r => { byType[r.type] = (byType[r.type] || 0) + r.qty; });
  return { rows, byType, total: rows.reduce((t, r) => t + r.qty, 0), pools: n };
}

function docPrizes(ev) {
  const pl = prizeList(ev);
  const parts = participantCount(ev);
  return `<section class="pd-sec"><h2>Prijzen- en bestellijst</h2>
    <h3>Voor iedere deelnemer (${parts})</h3><table class="pd-t"><thead><tr><th>Artikel</th><th>Aantal</th><th>Besteld ✓</th></tr></thead><tbody>
    <tr><td>Deelnemersvaantje</td><td><strong>${parts}</strong></td><td class="box"></td></tr>
    <tr><td>Certificaat van deelname (mooi papier, zelf printen)</td><td><strong>${parts}</strong> + 3 reserve</td><td class="box"></td></tr></tbody></table>
    <h3>Prijzen per poule</h3><p class="pd-small">${pl.pools} poules (${ev.pools.filter(p => p.discipline === 'kata').length} kata, ${ev.pools.filter(p => p.discipline === 'kumite').length} kumite; aparte prijzen per onderdeel) × ${ev.settings.prizePlaces} prijsplaatsen. Bij een gedeelde plaats kan een extra prijs nodig zijn; bestel eventueel een kleine reserve.</p>
    <table class="pd-t"><thead><tr><th>Plaats</th><th>Prijs</th><th>Aantal</th></tr></thead><tbody>${pl.rows.map(r => `<tr><td>${r.place}</td><td>${esc(r.type)}</td><td>${r.qty}</td></tr>`).join('')}</tbody></table>
    <h3>Bestellijst per soort</h3><table class="pd-t"><thead><tr><th>Prijssoort</th><th>Aantal</th><th>Besteld ✓</th></tr></thead><tbody>${Object.entries(pl.byType).map(([t, q]) => `<tr><td>${esc(t)}</td><td><strong>${q}</strong></td><td class="box"></td></tr>`).join('')}
    <tr><td><strong>Totaal</strong></td><td><strong>${pl.total}</strong></td><td></td></tr></tbody></table></section>`;
}

function docResults(ev) {
  const any = ev.pools.some(p => standings(ev, p).done);
  return `<section class="pd-sec"><h2>Poulestanden en uitslagen</h2>${any ? '' : '<p>Nog geen uitslagen ingevoerd. Gebruik de poulebladen als papieren back-up.</p>'}
    ${ev.pools.map(p => { const st = standings(ev, p); if (!st.done) return ''; return `<div class="pd-keep"><h3>${esc(p.name)} — ${esc(categoryLabel(ev, p))} ${st.complete ? (st.pending ? '(beslissing nodig)' : '(afgerond)') : `(${st.done}/${st.total})`}</h3>
      <table class="pd-t"><thead><tr><th>Plaats</th><th>Naam</th><th>Gespeeld</th><th>Punten</th><th>Vlaggen</th></tr></thead><tbody>${st.rows.map(r => `<tr><td>${r.pos}${st.complete && r.pos <= ev.settings.prizePlaces && !st.pending ? ' ★' : ''}</td><td>${esc(r.name)}</td><td>${r.played}</td><td>${r.points}</td><td>${r.flags}</td></tr>`).join('')}</tbody></table>
      ${st.decision ? `<p class="pd-small">Beslissing ${esc(st.decision.referee)} (${esc(fmtDateTime(st.decision.at))}): ${esc(st.decision.note || '')}</p>` : ''}</div>`; }).join('')}</section>`;
}

function docInstructions(ev) {
  const s = ev.settings;
  return `<section class="pd-sec"><h2>Instructies wedstrijddag</h2>
    <h3>Tafelmedewerkers</h3><ol>
      <li>Open de app en kies <strong>Wedstrijd live</strong>. Kies bovenaan je veld. Vul je naam in bij "Tafel".</li>
      <li>Links staat de <strong>actieve poule</strong> (op de tatami), rechts de <strong>volgende poule</strong>. Roep met "Oproepen" de volgende deelnemers op en laat de helpers de rode en blauwe band omdoen.</li>
      <li>Na de partij: tik op de <strong>winnaar</strong>. De vlaggen staan dan op ${s.referees}–0. Pas met <strong>+ en −</strong> aan wat de scheidsrechters lieten zien; het totaal blijft altijd ${s.referees}.</li>
      <li>Controleer de regel onder de deelnemers en tik op <strong>Uitslag bevestigen</strong>. De app wisselt daarna naar de andere poule.</li>
      <li>Fout gemaakt? Tik bij "Laatst afgerond" op <strong>Wijzigen</strong>, of open "Volledig poule-schema" en kies <strong>Corrigeren</strong>. Je naam en het tijdstip worden bewaard.</li>
      <li>Kumite: tik <strong>Hajime</strong> om de tijd te starten en <strong>Yame</strong> om te stoppen. Tijd: ${s.kumiteYoungSec} s t/m ${s.kumiteYoungMaxAge} jaar, ${s.kumiteOldSec} s vanaf ${s.kumiteYoungMaxAge + 1} jaar.</li>
      <li>Valt de tablet uit? Ga verder op het geprinte pouleblad en voer de uitslagen later in.</li>
      <li>Aan het eind: <strong>Gegevens delen → JSON exporteren</strong> en geef het bestand aan de organisatie.</li></ol>
    <h3>Scheidsrechters</h3><ul>
      <li>${s.referees} scheidsrechters per partij, ieder met een rode en een blauwe vlag. Op het teken steekt iedereen tegelijk de vlag van de winnaar op.</li>
      <li>Kata: beoordeel de uitvoering. Winnaar krijgt 20 poulepunten, verliezer 10. Elke vlag telt mee voor de eindstand bij gelijke punten.</li>
      <li>Kumite op ${s.kumiteTarget === 'bal' ? 'de bal' : 'het stootkussen'}: beide deelnemers werken tegelijk op hun eigen ${s.kumiteTarget}, zonder elkaar te raken. Let op snelheid, kracht, lenigheid, afstand, balans, controle, techniek en sportiviteit. Hoge techniek telt alleen extra als die goed en gecontroleerd is.</li>
      <li>Roep "Hajime" bij de start en "Yame" bij het einde van de tijd.</li>
      <li>Te weinig scheidsrechters? ${s.allowEmergencySingleReferee ? 'In nood mag één scheidsrechter beslissen; meld dit aan de tafel (noodoptie).' : 'Meld dit bij de organisatie; de noodoptie met één scheidsrechter staat uit.'}</li>
      <li>Gelijke stand op een prijsplaats na alle partijen: eerst een beslispartij; kan dat niet, dan beslist de hoofdscheidsrechter en wordt dit met naam en toelichting vastgelegd.</li></ul>
    <h3>Helpers</h3><ul><li>Zet de volgende deelnemers klaar, help met de rode/blauwe band en breng ze naar de juiste kant: ROOD links van de tafel, BLAUW rechts.</li></ul></section>`;
}

function docFull(ev) {
  return `<div class="pd-page">${header(ev, 'Draaiboek')}${docProgram(ev)}</div>
    <div class="pd-page">${docZaalopzet(ev)}</div>
    <div class="pd-page">${docMats(ev, false)}</div>
    <div class="pd-page">${docRoster(ev)}</div>
    <div class="pd-page">${docCatering(ev)}${docSupplies(ev)}</div>
    <div class="pd-page">${docPrizes(ev)}${docCosts(ev)}</div>
    <div class="pd-page">${docInstructions(ev)}</div>`;
}

function buildDoc(ev, key) {
  switch (key) {
    case 'draaiboek': return docFull(ev);
    case 'schema': return docSchedule(ev, true);
    case 'certificaten': return docCertificates(ev);
    case 'poules': return `<div class="pd-page">${header(ev, 'Wedstrijdpoules')}${docParticipants(ev)}</div>${docPoolSheets(ev)}`;
    case 'matoverzicht': return `<div class="pd-page">${header(ev, 'Roostersamenvatting per mat')}${docMats(ev, true)}</div>`;
    case 'zaalopzet': return `<div class="pd-page">${header(ev, 'Zaalopzet')}${docZaalopzet(ev, true)}</div>`;
    case 'kosten': return `<div class="pd-page">${header(ev, 'Kostenoverzicht')}${docCosts(ev)}</div>`;
    case 'poulebladen': return docPoolSheets(ev);
    case 'deelnemers': return `<div class="pd-page">${header(ev, 'Categorieën en deelnemers')}${docParticipants(ev)}</div>`;
    case 'rooster': return `<div class="pd-page">${header(ev, 'Vrijwilligersrooster')}${docRoster(ev)}</div>`;
    case 'benodigdheden': return `<div class="pd-page">${header(ev, 'Benodigdheden en verzorging')}${docSupplies(ev)}${docCatering(ev)}</div>`;
    case 'prijzen': return `<div class="pd-page">${header(ev, 'Prijzen')}${docPrizes(ev)}</div>`;
    case 'uitslagen': return `<div class="pd-page">${header(ev, 'Uitslagen')}${docResults(ev)}</div>`;
    case 'instructies': return `<div class="pd-page">${header(ev, 'Instructies')}${docInstructions(ev)}</div>`;
  }
  return '';
}

export function render(c) {
  const ev = c.ev;
  const key = c.args[0];
  if (key) {
    const d = DOCS.find(x => x[0] === key);
    const intro = key === 'certificaten' ? `${ev.participants.filter(p => !p.withdrawn).length} certificaten, één per pagina. Leg het mooie papier in de printer, kies A4 in kleur (naam blauw, stempel rood), marges "Standaard" en geen schaal aanpassen.` : 'Kies "Afdrukken / PDF". Kies in het afdrukvenster A4 en eventueel "Bewaar als PDF".';
    return `<main class="page"><div class="page-head no-print"><div class="grow"><span class="eyebrow">Documenten</span><h1>${esc(d?.[1] || '')}</h1><p class="sub">${esc(intro)}</p></div>
      <div class="row"><a class="btn l" href="#${esc(c.evPath('documenten'))}">${icon.back}Terug</a>${key === 'poules' || key === 'poulebladen' ? `<button class="btn l" data-act="exportForms">${icon.download}Poule-formulieren (Excel)</button>` : ''}<button class="btn dark l" data-act="print">${icon.print}Afdrukken / PDF</button></div></div>
 ${!ev.matches.some(m => m.start != null) && !['instructies', 'certificaten', 'zaalopzet', 'kosten', 'prijzen'].includes(key) ? `<div class="no-print">${note('warn', 'Er is nog geen planning gemaakt; tijden en velden ontbreken in het document.', 'Maak eerst de planning voor een volledig document.')}</div>` : ''}
      <div class="print-doc">${buildDoc(ev, key)}</div></main>`;
  }
  const pl = prizeList(ev);
  return `<main class="page">
    <div class="page-head"><div class="grow"><span class="eyebrow">Wedstrijddag</span><h1>Documenten & printen</h1><p class="sub">Alle documenten zijn leesbaar in zwart-wit en geschikt voor A4. Ze vormen de papieren back-up als een tablet uitvalt.</p></div>
      <div class="row"><a class="btn dark l" href="#${esc(c.evPath('documenten', 'certificaten'))}">${icon.print}Certificaten printen</a><a class="btn primary l" href="#${esc(c.evPath('documenten', 'draaiboek'))}">${icon.print}Draaiboek</a></div></div>
    ${formsNote(ev)}
    <div class="grid three">${DOCS.map(([k, t, d]) => k === 'formulieren'
      ? `<button class="tile" data-act="exportForms"><h3>${esc(t)}</h3><p class="muted">${esc(d)}</p><span class="link-arrow">${icon.download} Excel downloaden</span></button>`
      : `<a class="tile ${k === 'draaiboek' ? 'current' : ''}" href="#${esc(c.evPath('documenten', k))}"><h3>${esc(t)}</h3><p class="muted">${esc(d)}</p><span class="link-arrow">Bekijken en printen ${icon.arrow}</span></a>`).join('')}</div>
    <div class="grid two">
      <div class="card"><h3>Prijzen (${pl.total} totaal)</h3><table class="t"><tbody>${Object.entries(pl.byType).map(([t, q]) => `<tr><td>${esc(t)}</td><td class="right num"><strong>${q}</strong></td></tr>`).join('')}</tbody></table><p class="small muted">Gebaseerd op ${pl.pools} poules × ${ev.settings.prizePlaces} plaatsen. Aanpassen bij Evenement > Prijzen.</p></div>
      <div class="card"><h3>Benodigdheden</h3><table class="t"><tbody>${supplyList(ev).map(s => `<tr><td>${esc(s.name)}</td><td class="right num"><strong>${s.qty}</strong></td></tr>`).join('')}</tbody></table></div>
    </div></main>`;
}

function formsNote(ev) {
  const { skipped } = formPlan(ev);
  const big = skipped.filter(x => x.reason !== 'lege poule');
  return big.length ? note('warn', `${big.length} poule(s) passen niet in het Excel-formulier (meer dan 8 deelnemers): ${big.map(x => x.pool.name).join(', ')}.`, 'Splits deze poules bij Poules, of gebruik voor deze poules het pouleblad uit de app.') : '';
}

// Ook gebruikt vanaf het poulescherm.
export async function exportPoolForms(c) {
  try {
    if (!c.ev.matches.some(m => m.start != null)) c.toast('Let op: er is nog geen planning, dus het veldnummer (Shiao) blijft leeg.');
    const res = await buildPoolForms(c.ev);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(res.blob); a.download = res.fileName;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    const big = res.skipped.filter(x => x.reason !== 'lege poule');
    c.toast(`${res.sheets.length} poule-formulieren in Excel gezet${big.length ? `; ${big.length} poule(s) overgeslagen (te groot)` : ''}.`, big.length ? 'error' : '');
  } catch (err) { c.toast('Excel maken lukte niet: ' + err.message, 'error'); }
}

export const actions = { print() { window.print(); }, exportForms: c => exportPoolForms(c) };
