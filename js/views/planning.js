// Planning: tijdschema per veld, conflictcontrole en handmatig aanpassen.
import { esc, byId, fmtTime, fmtDuration, parseTime } from '../util.js';
import { icon, note } from '../ui.js';
import { displayName, DISCIPLINES } from '../model.js';
import { buildSchedule, checkSchedule, matchesByField, assignPoolsToFields } from '../schedule.js';
import { resultFor } from '../results.js';

export function render(c) {
  const ev = c.ev;
  const pById = byId(ev.participants);
  const poolById = byId(ev.pools);
  const chk = checkSchedule(ev);
  const byField = matchesByField(ev);
  const view = c.ui.planView || 'tijdlijn';
  const flagged = new Set(chk.issues.flatMap(i => i.matchIds || []));
  const errors = chk.issues.filter(i => i.level === 'error');
  const warns = chk.issues.filter(i => i.level === 'warn');
  const infos = chk.issues.filter(i => i.level === 'info');

  // Tijdlijn: rijen per tijdstip, kolommen per veld
  let timeline = '';
  if (chk.plannedCount) {
    const times = [...new Set([...Object.values(byField).flat().map(m => m.start), ...chk.blocks.map(b => b.s)])].sort((a, b) => a - b);
    timeline = `<div class="table-wrap"><div class="timeline" style="--cols:${ev.fields.length};min-width:${80 + ev.fields.length * 180}px">
      <div class="tl-row head"><div>Tijd</div>${ev.fields.map(f => `<div>${esc(f.name)}${chk.fieldSpans[f.id] ? `<div class="small muted">${chk.fieldSpans[f.id].disciplines.map(d => DISCIPLINES[d]).join(' → ')} · tot ${fmtTime(chk.fieldSpans[f.id].e)}</div>` : ''}</div>`).join('')}</div>
      ${times.map(t => {
        const block = chk.blocks.find(b => b.s === t);
        if (block && !ev.fields.some(f => byField[f.id].some(m => m.start === t))) return `<div class="tl-row"><div class="tl-time">${fmtTime(t)}</div><div class="tl-block" style="grid-column:2 / span ${ev.fields.length}">${esc(block.title)} · ${fmtTime(block.s)}–${fmtTime(block.e)}</div></div>`;
        return `<div class="tl-row"><div class="tl-time">${fmtTime(t)}</div>${ev.fields.map(f => {
          const m = byField[f.id].find(x => x.start === t);
          if (!m) return '<div></div>';
          const done = resultFor(ev, m.id);
          return `<div class="tl-match" style="${flagged.has(m.id) ? 'background:var(--error-bg)' : done ? 'background:var(--surface-soft)' : ''}">
            <span class="pl">${esc(poolById[m.poolId]?.name)} · #${m.num}${m.kind === 'beslis' ? ' · beslispartij' : ''}${m.pinned ? ' · vast' : ''}${done ? ' · gespeeld' : ''}</span>
            <span class="vs"><span class="sq red"></span>${esc(displayName(pById[m.redId]))}</span><span class="vs"><span class="sq blue"></span>${esc(displayName(pById[m.blueId]))}</span></div>`;
        }).join('')}</div>`;
      }).join('')}</div></div>`;
  }

  // Lijst met bewerkbare tijden
  const list = view === 'lijst' ? `<div class="table-wrap"><table class="t"><thead><tr><th>Tijd</th><th>Veld</th><th>Poule</th><th>#</th><th>Rood</th><th>Blauw</th><th></th></tr></thead><tbody>
    ${ev.matches.filter(m => !m.orphan).sort((a, b) => (a.start ?? 1e9) - (b.start ?? 1e9)).map(m => `<tr class="${flagged.has(m.id) ? 'errrow' : ''}">
      <td><input class="input s" type="time" value="${m.start != null ? fmtTime(m.start) : ''}" data-change="setTime" data-id="${esc(m.id)}" style="width:120px" ${resultFor(ev, m.id) ? 'disabled' : ''}></td>
      <td><select class="select s" data-change="setField" data-id="${esc(m.id)}" ${resultFor(ev, m.id) ? 'disabled' : ''}><option value="">–</option>${ev.fields.map(f => `<option value="${esc(f.id)}" ${m.fieldId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></td>
      <td>${esc(poolById[m.poolId]?.name)}</td><td class="num">${m.num}</td>
      <td><span class="sq red"></span> ${esc(displayName(pById[m.redId]))}</td><td><span class="sq blue"></span> ${esc(displayName(pById[m.blueId]))}</td>
      <td>${m.pinned ? `<button class="btn s" data-act="unpin" data-id="${esc(m.id)}">Vrijgeven</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '';

  // Poules per veld
  const fieldPools = `<div class="table-wrap"><table class="t"><thead><tr><th>Poule</th><th>Onderdeel</th><th>Wedstrijden</th><th>Veld</th><th>Vastzetten op veld</th></tr></thead><tbody>
    ${ev.pools.map(p => { const ms = ev.matches.filter(m => m.poolId === p.id && !m.orphan); const s = ms.filter(m => m.start != null);
      return `<tr><td><strong>${esc(p.name)}</strong></td><td>${DISCIPLINES[p.discipline]}</td><td class="num">${ms.length}${s.length ? ` · ${fmtTime(Math.min(...s.map(m => m.start)))}–${fmtTime(Math.max(...s.map(m => m.end)))}` : ''}</td>
      <td>${esc(byId(ev.fields)[p.fieldId]?.name || '–')}</td>
      <td><select class="select s" data-change="pinPool" data-id="${esc(p.id)}"><option value="">Automatisch</option>${ev.fields.map(f => `<option value="${esc(f.id)}" ${p.pinnedFieldId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></td></tr>`; }).join('')}
    </tbody></table></div>`;

  return `<main class="page wide">
    <div class="page-head"><div class="grow"><span class="eyebrow">Voorbereiden</span><h1>Wedstrijdplanning</h1>
      <p class="sub">Start ${esc(ev.info.startTime)} · gewenst klaar ${esc(ev.info.endTime)} · ${ev.fields.length} velden · kata ${ev.settings.kataMatchSec / 60} min per partij · kumite ${ev.settings.kumiteYoungSec}/${ev.settings.kumiteOldSec} s + ${ev.settings.kumiteOverheadSec / 60} min wissel</p></div>
      <div class="row"><button class="btn primary l" data-act="build">${chk.plannedCount ? 'Planning opnieuw maken' : 'Planning maken'}</button></div></div>
    ${ev.planStale && chk.plannedCount ? note('warn', 'De poules zijn gewijzigd na de laatste planning.', 'Kies "Planning opnieuw maken". Gespeelde en vastgezette partijen blijven op hun plek.') : ''}
    <div class="grid four">
      <div class="stat"><b>${chk.plannedCount}/${chk.total}</b><span>wedstrijden ingepland</span></div>
      <div class="stat"><b>${chk.finalEnd ? fmtTime(chk.finalEnd) : '–'}</b><span>eindtijd incl. programma</span></div>
      <div class="stat"><b style="color:${chk.overrun ? 'var(--red)' : 'inherit'}">${chk.overrun ? '+' + fmtDuration(chk.overrun) : 'Op tijd'}</b><span>t.o.v. gewenste eindtijd ${esc(ev.info.endTime)}</span></div>
      <div class="stat"><b>${errors.length}</b><span>conflicten · ${warns.length} waarschuwingen</span></div>
    </div>
    ${errors.length || warns.length || infos.length ? `<div class="card"><h3>Controle</h3>${[...errors, ...warns, ...infos].slice(0, 30).map(i => note(i.level, i.text, i.fix)).join('')}${errors.length + warns.length > 30 ? `<p class="muted">… en ${errors.length + warns.length - 30} meer.</p>` : ''}</div>`
      : chk.plannedCount ? note('ok', 'Geen conflicten: geen dubbele boekingen van velden of deelnemers en alle wedstrijden zijn ingepland.') : ''}
    ${chk.plannedCount ? `<div class="card"><div class="card-head"><h3>Schema</h3><div class="seg"><button class="${view === 'tijdlijn' ? 'on' : ''}" data-act="view" data-v="tijdlijn">Per veld</button><button class="${view === 'lijst' ? 'on' : ''}" data-act="view" data-v="lijst">Aanpassen</button></div></div>
      ${view === 'lijst' ? `<p class="muted">Wijzig tijd of veld van een partij. Die partij wordt "vast" en blijft staan bij opnieuw plannen. Na elke wijziging wordt opnieuw op conflicten gecontroleerd.</p>${list}` : timeline}</div>
      <div class="card"><h3>Poules per veld</h3><p class="muted">Een tafel werkt steeds twee poules door elkaar af. Zet een poule vast op een veld als dat praktisch is; kies daarna "Planning opnieuw maken".</p>${fieldPools}</div>`
      : `<div class="card"><h3>Nog geen planning</h3><p class="big muted">${ev.matches.length ? 'Klik op "Planning maken". De planner verdeelt de poules over de velden, plant pauzes en programmaonderdelen in en voorkomt dat een deelnemer op twee plaatsen tegelijk moet zijn.' : 'Maak eerst poules aan. Daarna kun je de planning maken.'}</p></div>`}
  </main>`;
}

export const actions = {
  build(c) {
    const res = c.mutate(ev => { const r = buildSchedule(ev); ev.planStale = false; return r; }, { reason: 'planning gemaakt', snapshot: true });
    const errs = res.issues.filter(i => i.level === 'error').length;
    c.toast(errs ? `Planning gemaakt, maar met ${errs} conflict(en). Zie Controle.` : `Planning gemaakt: klaar om ${fmtTime(res.finalEnd)}.`);
  },
  view(c, el) { c.ui.planView = el.dataset.v; c.render(); },
  setTime(c, el) {
    const s = parseTime(el.value);
    if (s == null) { c.toast('Gebruik een tijd als 10:15.', 'error'); return; }
    c.mutate(ev => { const m = ev.matches.find(m => m.id === el.dataset.id); m.start = s; m.pinned = true; if (!m.fieldId) m.fieldId = ev.fields[0]?.id; });
  },
  setField(c, el) { c.mutate(ev => { const m = ev.matches.find(m => m.id === el.dataset.id); m.fieldId = el.value || null; m.pinned = true; }); },
  unpin(c, el) { c.mutate(ev => { ev.matches.find(m => m.id === el.dataset.id).pinned = false; }); c.toast('Vrijgegeven. Kies "Planning opnieuw maken" om de partij automatisch te plannen.'); },
  pinPool(c, el) { c.mutate(ev => { const p = ev.pools.find(p => p.id === el.dataset.id); p.pinnedFieldId = el.value || null; ev.planStale = true; }); },
};
