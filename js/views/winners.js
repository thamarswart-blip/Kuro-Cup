// Poulewinnaars: eindstanden, prijswinnaars, gelijke standen en open beslissingen.
import { esc, byId, fmtDateTime } from '../util.js';
import { icon, note } from '../ui.js';
import { displayName, DISCIPLINES } from '../model.js';
import { categoryLabel, poolMatches } from '../pools.js';
import { standings, addTiebreak, recordDecision, resultFor } from '../results.js';
import { buildSchedule } from '../schedule.js';

const MEDAL = { 1: '1e', 2: '2e', 3: '3e', 4: '4e' };

function poolBlock(c, pool, pById) {
  const ev = c.ev;
  const st = standings(ev, pool);
  const places = ev.settings.prizePlaces;
  const status = st.pending ? '<span class="badge warn">Beslissing nodig</span>' : st.complete ? '<span class="badge ok">Afgerond</span>' : st.done ? `<span class="badge blue">${st.done}/${st.total} gespeeld</span>` : '<span class="badge">Nog niet begonnen</span>';
  const tb = poolMatches(ev, pool.id).filter(m => m.kind === 'beslis');
  const histOpen = c.ui.histPool === pool.id;
  const results = poolMatches(ev, pool.id).map(m => ({ m, r: resultFor(ev, m.id) })).filter(x => x.r);
  return `<div class="pool-card ${pool.discipline}" id="pool-${esc(pool.id)}">
    <div class="ph"><div class="grow"><div class="row" style="gap:8px"><h3>${esc(pool.name)}</h3>${status}</div><div class="muted">${esc(categoryLabel(ev, pool))} · ${DISCIPLINES[pool.discipline]}</div></div></div>
    <div class="pb">
      ${st.done ? `<div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>Naam</th><th class="right">Gesp.</th><th class="right">Winst</th><th class="right">Vlaggen</th><th class="right">Punten</th>${tb.length ? '<th class="right">Beslis</th>' : ''}</tr></thead><tbody>
        ${st.rows.map(r => `<tr class="${st.complete && r.pos <= places && !st.ties.some(t => t.ids.includes(r.id)) ? 'hl' : ''}"><td><strong>${r.pos}</strong></td><td>${esc(r.name)}${st.complete && r.pos <= places && !st.ties.some(t => t.ids.includes(r.id)) ? ` <span class="badge ink">${MEDAL[r.pos]} prijs</span>` : ''}</td>
          <td class="right num">${r.played}</td><td class="right num">${r.wins}</td><td class="right num">${r.flags}</td><td class="right num"><strong>${r.points}</strong></td>${tb.length ? `<td class="right num">${r.tbWins} / ${r.tbFlags}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Nog geen uitslagen.</p>'}
      ${st.mixedRefs ? note('warn', 'Niet alle partijen zijn met hetzelfde aantal scheidsrechters beoordeeld.', 'Vlaggen vergelijken voor de eindstand is daardoor minder betrouwbaar. Overweeg een beslispartij bij gelijke punten.') : ''}
      ${st.decision ? note('info', `Beslissing hoofdscheidsrechter ${st.decision.referee} (${fmtDateTime(st.decision.at)}): ${st.decision.order.map((id, i) => `${i + 1}. ${displayName(pById[id])}`).join(', ')}.`, st.decision.note || '') : ''}
      ${st.ties.map(t => `<div class="note warn"><div class="txt"><div><strong>Gelijke stand om plaats ${t.pos}:</strong> ${esc(t.names.join(', '))} hebben evenveel punten en vlaggen.</div>
        <div class="fix">Stap 1: plan een beslispartij en voer de uitslag in via Wedstrijd live. Stap 2 (als dat niet kan): leg een beslissing van de hoofdscheidsrechter vast.</div>
        <div class="row" style="margin-top:6px"><button class="btn s dark" data-act="tiebreak" data-pool="${esc(pool.id)}" data-ids="${esc(t.ids.join(','))}">Beslispartij inplannen</button><button class="btn s" data-act="decide" data-pool="${esc(pool.id)}" data-ids="${esc(t.ids.join(','))}">Beslissing vastleggen</button></div></div></div>`).join('')}
      ${tb.filter(m => !resultFor(ev, m.id)).length ? note('info', `${tb.filter(m => !resultFor(ev, m.id)).length} beslispartij(en) wachten op een uitslag.`, 'Voer de uitslag in via Wedstrijd live; de stand wordt daarna automatisch bijgewerkt.', `<a class="btn s" href="#${esc(c.evPath('live'))}">Naar tafel</a>`) : ''}
      ${results.length ? `<button class="btn s" data-act="hist" data-pool="${esc(pool.id)}">${histOpen ? 'Uitslagen verbergen' : `Uitslagen en wijzigingen (${results.length})`}</button>` : ''}
      ${histOpen ? `<div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>Rood</th><th>Blauw</th><th>Vlaggen</th><th>Ingevoerd</th><th>Historie</th><th></th></tr></thead><tbody>
        ${results.map(({ m, r }) => `<tr><td class="num">${m.num}${m.kind === 'beslis' ? ' <span class="badge warn">beslis</span>' : ''}</td>
          <td style="font-weight:${r.winnerId === m.redId ? 700 : 400}"><span class="sq red"></span> ${esc(displayName(pById[m.redId]))}</td>
          <td style="font-weight:${r.winnerId === m.blueId ? 700 : 400}"><span class="sq blue"></span> ${esc(displayName(pById[m.blueId]))}</td>
          <td class="num">${r.flagsRed} – ${r.flagsBlue}${r.referees !== 3 ? ` <span class="badge warn">${r.referees} sch.</span>` : ''}</td>
          <td class="small">${esc(r.by || '–')}<br>${esc(fmtDateTime(r.updatedAt))}</td>
          <td class="small">${(r.history || []).map(h => `${esc(fmtDateTime(h.at))} ${esc(h.by || '')}: was ${h.prev ? `${h.prev.flagsRed}–${h.prev.flagsBlue}` : '?'} (${esc(h.reason || 'correctie')})`).join('<br>') || '–'}</td>
          <td><button class="btn s" data-act="correct" data-mid="${esc(m.id)}">${icon.edit}Corrigeren</button></td></tr>`).join('')}
      </tbody></table></div>` : ''}
    </div></div>`;
}

export function render(c) {
  const ev = c.ev;
  const pById = byId(ev.participants);
  const focus = c.args[0];
  const all = ev.pools.map(p => ({ p, st: standings(ev, p) }));
  const pending = all.filter(x => x.st.pending);
  const open = all.filter(x => !x.st.complete);
  const done = all.filter(x => x.st.complete && !x.st.pending);
  const filter = c.ui.wFilter || 'alle';
  const shown = all.filter(x => filter === 'alle' ? x.st.done > 0 || x.st.pending : filter === 'open' ? x.st.pending : true);
  const winners = done.flatMap(({ p, st }) => st.rows.filter(r => r.pos <= ev.settings.prizePlaces).map(r => ({ pool: p, r })));
  return `<main class="page">
    <div class="page-head"><div class="grow"><span class="eyebrow">Wedstrijddag</span><h1>Poulewinnaars</h1>
      <p class="sub">Alle ingevulde poules op dit apparaat: ${done.length} afgerond, ${pending.length} met open beslissing, ${open.length - pending.length} nog bezig of niet begonnen.</p></div>
      <div class="row"><a class="btn l" href="#${esc(c.evPath('documenten'))}">${icon.print}Uitslagen printen</a></div></div>
    ${note('info', 'Dit overzicht toont alleen de uitslagen die op dit apparaat staan.', 'Voeg gegevens van andere tablets samen via Gegevens delen & back-up voor het totaaloverzicht.', `<a class="btn s" href="#${esc(c.evPath('gegevens'))}">Samenvoegen</a>`)}
    ${pending.length ? `<div class="card bar-ink"><h3>Open beslissingen (${pending.length})</h3>${pending.map(({ p, st }) => note('warn', `${p.name}: gelijke stand tussen ${st.ties.map(t => t.names.join(' en ')).join('; ')}.`, '', `<a class="btn s" href="#pool-${esc(p.id)}">Bekijken</a>`)).join('')}</div>` : ''}
    ${winners.length ? `<div class="card"><h3>Prijswinnaars</h3><div class="table-wrap"><table class="t"><thead><tr><th>Poule</th><th>Plaats</th><th>Naam</th><th>Prijs</th></tr></thead><tbody>
      ${winners.map(({ pool, r }) => `<tr><td>${esc(pool.name)} <span class="small muted">${esc(categoryLabel(ev, pool))}</span></td><td><strong>${MEDAL[r.pos]}</strong></td><td>${esc(r.name)}</td><td>${esc(ev.settings.prizeTypes[r.pos] || '')}</td></tr>`).join('')}
      </tbody></table></div></div>` : ''}
    <div class="seg"><button class="${filter === 'alle' ? 'on' : ''}" data-act="filter" data-f="alle">Ingevulde poules</button><button class="${filter === 'open' ? 'on' : ''}" data-act="filter" data-f="open">Open beslissingen</button><button class="${filter === 'iedereen' ? 'on' : ''}" data-act="filter" data-f="iedereen">Alle poules</button></div>
    <div class="grid two">${(focus ? all.filter(x => x.p.id === focus).concat(shown.filter(x => x.p.id !== focus)) : shown).map(x => poolBlock(c, x.p, pById)).join('') || '<div class="card"><p class="muted big">Nog geen uitslagen ingevoerd op dit apparaat.</p></div>'}</div>
  </main>`;
}

export function mount(c) {
  const focus = c.args[0];
  if (focus && !c.ui.scrolledTo) { c.ui.scrolledTo = focus; document.getElementById('pool-' + focus)?.scrollIntoView({ block: 'start' }); }
}

export const actions = {
  filter(c, el) { c.ui.wFilter = el.dataset.f; c.render(); },
  hist(c, el) { c.ui.histPool = c.ui.histPool === el.dataset.pool ? null : el.dataset.pool; c.render(); },
  async tiebreak(c, el) {
    const pool = c.ev.pools.find(p => p.id === el.dataset.pool);
    const ids = el.dataset.ids.split(',');
    const n = ids.length * (ids.length - 1) / 2;
    if (!await c.confirm({ title: 'Beslispartij inplannen?', text: `Er ${n === 1 ? 'wordt 1 beslispartij' : `worden ${n} beslispartijen`} toegevoegd aan ${pool.name}. Ze verschijnen bij Wedstrijd live als volgende partij(en) van deze poule. De uitslag bepaalt de volgorde bij gelijke stand.`, ok: 'Inplannen' })) return;
    c.mutate(ev => { addTiebreak(ev, pool, ids); buildSchedule(ev); }, { reason: 'beslispartij', snapshot: true });
    c.toast('Beslispartij ingepland. Voer de uitslag in via Wedstrijd live.');
  },
  async decide(c, el) {
    const pool = c.ev.pools.find(p => p.id === el.dataset.pool);
    const pById = byId(c.ev.participants);
    const ids = el.dataset.ids.split(',');
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="scrim"></div><div class="modal small" role="dialog" aria-modal="true"><div class="modal-head"><h2>Beslissing hoofdscheidsrechter</h2></div>
      <div class="modal-body"><p>Leg de volgorde vast voor ${esc(pool.name)}. Gebruik dit alleen als een beslispartij niet mogelijk is.</p>
      ${ids.map((_, i) => `<label class="field"><span>Plaats ${i + 1} binnen deze gelijke stand</span><select class="select" id="dc-${i}">${ids.map((id, j) => `<option value="${esc(id)}" ${i === j ? 'selected' : ''}>${esc(displayName(pById[id]))}</option>`).join('')}</select></label>`).join('')}
      <label class="field"><span>Naam hoofdscheidsrechter</span><input class="input" id="dc-ref"></label>
      <label class="field"><span>Toelichting</span><textarea class="input" id="dc-note" rows="3" placeholder="Bijv. beslispartij niet mogelijk wegens tijd; beslist op uitvoering kata."></textarea></label>
      <p class="small muted">Datum en tijd worden automatisch vastgelegd.</p></div>
      <div class="modal-foot"><button class="btn" data-x="no">Annuleren</button><button class="btn dark l" data-x="ok">Vastleggen</button></div></div>`;
    document.body.appendChild(wrap);
    const res = await new Promise(resolve => wrap.addEventListener('click', e => { const x = e.target.closest('[data-x]'); if (!x) return; if (x.dataset.x === 'no') return resolve(null);
      const order = ids.map((_, i) => wrap.querySelector('#dc-' + i).value);
      const referee = wrap.querySelector('#dc-ref').value.trim();
      if (new Set(order).size !== order.length) { c.toast('Iedere deelnemer mag maar één keer voorkomen.', 'error'); return; }
      if (!referee) { c.toast('Vul de naam van de hoofdscheidsrechter in.', 'error'); return; }
      resolve({ order, referee, note: wrap.querySelector('#dc-note').value.trim() }); }));
    wrap.remove();
    if (!res) return;
    // Volgorde van de rest van de poule aanvullen
    const st = standings(c.ev, pool);
    const order = [...st.rows.filter(r => r.pos < Math.min(...st.rows.filter(x => ids.includes(x.id)).map(x => x.pos))).map(r => r.id), ...res.order];
    c.mutate(ev => recordDecision(ev, pool, { ...res, order, by: c.state.operator }), { reason: 'beslissing', snapshot: true });
    c.toast('Beslissing vastgelegd.');
  },
  correct(c, el) {
    // Correctie via de tafelinterface (met bevestiging en historie).
    c.ui.pendingCorrect = el.dataset.mid;
    c.go(c.evPath('live'));
  },
};
