// Poules: voorstel, uitleg, waarschuwingen en handmatig aanpassen.
import { esc, ageOn, byId, fmtDuration } from '../util.js';
import { icon, note, beltChip } from '../ui.js';
import { displayName, matchDurationSec, kumiteSecondsFor, DISCIPLINES, levelIndex } from '../model.js';
import { regenerate, explainPool, categoryLabel, moveParticipant, placeParticipant, splitPool, mergePools, deletePool, unassigned, poolHasResults, poolMatches, poolProfile, twinOf, nameAll } from '../pools.js';
import { uid } from '../util.js';
import { exportPoolForms } from './docs.js';

function poolCard(c, pool, pById) {
  const ev = c.ev;
  const ex = explainPool(ev, pool);
  const matches = poolMatches(ev, pool.id);
  const dur = matches.reduce((t, m) => t + matchDurationSec(ev, m, pById), 0);
  const hasRes = poolHasResults(ev, pool.id);
  const others = ev.pools.filter(p => p.discipline === pool.discipline && p.id !== pool.id);
  const misfitIds = new Set(ex.misfits.map(m => m.id));
  const open = c.ui.openMatches === pool.id;
  const members = pool.participantIds.map(id => pById[id]).filter(Boolean)
    .sort((a, b) => (ageOn(a.birthDate, ev.info.date) - ageOn(b.birthDate, ev.info.date)) || levelIndex(a.kyu) - levelIndex(b.kyu));
  return `<div class="pool-card ${pool.discipline}">
    <div class="ph"><div class="grow">
      <div class="row" style="gap:8px"><h3>${esc(pool.name)}</h3><button class="btn ghost s" data-act="rename" data-id="${esc(pool.id)}" aria-label="Naam wijzigen">${icon.edit}</button>${hasRes ? '<span class="badge ink">Uitslagen ingevoerd</span>' : ''}${pool.auto ? '' : '<span class="badge">Handmatig aangepast</span>'}${twinOf(ev, pool) ? `<span class="badge blue" title="Wijzigingen gaan ook naar ${esc(twinOf(ev, pool).name)}">Gelijk aan ${DISCIPLINES[twinOf(ev, pool).discipline].toLowerCase()}</span>` : ''}</div>
      <div class="muted">${ex.profile.n} deelnemers · ${matches.length} wedstrijden · ±${fmtDuration(dur)}</div>
    </div></div>
    <div class="pb">
      <div class="small muted"><strong>Waarom samen:</strong> ${esc(ex.reasons.join(' · ') || '–')}</div>
      ${ex.warnings.map(w => w.info ? note('info', w.text) : note(w.confirmed ? 'check' : 'warn', w.text + (w.confirmed ? ' (bevestigd)' : ''), '',
        w.confirmable && !w.confirmed ? `<button class="btn s" data-act="confirmWarn" data-id="${esc(pool.id)}" data-key="${w.key}">Bewust zo laten</button>` :
        w.action === 'split' ? `<button class="btn s" data-act="split" data-id="${esc(pool.id)}">Splitsen</button>` :
        w.action === 'delete' ? `<button class="btn s" data-act="del" data-id="${esc(pool.id)}">Verwijderen</button>` : '')).join('')}
      ${ex.misfits.length ? note('warn', 'Past minder goed: ' + ex.misfits.map(m => m.text).join('; ')) : ''}
      <div class="stack" style="gap:6px">${members.map(p => `<div class="member ${misfitIds.has(p.id) ? 'misfit' : ''}">
        <div><div class="nm">${esc(displayName(p))}</div><div class="meta">${ageOn(p.birthDate, ev.info.date)} jr · ${p.sex === 'M' ? 'jongen' : 'meisje'} · ${beltChip(p)}${p.weight ? ` · ${p.weight} kg` : ''}${pool.discipline === 'kumite' ? ` · ${kumiteSecondsFor(ev, p)} s` : ''}${p.kyu == null && !p.checked ? ' · <span class="badge warn">aanname beginner</span>' : ''}</div></div>
        ${others.length ? `<select class="select s" data-change="move" data-pid="${esc(p.id)}" data-from="${esc(pool.id)}" aria-label="Verplaats ${esc(displayName(p))}" style="max-width:190px"><option value="">Verplaats naar…</option>${others.map(o => `<option value="${esc(o.id)}">${esc(o.name)} (${o.participantIds.length})</option>`).join('')}</select>` : ''}
      </div>`).join('')}</div>
      <div class="row">
        <button class="btn s" data-act="toggleMatches" data-id="${esc(pool.id)}">${open ? 'Wedstrijden verbergen' : 'Wedstrijden tonen'}</button>
        ${ex.profile.n >= 4 ? `<button class="btn s" data-act="split" data-id="${esc(pool.id)}">Splitsen</button>` : ''}
        ${others.length ? `<select class="select s" data-change="merge" data-id="${esc(pool.id)}" style="max-width:220px" aria-label="Samenvoegen met"><option value="">Samenvoegen met…</option>${others.map(o => `<option value="${esc(o.id)}">${esc(o.name)} · ${esc(categoryLabel(ev, o))}</option>`).join('')}</select>` : ''}
        ${!ex.profile.n ? `<button class="btn s danger" data-act="del" data-id="${esc(pool.id)}">Verwijderen</button>` : ''}
      </div>
      ${open ? `<div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>Rood</th><th>Blauw</th><th>Duur</th></tr></thead><tbody>${matches.map(m => `<tr><td class="num">${m.num}${m.kind === 'beslis' ? ' <span class="badge warn">beslis</span>' : ''}</td><td><span class="sq red"></span> ${esc(displayName(pById[m.redId]))}</td><td><span class="sq blue"></span> ${esc(displayName(pById[m.blueId]))}</td><td class="num">${Math.round(matchDurationSec(ev, m, pById) / 6) / 10} min</td></tr>`).join('')}</tbody></table></div>
        ${colorBalance(pool, matches, pById)}` : ''}
    </div></div>`;
}

function colorBalance(pool, matches, pById) {
  const cnt = {};
  for (const m of matches) { (cnt[m.redId] = cnt[m.redId] || { r: 0, b: 0 }).r++; (cnt[m.blueId] = cnt[m.blueId] || { r: 0, b: 0 }).b++; }
  return `<p class="small muted">Verdeling rood/blauw: ${pool.participantIds.map(id => `${esc(displayName(pById[id]).split(' ')[0])} ${cnt[id]?.r || 0}R/${cnt[id]?.b || 0}B`).join(' · ')}</p>`;
}

export function render(c) {
  const ev = c.ev;
  const disc = c.ui.poolDisc || 'kata';
  const pById = byId(ev.participants);
  const pools = ev.pools.filter(p => p.discipline === disc);
  const un = unassigned(ev, disc);
  const entrants = ev.participants.filter(p => p[disc] && !p.withdrawn).length;
  const target = c.ui.pendingImpact;
  return `<main class="page">
    <div class="page-head"><div class="grow"><span class="eyebrow">Voorbereiden</span><h1>Categorieën en poules</h1>
      <p class="sub">Ingedeeld op leeftijd op de wedstrijddag, jongen/meisje en kyu-graad. Wedstrijdervaring en gewicht wegen mee. Doel: ±${ev.settings.poolTarget} per poule, maximaal ${ev.settings.poolMax}.${ev.settings.linkedPools !== false ? ' Kata en kumite zijn gelijk ingedeeld (aparte prijzen per onderdeel); een wijziging geldt voor beide.' : ''}</p></div>
      <div class="row"><button class="btn primary l" data-act="regen">${pools.length ? 'Nieuw voorstel maken' : 'Voorstel maken'}</button><button class="btn l" data-act="addPool">${icon.plus}Lege poule</button>${ev.pools.length ? `<button class="btn l" data-act="exportForms">${icon.download}Poule-formulieren (Excel)</button>` : ''}</div></div>
    <div class="seg">${Object.entries(DISCIPLINES).map(([k, l]) => `<button class="${disc === k ? 'on' : ''}" data-act="disc" data-d="${k}">${l} (${ev.pools.filter(p => p.discipline === k).length})</button>`).join('')}</div>
    ${target ? note('info', target, 'Ga naar Planning en kies "Planning maken" om het tijdschema bij te werken.', `<a class="btn s" href="#${esc(c.evPath('planning'))}">Naar planning</a>`) : ''}
    ${!ev.info.date ? note('warn', 'Geen wedstrijddatum ingesteld.', 'Vul eerst de datum in bij Evenement & velden; de indeling gebruikt de leeftijd op die dag.') : ''}
    ${!entrants ? note('info', `Nog geen deelnemers voor ${DISCIPLINES[disc].toLowerCase()}.`, 'Importeer eerst deelnemers bij Deelnemers.') : ''}
    ${un.length ? `<div class="card"><h3>Nog niet ingedeeld (${un.length})</h3>${un.map(p => `<div class="member"><div><div class="nm">${esc(displayName(p))}</div><div class="meta">${ageOn(p.birthDate, ev.info.date) ?? '?'} jr · ${p.sex === 'M' ? 'jongen' : p.sex === 'V' ? 'meisje' : 'onbekend'} · ${beltChip(p)}${!p.birthDate || !p.sex ? ' · <span class="badge error">gegevens onvolledig</span>' : ''}</div></div>
      ${pools.length ? `<select class="select s" data-change="place" data-pid="${esc(p.id)}" style="max-width:220px"><option value="">Plaats in poule…</option>${pools.map(o => `<option value="${esc(o.id)}">${esc(o.name)} · ${esc(categoryLabel(ev, o))}</option>`).join('')}</select>` : ''}</div>`).join('')}</div>` : ''}
    <div class="grid two">${pools.map(p => poolCard(c, p, pById)).join('')}</div>
  </main>`;
}

async function confirmMix(c, pool, pids) {
  const ev = c.ev;
  const pById = byId(ev.participants);
  const pr = poolProfile(ev, pool);
  const ps = pids.map(id => pById[id]);
  const reasons = [];
  if (ps.some(p => pr.sexes.size && !pr.sexes.has(p.sex))) reasons.push('jongens en meisjes komen samen in één poule');
  const lv = ps.map(p => levelIndex(p.kyu));
  if (pr.n && lv.some(l => Math.abs(l - pr.minLvl) >= 2 || Math.abs(l - pr.maxLvl) >= 2)) reasons.push('het niveau verschilt sterk');
  if (!reasons.length) return true;
  return c.confirm({ title: 'Weet je het zeker?', text: `Let op: ${reasons.join(' en ')}. Dit gebeurt alleen als je het bevestigt.`, ok: 'Ja, bewust samenvoegen' });
}

function impact(c, before) {
  const ev = c.ev;
  const total = ev.matches.filter(m => !m.orphan).length;
  const diff = total - before;
  c.ui.pendingImpact = `Indeling gewijzigd: nu ${total} wedstrijden (${diff >= 0 ? '+' : ''}${diff}). Categorienamen, wedstrijdduur en de planning zijn bijgewerkt of moeten opnieuw worden berekend.`;
  ev.planStale = true;
}

export const actions = {
  exportForms: c => exportPoolForms(c),
  disc(c, el) { c.ui.poolDisc = el.dataset.d; c.render(); },
  async regen(c) {
    const disc = c.ui.poolDisc || 'kata';
    const existing = c.ev.pools.filter(p => p.discipline === disc);
    const both = c.ev.settings.linkedPools !== false;
    if ((both ? c.ev.pools.length : existing.length) && !await c.confirm({ title: 'Nieuw voorstel maken?', text: `Poules zonder uitslagen worden vervangen door een nieuw voorstel${both ? ' (kata én kumite, gelijk ingedeeld)' : ''}. Handmatige aanpassingen in die poules gaan verloren. Poules met uitslagen blijven ongewijzigd.`, ok: 'Nieuw voorstel' })) return;
    const before = c.ev.matches.length;
    const res = c.mutate(ev => { const r = regenerate(ev, disc); impact(c, before); return r; }, { reason: `poulevoorstel ${disc}`, snapshot: true });
    c.toast(`${res.created} poules voorgesteld${res.keptWithResults ? `, ${res.keptWithResults} poules met uitslagen behouden` : ''}.`);
  },
  addPool(c) {
    const disc = c.ui.poolDisc || 'kata';
    c.mutate(ev => {
      const both = ev.settings.linkedPools !== false;
      const groupId = both ? uid('g') : undefined;
      for (const d of both ? ['kata', 'kumite'] : [disc]) ev.pools.push({ id: uid('pl'), discipline: d, sex: 'M', name: '', participantIds: [], auto: false, confirmedWarnings: [], groupId });
      nameAll(ev);
    });
  },
  async rename(c, el) {
    const pool = c.ev.pools.find(p => p.id === el.dataset.id);
    const name = await c.confirm({ title: 'Poule hernoemen', text: 'De naam wordt automatisch gemaakt uit onderdeel, leeftijd en kyu-graad. Typ een eigen naam, of maak het veld leeg om de automatische naam terug te zetten.', ok: 'Opslaan', input: { label: 'Naam', value: pool.name } });
    if (name === false) return;
    c.mutate(ev => { if (name.trim()) { pool.name = name.trim(); pool.customName = true; } else { pool.customName = false; nameAll(ev); } });
  },
  async move(c, el) {
    const to = el.value; if (!to) return;
    const pool = c.ev.pools.find(p => p.id === to);
    if (!await confirmMix(c, pool, [el.dataset.pid])) { c.render(); return; }
    const before = c.ev.matches.length;
    c.mutate(ev => { moveParticipant(ev, el.dataset.pid, el.dataset.from, to); impact(c, before); }, { reason: 'deelnemer verplaatst' });
  },
  async place(c, el) {
    const to = el.value; if (!to) return;
    const pool = c.ev.pools.find(p => p.id === to);
    if (!await confirmMix(c, pool, [el.dataset.pid])) { c.render(); return; }
    const before = c.ev.matches.length;
    c.mutate(ev => { placeParticipant(ev, el.dataset.pid, pool.id); impact(c, before); });
  },
  split(c, el) { const before = c.ev.matches.length; c.mutate(ev => { splitPool(ev, el.dataset.id); impact(c, before); }, { reason: 'poule gesplitst' }); },
  async merge(c, el) {
    const other = el.value; if (!other) return;
    const keep = c.ev.pools.find(p => p.id === el.dataset.id), o = c.ev.pools.find(p => p.id === other);
    if (keep.participantIds.length + o.participantIds.length > c.ev.settings.poolMax && !await c.confirm({ title: 'Grote poule', text: `Samen ${keep.participantIds.length + o.participantIds.length} deelnemers; dat is meer dan het maximum van ${c.ev.settings.poolMax}. Toch samenvoegen?`, ok: 'Toch samenvoegen' })) { c.render(); return; }
    if (!await confirmMix(c, keep, o.participantIds)) { c.render(); return; }
    const before = c.ev.matches.length;
    c.mutate(ev => { mergePools(ev, keep.id, other); impact(c, before); }, { reason: 'poules samengevoegd' });
  },
  async del(c, el) {
    if (poolHasResults(c.ev, el.dataset.id)) { c.toast('Deze poule heeft uitslagen en kan niet worden verwijderd.', 'error'); return; }
    if (!await c.confirm({ title: 'Poule verwijderen?', text: 'De deelnemers komen in de lijst "Nog niet ingedeeld".', ok: 'Verwijderen', danger: true })) return;
    c.mutate(ev => deletePool(ev, el.dataset.id));
  },
  confirmWarn(c, el) { c.mutate(ev => { const p = ev.pools.find(p => p.id === el.dataset.id); p.confirmedWarnings = [...new Set([...(p.confirmedWarnings || []), el.dataset.key])]; }); },
  toggleMatches(c, el) { c.ui.openMatches = c.ui.openMatches === el.dataset.id ? null : el.dataset.id; c.render(); },
};
