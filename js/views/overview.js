// Overzicht van één evenement: stappenplan met status en aandachtspunten.
import { esc, fmtTime, fmtDate } from '../util.js';
import { icon, note } from '../ui.js';
import { participantIssues } from '../csv.js';
import { explainPool, unassigned } from '../pools.js';
import { checkSchedule } from '../schedule.js';
import { coverage, missingRoles } from '../volunteers.js';
import { ROLES } from '../model.js';
import { costSummary, euro } from '../costs.js';
import { standings } from '../results.js';

export function status(ev) {
  const pIssues = ev.participants.map(p => participantIssues(p, ev.info.date)).filter(x => x.some(i => i.level === 'error')).length;
  const pChecks = ev.participants.filter(p => participantIssues(p, ev.info.date).some(i => i.level === 'check')).length;
  const poolWarn = ev.pools.reduce((n, p) => n + explainPool(ev, p).warnings.filter(w => !w.confirmed && !w.info).length, 0);
  const un = unassigned(ev, 'kata').length + unassigned(ev, 'kumite').length;
  const sched = checkSchedule(ev);
  const cov = ev.volunteers.length ? coverage(ev) : null;
  const missing = missingRoles(ev);
  const st = ev.pools.map(p => standings(ev, p));
  return { pIssues, pChecks, poolWarn, un, sched, cov, st, missing,
    results: ev.results.length, matches: ev.matches.filter(m => !m.orphan).length,
    complete: st.filter(s => s.complete && !s.pending).length, pending: st.filter(s => s.pending).length };
}

export function render(c) {
  const ev = c.ev;
  const s = status(ev);
  const infoOk = ev.info.date && ev.info.location;
  const step = (n, view, title, text, state) => `<a class="step ${state}" href="#${esc(c.evPath(view))}"><span class="n">${n}</span><span class="b"><strong>${esc(title)}</strong><span>${esc(text)}</span></span></a>`;
  const schedErrors = s.sched.issues.filter(i => i.level === 'error').length;
  const gaps = s.cov ? s.cov.gaps.filter(g => !g.optional).length : null;

  const steps = [
    step(1, 'evenement', 'Evenement & velden', infoOk ? `${fmtDate(ev.info.date)} · ${ev.fields.length} velden · ${ev.program.length} programmaonderdelen` : 'Vul datum en locatie in — de leeftijd wordt op de wedstrijddatum berekend.', infoOk ? 'done' : 'todo'),
    step(2, 'deelnemers', 'Deelnemers', ev.participants.length ? `${ev.participants.length} deelnemers${s.pIssues ? ` · ${s.pIssues} met fouten` : ''}${s.pChecks ? ` · ${s.pChecks} te controleren` : ''}` : 'Importeer de ledenlijst (CSV uit Google Sheets).', !ev.participants.length || s.pIssues ? 'todo' : 'done'),
    step(3, 'poules', 'Poules', ev.pools.length ? `${ev.pools.length} poules${s.poolWarn ? ` · ${s.poolWarn} aandachtspunten` : ''}${s.un ? ` · ${s.un} niet ingedeeld` : ''}` : 'Maak een voorstel voor categorieën en poules.', ev.pools.length && !s.poolWarn && !s.un ? 'done' : 'todo'),
    step(4, 'planning', 'Planning', s.sched.plannedCount ? `${s.sched.plannedCount}/${s.sched.total} wedstrijden · klaar om ${fmtTime(s.sched.finalEnd)}${s.sched.overrun ? ' (loopt uit)' : ''}` : 'Maak het tijdschema per veld.', s.sched.plannedCount === s.sched.total && s.sched.total && !schedErrors ? (s.sched.overrun ? 'todo' : 'done') : 'todo'),
    step(5, 'vrijwilligers', 'Vrijwilligers', ev.volunteers.length ? `${ev.volunteers.length} vrijwilligers${s.missing.length ? ` · mist: ${s.missing.map(m => `${m.n} ${ROLES[m.role].label.replace(/^./, ch => ch.toLowerCase())}`).join(', ')}` : ' · alle functies bezet'}` : 'Voer vrijwilligers in en maak het rooster.', ev.volunteers.length && !s.missing.length ? 'done' : 'todo'),
    step('€', 'kosten', 'Kosten', `Geschat ${euro(costSummary(ev).est)} · dit toernooi kost ${euro(costSummary(ev).final)}`, ''),
    step(6, 'documenten', 'Documenten & printen', 'Draaiboek, poulebladen, rooster en benodigdheden als papieren back-up.', ''),
    step(7, 'live', 'Wedstrijd live', s.results ? `${s.results} van ${s.matches} uitslagen ingevoerd` : 'Tafelscherm voor de wedstrijddag.', ''),
    step(8, 'winnaars', 'Poulewinnaars', s.pending ? `${s.pending} poule(s) wachten op een beslissing` : `${s.complete} van ${ev.pools.length} poules afgerond`, s.pending ? 'todo' : ''),
  ].join('');

  const attention = [];
  if (!infoOk) attention.push(note('warn', 'Datum of locatie ontbreekt.', 'Ga naar Evenement & velden en vul de wedstrijddatum in; leeftijden en kumitetijd hangen hiervan af.'));
  if (s.pIssues) attention.push(note('error', `${s.pIssues} deelnemer(s) hebben ontbrekende of ongeldige gegevens.`, 'Open Deelnemers en filter op "Fouten".'));
  if (s.missing.length) attention.unshift(note('error', `Te weinig vrijwilligers. Er missen: ${s.missing.map(m => `${m.n} × ${ROLES[m.role].label.replace(/^./, ch => ch.toLowerCase())}`).join(', ')}.`, 'Voeg bij Vrijwilligers mensen met deze functie toe.'));
  if (s.un) attention.push(note('warn', `${s.un} inschrijving(en) zitten nog in geen enkele poule.`, 'Open Poules en kies "Nieuw voorstel" of plaats ze handmatig.'));
  for (const i of s.sched.issues.filter(i => i.level !== 'info').slice(0, 3)) attention.push(note(i.level, i.text, i.fix));
  if (ev.isSample) attention.unshift(note('info', 'Dit is een voorbeeldevenement met verzonnen deelnemers.', 'Gebruik het om de planner te leren kennen. Maak voor een echt toernooi een nieuw evenement.'));

  return `<main class="page">
    <div class="page-head"><div class="grow"><span class="eyebrow">Overzicht</span><h1>${esc(ev.info.name)}</h1>
      <p class="sub">${esc([fmtDate(ev.info.date, true), ev.info.location, ev.info.startTime && `${ev.info.startTime}–${ev.info.endTime}`].filter(x => x && x !== '–').join(' · '))}</p></div>
      <div class="row"><a class="btn dark l" href="#${esc(c.evPath('live'))}">${icon.play}Wedstrijd live</a><a class="btn l" href="#${esc(c.evPath('documenten', 'certificaten'))}">${icon.print}Certificaten printen</a><a class="btn l" href="#${esc(c.evPath('winnaars'))}">${icon.trophy}Poulewinnaars bekijken</a></div></div>
    <div class="grid four">
      <div class="stat"><b>${ev.participants.length}</b><span>deelnemers</span></div>
      <div class="stat"><b>${ev.pools.length}</b><span>poules (${ev.pools.filter(p => p.discipline === 'kata').length} kata · ${ev.pools.filter(p => p.discipline === 'kumite').length} kumite)</span></div>
      <div class="stat"><b>${s.matches}</b><span>wedstrijden · ${s.results} gespeeld</span></div>
      <div class="stat"><b>${s.sched.finalEnd ? fmtTime(s.sched.finalEnd) : '–'}</b><span>verwachte eindtijd (gewenst ${esc(ev.info.endTime || '–')})</span></div>
    </div>
    ${attention.length ? `<div class="card"><h3>Aandachtspunten</h3>${attention.join('')}</div>` : ''}
    <div class="stack"><h2>Stappen</h2><div class="steps">${steps}</div></div>
  </main>`;
}
