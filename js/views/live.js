// Wedstrijd live — tafelinterface, gebaseerd op het Claude Design-scherm "Wedstrijd Live.dc.html".
// Twee poules naast elkaar: de actieve poule (op de tatami) en de volgende poule (klaarzetten).
import { esc, byId, fmtTime, ageOn } from '../util.js';
import { icon, note, beltChip } from '../ui.js';
import { displayName, kumiteSecondsFor, DISCIPLINES, beltFor, BELT_SWATCH } from '../model.js';
import { poolMatches, categoryLabel } from '../pools.js';
import { resultFor, saveResult, standings, WIN_POINTS, LOSS_POINTS } from '../results.js';
import { isConfigured, push, lastPush } from '../sync.js';

const RED = 'var(--red)', BLUE = 'var(--blue)';
const LS_KEY = 'kcp-live-';

function loadPrefs(evId) { try { return JSON.parse(localStorage.getItem(LS_KEY + evId) || '{}'); } catch { return {}; } }
function savePrefs(evId, p) { try { localStorage.setItem(LS_KEY + evId, JSON.stringify(p)); } catch { /* geen opslag: alleen deze sessie */ } }

function prefs(c) {
  if (!c.ui.live) c.ui.live = { ...{ fieldId: 'alle', slots: [null, null], active: 0, autoSwitch: true, called: {}, drafts: {}, override: {} }, ...loadPrefs(c.ev.id), drafts: {}, override: {} };
  return c.ui.live;
}
function persist(c) { const { fieldId, slots, active, autoSwitch } = c.ui.live; savePrefs(c.ev.id, { fieldId, slots, active, autoSwitch }); }

// Volgorde van partijen in een poule: planning, anders nummer. Beslispartijen achteraan.
export function queue(ev, pool) {
  return poolMatches(ev, pool.id).slice().sort((a, b) => (a.kind === 'beslis') - (b.kind === 'beslis') || (a.start ?? 1e9) - (b.start ?? 1e9) || a.num - b.num);
}

function poolsForField(ev, fieldId) {
  return ev.pools.filter(p => fieldId === 'alle' || p.fieldId === fieldId);
}

function ensureSlots(c) {
  const L = prefs(c), ev = c.ev;
  const avail = poolsForField(ev, L.fieldId);
  const valid = id => ev.pools.some(p => p.id === id);
  const open = p => queue(ev, p).some(m => !resultFor(ev, m.id));
  L.slots = L.slots.map(id => valid(id) ? id : null);
  for (let i = 0; i < 2; i++) {
    if (!L.slots[i]) {
      const cand = avail.find(p => open(p) && !L.slots.includes(p.id)) || avail.find(p => !L.slots.includes(p.id));
      L.slots[i] = cand ? cand.id : null;
    }
  }
  if (!L.slots[L.active]) L.active = L.slots[0] ? 0 : 1;
}

function currentMatch(c, pool) {
  const L = prefs(c), ev = c.ev;
  const ov = L.override[pool.id];
  if (ov) { const m = ev.matches.find(m => m.id === ov); if (m && !resultFor(ev, m.id)) return m; delete L.override[pool.id]; }
  return queue(ev, pool).find(m => !resultFor(ev, m.id)) || null;
}

function refsFor(c, m) {
  const d = prefs(c).drafts[m.id];
  return d?.refs || c.ev.settings.referees || 3;
}

// ---------- Onderdelen ----------
function sideCard(c, m, side, draft, pById, opts = {}) {
  const pid = side === 'red' ? m.redId : m.blueId;
  const p = pById[pid];
  const col = side === 'red' ? RED : BLUE;
  const has = !!draft.winner, isW = draft.winner === side;
  const flags = side === 'red' ? draft.fr : draft.fb;
  const refs = draft.refs;
  const label = side === 'red' ? 'Rood' : 'Blauw';
  const age = ageOn(p?.birthDate, c.ev.info.date);
  const key = opts.prefix || 'cur';
  return `<div class="side-card ${side} ${isW ? 'won' : ''}" style="border-color:${isW ? col : 'var(--line)'}">
    <div class="side-bar" style="background:${col}"></div>
    <div class="side-body">
      <div class="stack" style="gap:4px">
        <div class="side-label" style="color:${col}">${label.toUpperCase()} · ${side === 'red' ? 'Aka' : 'Ao'}</div>
        <div class="side-name">${esc(displayName(p))}</div>
        <div class="row" style="gap:10px">${p ? beltChip(p) : ''}${age != null ? `<span class="small muted">${age} jaar${m.discipline === 'kumite' && p ? ` · ${kumiteSecondsFor(c.ev, p)} s` : ''}</span>` : ''}</div>
      </div>
      <div class="row" style="gap:8px;align-items:baseline"><div class="side-points" style="color:${has ? (isW ? col : 'var(--ink)') : '#A0A5AB'}">${has ? (isW ? WIN_POINTS : LOSS_POINTS) : '–'}</div><div class="muted big">punten</div></div>
      <button class="win-btn" style="background:${isW ? col : '#fff'};color:${isW ? '#fff' : has ? 'var(--ink)' : col};border-color:${isW ? col : has ? 'var(--line-strong)' : col}" data-act="win" data-k="${key}" data-mid="${esc(m.id)}" data-side="${side}" aria-pressed="${isW}">
        ${isW ? `Winnaar · ${WIN_POINTS} punten` : has ? `Verliezer · ${LOSS_POINTS} punten — tik om winnaar te maken` : 'Kies als winnaar'}</button>
      <div class="stack" style="gap:8px">
        <div class="big" style="font-weight:600;color:var(--ink-2)">Vlaggen</div>
        <div class="flag-stepper">
          <button class="fs-btn" data-act="flag" data-k="${key}" data-mid="${esc(m.id)}" data-side="${side}" data-d="-1" ${!has || flags <= 0 ? 'disabled' : ''} aria-label="Eén vlag minder voor ${label.toLowerCase()}">${icon.minus}</button>
          <div class="fs-val" aria-live="polite"><b>${has ? flags : '–'}</b><span>van ${refs}</span></div>
          <button class="fs-btn" data-act="flag" data-k="${key}" data-mid="${esc(m.id)}" data-side="${side}" data-d="1" ${!has || flags >= refs ? 'disabled' : ''} aria-label="Eén vlag meer voor ${label.toLowerCase()}">${icon.plus}</button>
        </div>
        <div class="flag-dots" aria-hidden="true">${Array.from({ length: refs }, (_, i) => `<i style="background:${has && i < flags ? col : 'var(--track)'}"></i>`).join('')}</div>
      </div>
    </div></div>`;
}

function summaryText(c, m, d, pById) {
  if (!d.winner) return { text: 'Tik op de winnaar. Vlaggen staan dan op ' + d.refs + '–0; pas ze zo nodig aan met plus en min.', strong: false };
  const wp = pById[d.winner === 'red' ? m.redId : m.blueId];
  const wf = d.winner === 'red' ? d.fr : d.fb, lf = d.winner === 'red' ? d.fb : d.fr;
  return { text: `${displayName(wp)} (${d.winner === 'red' ? 'ROOD' : 'BLAUW'}) wint met ${wf}–${lf} vlaggen · ${WIN_POINTS} – ${LOSS_POINTS} punten. Vlaggen: rood ${d.fr}, blauw ${d.fb} (totaal ${d.fr + d.fb}).`, strong: true };
}

function timerCard(c, m, pById) {
  if (m.discipline !== 'kumite') return '';
  const r = pById[m.redId], b = pById[m.blueId];
  const tr = kumiteSecondsFor(c.ev, r), tb = kumiteSecondsFor(c.ev, b);
  const total = Math.max(tr, tb);
  const T = timer.matchId === m.id ? timer : null;
  const left = T ? T.left : total;
  const state = !T ? 'klaar' : T.running ? 'hajime' : left <= 0 ? 'yame' : 'gestopt';
  return `<div class="timer-card ${state}" id="timer-card">
    <div class="timer-signal" id="timer-signal">${state === 'hajime' ? 'HAJIME' : state === 'yame' ? 'YAME' : state === 'gestopt' ? 'YAME (gestopt)' : 'Klaar voor start'}</div>
    <div class="timer-main"><div class="timer-digits" id="timer-digits">${fmtClock(left)}</div>
      <div class="stack" style="gap:4px"><span class="small muted">Kumite op ${c.ev.settings.kumiteTarget === 'bal' ? 'de bal' : 'het stootkussen'} · tegelijk, zonder contact</span>
      ${tr !== tb ? `<span class="small"><span class="tag-red">Rood</span> ${tr} s &nbsp; <span class="tag-blue">Blauw</span> ${tb} s — ${tr < tb ? 'rood' : 'blauw'} stopt eerder (leeftijd)</span>` : `<span class="small">Beiden ${tr} seconden</span>`}</div></div>
    <div class="row">
      <button class="btn l timer-go" data-act="timerStart" data-mid="${esc(m.id)}" data-total="${total}" data-short="${Math.min(tr, tb)}" ${T?.running ? 'disabled' : ''}>${icon.play}Hajime — start</button>
      <button class="btn l timer-stop" data-act="timerStop" ${T?.running ? '' : 'disabled'}>${icon.stop}Yame — stop</button>
      <button class="btn" data-act="timerReset" data-mid="${esc(m.id)}">Opnieuw</button>
    </div></div>`;
}
function fmtClock(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

// Timer buiten de render-cyclus, zodat elke seconde niet het hele scherm hertekent.
const timer = { matchId: null, left: 0, running: false, end: 0, short: 0, total: 0, iv: null, shortSignaled: false };
function tick() {
  if (!timer.running) return;
  timer.left = (timer.end - Date.now()) / 1000;
  const el = document.getElementById('timer-digits');
  if (el) el.textContent = fmtClock(timer.left);
  if (!timer.shortSignaled && timer.short < timer.total && timer.total - timer.left >= timer.short) {
    timer.shortSignaled = true; buzz();
    const sig = document.getElementById('timer-signal'); if (sig) sig.textContent = 'YAME voor de jongste · andere loopt door';
  }
  if (timer.left <= 0) { timer.running = false; timer.left = 0; clearInterval(timer.iv); buzz(true); setCard('yame'); }
}
function setCard(state) {
  const card = document.getElementById('timer-card'); if (!card) return;
  card.className = 'timer-card ' + state;
  const sig = document.getElementById('timer-signal'); if (sig) sig.textContent = state === 'hajime' ? 'HAJIME' : state === 'yame' ? 'YAME' : 'YAME (gestopt)';
  card.querySelector('.timer-go')?.toggleAttribute('disabled', state === 'hajime');
  card.querySelector('.timer-stop')?.toggleAttribute('disabled', state !== 'hajime');
}
function buzz(long) {
  try { navigator.vibrate && navigator.vibrate(long ? [300, 120, 300] : 200); } catch { }
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = long ? 660 : 880; o.connect(g); g.connect(ac.destination);
    g.gain.value = .15; o.start(); o.stop(ac.currentTime + (long ? .9 : .25));
  } catch { }
}

function currentCard(c, pool, m, pById, total, cur) {
  const L = prefs(c);
  const d = L.drafts[m.id] || { winner: null, fr: 0, fb: 0, refs: refsFor(c, m) };
  const sum = summaryText(c, m, d, pById);
  const can = !!d.winner && d.fr + d.fb === d.refs && d.fr !== d.fb;
  return `<div class="card" style="gap:18px">
    <div class="row" style="align-items:baseline;gap:12px"><h3 style="font-size:26px">Huidige partij</h3><span class="big muted">Partij ${m.num}${m.kind === 'beslis' ? ' · beslispartij' : ''}${m.start != null ? ` · gepland ${fmtTime(m.start)}` : ''}</span>
      <div style="flex:1"></div>
      ${c.ev.settings.allowEmergencySingleReferee ? `<label class="check small"><input type="checkbox" ${d.refs === 1 ? 'checked' : ''} data-change="emergency" data-mid="${esc(m.id)}">Noodoptie: 1 scheidsrechter</label>` : ''}</div>
    ${d.refs === 1 ? note('warn', 'Deze partij wordt met één scheidsrechter beoordeeld.', 'Vlaggen vergelijken in de eindstand is minder betrouwbaar als partijen met verschillende aantallen scheidsrechters zijn beoordeeld.') : ''}
    ${timerCard(c, m, pById)}
    <div class="sides">${sideCard(c, m, 'red', d, pById)}${sideCard(c, m, 'blue', d, pById)}</div>
    <div class="row" style="gap:16px;padding-top:4px">
      <div style="flex:1;min-width:220px;font-size:18px;line-height:1.4;${sum.strong ? 'font-weight:600;color:var(--ink)' : 'color:var(--muted)'}" aria-live="polite">${esc(sum.text)}</div>
      <button class="btn l" style="font-weight:500" data-act="clearDraft" data-mid="${esc(m.id)}">Wissen</button>
      <button class="btn l dark" data-act="confirm" data-mid="${esc(m.id)}" data-pool="${esc(pool.id)}" ${can ? '' : 'disabled'}>Uitslag bevestigen</button>
    </div></div>`;
}

function prevCard(c, pool, pById) {
  const ev = c.ev, L = prefs(c);
  const played = queue(ev, pool).filter(m => resultFor(ev, m.id)).sort((a, b) => (resultFor(ev, b.id).updatedAt || '').localeCompare(resultFor(ev, a.id).updatedAt || ''));
  const m = played[0];
  if (!m) return '';
  const r = resultFor(ev, m.id);
  const editing = L.editing === m.id && !c.ui.correcting;
  if (editing) return editCard(c, m, pById, 'Vorige partij');
  const rw = r.winnerId === m.redId;
  return `<div class="card" style="padding:20px 24px;gap:14px">
    <div class="row"><div class="eyebrow" style="font-size:15px">Laatst afgerond · partij ${m.num}</div><div style="flex:1"></div>
      <button class="btn" data-act="startEdit" data-mid="${esc(m.id)}">${icon.edit}Wijzigen</button></div>
    <div class="prev-grid" data-act="startEdit" data-mid="${esc(m.id)}" role="button" tabindex="0" aria-label="Uitslag partij ${m.num} wijzigen">
      <div class="prev-side red"><div style="font-size:21px;font-weight:${rw ? 700 : 400}">${esc(displayName(pById[m.redId]))}</div><div class="muted">Rood · ${rw ? WIN_POINTS : LOSS_POINTS} punten${rw ? ' · winnaar' : ''}</div></div>
      <div class="prev-score"><div>${r.flagsRed} – ${r.flagsBlue}</div><span class="small muted">vlaggen</span></div>
      <div class="prev-side blue"><div style="font-size:21px;font-weight:${!rw ? 700 : 400}">${esc(displayName(pById[m.blueId]))}</div><div class="muted">Blauw · ${!rw ? WIN_POINTS : LOSS_POINTS} punten${!rw ? ' · winnaar' : ''}</div></div>
    </div>${r.history?.length ? `<div class="small muted">Gecorrigeerd (${r.history.length}×), laatst door ${esc(r.by || 'onbekend')}</div>` : ''}</div>`;
}

function editCard(c, m, pById, title) {
  const L = prefs(c);
  const d = L.drafts['edit:' + m.id];
  return `<div class="card" style="gap:14px;border-top:6px solid var(--warn-line)">
    <div class="row"><div class="eyebrow" style="font-size:15px">${esc(title)} · partij ${m.num} wijzigen</div></div>
    ${note('warn', 'Je wijzigt een uitslag die al is opgeslagen.', 'Na bevestigen wordt de poulestand direct bijgewerkt. De oude uitslag blijft in de wijzigingshistorie.')}
    <div class="sides">${sideCard(c, m, 'red', d, pById, { prefix: 'edit' })}${sideCard(c, m, 'blue', d, pById, { prefix: 'edit' })}</div>
    <div class="row end"><button class="btn l" data-act="cancelEdit">Annuleren</button><button class="btn l dark" data-act="saveEdit" data-mid="${esc(m.id)}" ${d.winner && d.fr !== d.fb && d.fr + d.fb === d.refs ? '' : 'disabled'}>Wijziging opslaan</button></div></div>`;
}

function nextList(c, pool, pById, cur, isActive) {
  const ev = c.ev, L = prefs(c);
  const open = queue(ev, pool).filter(m => !resultFor(ev, m.id) && (!cur || m.id !== cur.id));
  const items = (isActive ? open : [cur, ...open].filter(Boolean)).slice(0, 3);
  if (!items.length) return '';
  return `<div class="card" style="padding:20px 24px;gap:12px"><h3>${isActive ? 'Volgende partijen' : 'Klaarzetten'}</h3>
    ${items.map((m, i) => {
      const first = i === 0;
      const called = L.called[m.id];
      return `<div class="next-item ${first ? 'first' : ''}">
        <div class="row" style="gap:10px"><span class="next-tag ${first ? 'on' : ''}">${first ? (isActive ? 'Klaar maken' : 'Eerstvolgende') : 'Daarna'}</span><span class="muted">Partij ${m.num}${m.start != null ? ` · ${fmtTime(m.start)}` : ''}</span>${called ? '<span class="badge ok">Opgeroepen</span>' : ''}</div>
        <div class="next-vs" style="font-size:${first ? 20 : 18}px">
          <div class="nv red"><span class="sq red"></span><span><strong>${esc(displayName(pById[m.redId]))}</strong> — <span class="tag-red">rood</span></span></div>
          <span class="muted">tegen</span>
          <div class="nv blue"><span><strong>${esc(displayName(pById[m.blueId]))}</strong> — <span class="tag-blue">blauw</span></span><span class="sq blue"></span></div>
        </div>
        ${first ? `<div class="row small muted">Band: ${pById[m.redId] ? beltChip(pById[m.redId]) : ''} &nbsp;·&nbsp; ${pById[m.blueId] ? beltChip(pById[m.blueId]) : ''}</div>
          <div class="row"><button class="btn s" data-act="call" data-mid="${esc(m.id)}">${called ? 'Opnieuw oproepen' : 'Oproepen'}</button>${!isActive ? `<button class="btn s dark" data-act="activateMatch" data-mid="${esc(m.id)}" data-pool="${esc(pool.id)}">Nu op de tatami</button>` : ''}</div>` : ''}
      </div>`;
    }).join('')}</div>`;
}

function standingsCard(c, pool, cur) {
  const st = standings(c.ev, pool);
  return `<div class="card" style="padding:20px 24px;gap:8px"><h3>Klassement</h3>
    <div class="st-row st-head"><span>#</span><span>Naam</span><span class="right">Gesp.</span><span class="right">Vlag.</span><span class="right">Punten</span></div>
    ${st.rows.map(r => `<div class="st-row"><span style="font-size:19px;font-weight:600">${r.pos}</span>
      <div class="row" style="gap:10px;flex-wrap:nowrap;min-width:0"><span style="flex:none;width:6px;height:32px;background:${cur && r.id === cur.redId ? RED : cur && r.id === cur.blueId ? BLUE : 'transparent'}"></span><span style="font-size:18px;font-weight:500">${esc(r.name)}${cur && r.id === cur.redId ? ' <span class="tag-red">nu</span>' : cur && r.id === cur.blueId ? ' <span class="tag-blue">nu</span>' : ''}</span></div>
      <span class="right muted big">${r.played}/${r.total}</span><span class="right muted big">${r.flags}</span><span class="right" style="font-size:20px;font-weight:600">${r.points}</span></div>`).join('')}
    ${st.mixedRefs ? note('warn', 'In deze poule zijn partijen met verschillende aantallen scheidsrechters beoordeeld.', 'Vergelijk vlaggen voor de eindstand met voorzichtigheid.') : ''}
    ${st.pending ? note('warn', `Gelijke stand op een prijsplaats: ${st.ties.map(t => t.names.join(' en ')).join('; ')}.`, 'Plan een beslispartij of leg een beslissing vast via Poulewinnaars.', `<a class="btn s" href="#${esc(c.evPath('winnaars', pool.id))}">Oplossen</a>`) : ''}</div>`;
}

function panel(c, slotIdx, pById) {
  const ev = c.ev, L = prefs(c);
  const pool = ev.pools.find(p => p.id === L.slots[slotIdx]);
  const isActive = L.active === slotIdx;
  const avail = poolsForField(ev, L.fieldId);
  const chooser = `<select class="select s" data-change="choosePool" data-slot="${slotIdx}" aria-label="Kies poule" style="max-width:260px"><option value="">Andere poule kiezen…</option>${avail.map(p => { const st = standings(ev, p); return `<option value="${esc(p.id)}" ${p.id === pool?.id ? 'selected' : ''}>${esc(p.name)} · ${st.done}/${st.total}${st.complete ? ' ✓' : ''}</option>`; }).join('')}</select>`;
  if (!pool) return `<section class="live-panel"><div class="card bar-grey"><h2>${slotIdx === L.active ? 'Actieve poule' : 'Volgende poule'}</h2><p class="muted big">Kies een poule.</p>${chooser}</div></section>`;
  const q = queue(ev, pool);
  const done = q.filter(m => resultFor(ev, m.id)).length;
  const cur = currentMatch(c, pool);
  const st = standings(ev, pool);
  const editing = !c.ui.correcting && L.editing && q.some(m => m.id === L.editing);
  return `<section class="live-panel ${isActive ? 'is-active' : ''}" id="panel-${slotIdx}" aria-label="${isActive ? 'Actieve poule' : 'Volgende poule'}: ${esc(pool.name)}">
    <div class="card" style="border-top:6px solid ${isActive ? 'var(--blue)' : 'var(--disabled)'}">
      <div class="row" style="align-items:flex-start;gap:16px">
        <div class="stack" style="flex:1;min-width:240px;gap:6px">
          <div class="row" style="gap:12px"><h2 style="font-size:34px">${esc(pool.name)}</h2>
            ${isActive ? '<span class="live-badge"><i></i>Op de tatami</span>' : '<span class="badge">Volgende poule</span>'}</div>
          <div style="font-size:19px;color:var(--ink-2)">${esc(categoryLabel(ev, pool))} · ${DISCIPLINES[pool.discipline]}${pool.discipline === 'kumite' ? ` op ${ev.settings.kumiteTarget}` : ''} · ${pool.participantIds.length} deelnemers</div>
        </div>
        ${!isActive ? `<button class="btn l dark" data-act="activate" data-slot="${slotIdx}">Zet op de tatami</button>` : ''}
      </div>
      <div class="row" style="gap:16px">
        <div style="font-size:17px;font-weight:600;white-space:nowrap">${cur ? `Partij ${cur.num} van ${q.length}` : `${done} van ${q.length} gespeeld`}</div>
        <div class="segs">${q.map(m => `<i class="${resultFor(ev, m.id) ? 'done' : cur && m.id === cur.id ? 'now' : ''}"></i>`).join('')}</div>
        <button class="link-arrow" data-act="openSchedule" data-pool="${esc(pool.id)}">Bekijk volledig schema ${icon.arrow}</button>
      </div>
      <div class="row">${chooser}</div>
    </div>
    <div class="live-grid">
      <div class="stack" style="gap:16px;min-width:0">
        ${isActive || editing ? prevCard(c, pool, pById) : ''}
        ${isActive && cur && !editing ? currentCard(c, pool, cur, pById, q.length, done) : ''}
        ${!cur ? `<div class="card"><h3>Poule afgerond</h3><p class="big">Alle partijen zijn gespeeld. ${st.pending ? 'Er is nog een gelijke stand op een prijsplaats.' : `Winnaar: <strong>${esc(st.rows[0]?.name || '–')}</strong>.`}</p>
          <div class="row"><a class="btn" href="#${esc(c.evPath('winnaars', pool.id))}">${icon.trophy}Eindstand bekijken</a><button class="btn dark" data-act="nextPool" data-slot="${slotIdx}">Volgende poule kiezen</button></div></div>` : ''}
        ${!isActive ? nextList(c, pool, pById, cur, false) : ''}
      </div>
      <div class="stack" style="gap:16px;min-width:0">
        ${isActive ? nextList(c, pool, pById, cur, true) : ''}
        ${standingsCard(c, pool, isActive ? cur : null)}
      </div>
    </div>
  </section>`;
}

function scheduleModal(c, pById) {
  const ev = c.ev, L = prefs(c);
  const poolId = c.ui.schedPool;
  if (poolId === undefined) return '';
  const fById = byId(ev.fields);
  let body;
  if (poolId === 'algemeen') {
    const fields = L.fieldId === 'alle' ? ev.fields : ev.fields.filter(f => f.id === L.fieldId);
    body = `<p class="muted big">Kies een poule om het schema te openen, of zet hem direct op de tatami of klaar als volgende.</p>
      ${fields.map(f => { const ps = ev.pools.filter(p => p.fieldId === f.id); return `<h3>${esc(f.name)}</h3><div class="stack" style="gap:8px">${ps.map(p => { const st = standings(ev, p); const s = ev.matches.filter(m => m.poolId === p.id && m.start != null); return `<div class="gen-row">
        <div class="stack" style="gap:2px;flex:1;min-width:200px"><strong style="font-size:19px">${esc(p.name)}</strong><span class="muted">${esc(categoryLabel(ev, p))} · ${DISCIPLINES[p.discipline]}${s.length ? ` · ${fmtTime(Math.min(...s.map(m => m.start)))}–${fmtTime(Math.max(...s.map(m => m.end)))}` : ''}</span></div>
        <span class="badge ${st.complete ? 'ok' : st.done ? 'blue' : ''}">${st.done}/${st.total}${st.complete ? ' klaar' : ''}</span>
        <button class="btn s" data-act="openSchedule" data-pool="${esc(p.id)}">Schema</button>
        <button class="btn s" data-act="putSlot" data-pool="${esc(p.id)}" data-slot="active">Op de tatami</button>
        <button class="btn s" data-act="putSlot" data-pool="${esc(p.id)}" data-slot="next">Als volgende</button></div>`; }).join('') || '<p class="muted">Geen poules op dit veld.</p>'}</div>`; }).join('')}
      ${ev.pools.some(p => !p.fieldId) ? `<h3>Nog zonder veld</h3>${ev.pools.filter(p => !p.fieldId).map(p => `<div class="gen-row"><strong style="flex:1">${esc(p.name)}</strong><button class="btn s" data-act="openSchedule" data-pool="${esc(p.id)}">Schema</button><button class="btn s" data-act="putSlot" data-pool="${esc(p.id)}" data-slot="active">Op de tatami</button></div>`).join('')}` : ''}`;
  } else {
    const pool = ev.pools.find(p => p.id === poolId);
    const q = queue(ev, pool), cur = currentMatch(c, pool);
    body = `<div class="row"><button class="btn" data-act="openSchedule" data-pool="algemeen">${icon.back}Terug naar algemeen schema</button>
        <button class="btn" data-act="putSlot" data-pool="${esc(pool.id)}" data-slot="active">Op de tatami</button><button class="btn" data-act="putSlot" data-pool="${esc(pool.id)}" data-slot="next">Als volgende poule</button></div>
      <div class="muted big">${esc(categoryLabel(ev, pool))} · ${DISCIPLINES[pool.discipline]} · ${esc(fById[pool.fieldId]?.name || 'geen veld')}</div>
      ${q.map(m => { const r = resultFor(ev, m.id); const now = cur && m.id === cur.id; return `<div class="sched-row" style="background:${now ? 'var(--blue-tint)' : '#fff'}">
        <span class="num" style="font-size:17px;font-weight:600;color:var(--muted)">${m.num}</span>
        <div class="stack" style="gap:2px;min-width:0"><span class="row" style="gap:8px;font-size:17px;font-weight:${r && r.winnerId === m.redId ? 700 : 400}"><span class="sq red"></span>${esc(displayName(pById[m.redId]))} <span class="small muted">rood</span></span>
          <span class="row" style="gap:8px;font-size:17px;font-weight:${r && r.winnerId === m.blueId ? 700 : 400}"><span class="sq blue"></span>${esc(displayName(pById[m.blueId]))} <span class="small muted">blauw</span></span></div>
        <span class="small muted">${m.start != null ? fmtTime(m.start) : ''}${m.kind === 'beslis' ? ' · beslis' : ''}</span>
        <span style="font-size:16px;font-weight:600;text-align:right;color:${r ? 'var(--ink)' : now ? 'var(--blue)' : 'var(--muted-2)'}">${r ? `${r.flagsRed} – ${r.flagsBlue}` : now ? 'Nu bezig' : 'Gepland'}</span>
        ${r ? `<button class="btn s" data-act="correct" data-mid="${esc(m.id)}" data-pool="${esc(pool.id)}">${icon.edit}Corrigeren</button>` : !now ? `<button class="btn s" data-act="playNow" data-mid="${esc(m.id)}" data-pool="${esc(pool.id)}">Nu spelen</button>` : '<span></span>'}
      </div>`; }).join('')}`;
  }
  const title = poolId === 'algemeen' ? 'Algemeen schema' : `Volledig poule-schema · ${esc(ev.pools.find(p => p.id === poolId)?.name || '')}`;
  return `<div class="scrim" data-act="closeSchedule"></div><div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-act="closeSchedule" aria-label="Sluiten">${icon.close}</button></div>
    <div class="modal-body">${body}</div></div>`;
}

function correctModal(c, pById) {
  const mid = c.ui.correcting;
  if (!mid) return '';
  const m = c.ev.matches.find(x => x.id === mid);
  return `<div class="scrim" data-act="cancelEdit"></div><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>Uitslag corrigeren</h2><button class="icon-btn" data-act="cancelEdit" aria-label="Sluiten">${icon.close}</button></div>
    <div class="modal-body">${editCard(c, m, pById, c.ev.pools.find(p => p.id === m.poolId)?.name || '')}</div></div>`;
}

export function headerExtra(c) {
  const L = prefs(c); ensureSlots(c);
  const ev = c.ev;
  const pools = L.slots.map(id => ev.pools.find(p => p.id === id));
  const two = pools.filter(Boolean).length === 2;
  return `${two ? `<div class="row hdr-switch" style="gap:14px"><span class="muted big hide-s">Op de tatami</span><div class="seg">${pools.map((p, i) => `<button class="${L.active === i ? 'on' : ''}" data-act="activate" data-slot="${i}" style="min-width:132px;max-width:280px;min-height:56px;font-size:16px;line-height:1.2;white-space:normal;text-align:left">${esc(p.name)}</button>`).join('')}</div></div>` : ''}
    <button class="btn primary hdr-live-btn" style="height:56px;font-size:18px" data-act="openSchedule" data-pool="${esc(pools[L.active]?.id || 'algemeen')}">Volledig poule-schema</button>`;
}

export function render(c) {
  const ev = c.ev, L = prefs(c);
  ensureSlots(c);
  if (c.ui.pendingCorrect) {
    const m = ev.matches.find(x => x.id === c.ui.pendingCorrect), r = m && resultFor(ev, m.id);
    c.ui.pendingCorrect = null;
    if (r) { L.editing = m.id; c.ui.correcting = m.id; L.drafts['edit:' + m.id] = { winner: r.winnerId === m.redId ? 'red' : 'blue', fr: r.flagsRed, fb: r.flagsBlue, refs: r.referees || 3 }; }
  }
  const pById = byId(ev.participants);
  const fieldOpts = [['alle', 'Alle velden'], ...ev.fields.map(f => [f.id, f.name])];
  if (!ev.pools.length) return `<main class="page"><div class="card"><h2>Nog geen poules</h2><p class="big muted">Maak eerst poules en een planning. Daarna kan de tafel hier uitslagen invoeren.</p><a class="btn dark l" href="#${esc(c.evPath('poules'))}">Naar poules</a></div></main>`;
  return `<main class="page wide live">
    <div class="live-toolbar">
      <label class="row" style="gap:10px"><span class="big" style="font-weight:600">Veld</span><select class="select" data-change="field" style="min-width:200px">${fieldOpts.map(([k, l]) => `<option value="${esc(k)}" ${L.fieldId === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <button class="btn" data-act="openSchedule" data-pool="algemeen">Algemeen schema</button>
      <label class="check"><input type="checkbox" ${L.autoSwitch ? 'checked' : ''} data-change="autoSwitch">Na elke uitslag wisselen tussen poules</label>
      <div style="flex:1"></div>
      <button class="btn ghost" data-act="operator">Tafel: <strong>${esc(c.state.operator || 'naam invullen')}</strong></button>
      ${isConfigured(ev) ? syncButton(c) : ''}
      <a class="btn" href="#${esc(c.evPath('winnaars'))}">${icon.trophy}Poulewinnaars bekijken</a>
    </div>
    <div class="live-jump" role="navigation" aria-label="Snel naar poule">${[0, 1].map(i => { const p = ev.pools.find(x => x.id === L.slots[i]); return p ? `<a class="btn s ${L.active === i ? 'dark' : ''}" href="#panel-${i}" data-act="jump" data-slot="${i}">${esc(p.name)}${L.active === i ? ' · op de tatami' : ' · volgende'}</a>` : ''; }).join('')}</div>
    <div class="live-panels">${[0, 1].map(i => panel(c, i, pById)).join('')}</div>
    ${scheduleModal(c, pById)}
    ${correctModal(c, pById)}
  </main>`;
}

function syncButton(c) {
  const lp = c.ui.lastPush;
  const pending = !lp || lp.rev < c.ev.rev;
  const label = c.ui.syncBusy ? 'Bezig met versturen…' : pending ? 'Synchroniseren' : 'Alles verstuurd';
  const when = lp ? ` · laatst ${fmtTime(new Date(lp.at).getHours() * 3600 + new Date(lp.at).getMinutes() * 60)}` : '';
  return `<button class="btn ${pending ? 'primary' : ''}" data-act="syncNow" ${c.ui.syncBusy ? 'disabled' : ''} title="Stuurt een kopie van de uitslagen naar de cloud. De uitslagen blijven altijd op deze iPad.">${icon.upload}${label}<span class="small" style="font-weight:400">${when}</span></button>`;
}

async function ensureDeviceName(c) {
  if (c.state.device.name) return true;
  const name = await c.confirm({ title: 'Naam van deze iPad', text: 'Geef deze iPad een herkenbare naam. Die zie je terug bij het ophalen, zodat je weet van welke tafel de uitslagen komen.', ok: 'Opslaan', input: { label: 'Naam', placeholder: 'Bijv. Tablet veld 1' } });
  if (!name || !name.trim()) return false;
  await c.setDeviceName(name.trim());
  return true;
}

async function doPush(c, quiet) {
  if (c.ui.syncBusy) return;
  if (!quiet && !await ensureDeviceName(c)) return;
  c.ui.syncBusy = true; if (!quiet) c.render();
  try {
    await c.flush();
    c.ui.lastPush = await push(c.ev, c.state.device);
    if (!quiet) c.toast(`Verstuurd: ${c.ui.lastPush.count} uitslagen staan ook in de cloud.`);
  } catch (err) {
    if (!quiet) c.toast(err.message, 'error');
  } finally { c.ui.syncBusy = false; c.render(); }
}

export function mount(c) {
  if (c && c.ui.lastPush === undefined) { c.ui.lastPush = null; lastPush(c.ev).then(lp => { c.ui.lastPush = lp; if (lp) c.render(); }); }
  if (timer.running) { clearInterval(timer.iv); timer.iv = setInterval(tick, 200); }
}

// ---------- Acties ----------
function draftFor(c, key, mid) {
  const L = prefs(c);
  const k = key === 'edit' ? 'edit:' + mid : mid;
  const m = c.ev.matches.find(x => x.id === mid);
  if (!L.drafts[k]) L.drafts[k] = { winner: null, fr: 0, fb: 0, refs: refsFor(c, m) };
  return L.drafts[k];
}

async function ensureOperator(c) {
  if (c.state.operator) return true;
  const name = await c.confirm({ title: 'Wie zit er aan de tafel?', text: 'Je naam wordt bij elke uitslag en correctie bewaard in de wijzigingshistorie.', ok: 'Opslaan', input: { label: 'Naam tafelmedewerker', placeholder: 'Bijv. Anna (tafel veld 1)' } });
  if (!name || !name.trim()) return false;
  await c.setOperator(name.trim());
  return true;
}

export const actions = {
  field(c, el) { const L = prefs(c); L.fieldId = el.value; L.slots = [null, null]; L.active = 0; ensureSlots(c); persist(c); c.render(); },
  autoSwitch(c, el) { prefs(c).autoSwitch = el.checked; persist(c); },
  activate(c, el) { const L = prefs(c); L.active = +el.dataset.slot; persist(c); c.render(); },
  choosePool(c, el) {
    if (!el.value) return;
    const L = prefs(c), i = +el.dataset.slot;
    if (L.slots[1 - i] === el.value) L.slots[1 - i] = L.slots[i];
    L.slots[i] = el.value; persist(c); c.render();
  },
  nextPool(c, el) {
    const L = prefs(c), ev = c.ev, i = +el.dataset.slot;
    const cand = poolsForField(ev, L.fieldId).find(p => !L.slots.includes(p.id) && queue(ev, p).some(m => !resultFor(ev, m.id)));
    if (!cand) { c.toast('Er zijn geen poules meer met open partijen op dit veld.'); return; }
    L.slots[i] = cand.id; persist(c); c.render();
  },
  putSlot(c, el) {
    const L = prefs(c);
    const i = el.dataset.slot === 'active' ? L.active : 1 - L.active;
    if (L.slots[1 - i] === el.dataset.pool) L.slots[1 - i] = L.slots[i];
    L.slots[i] = el.dataset.pool;
    c.ui.schedPool = undefined; persist(c); c.render();
  },
  win(c, el) {
    const d = draftFor(c, el.dataset.k, el.dataset.mid);
    const side = el.dataset.side;
    d.winner = side;
    if (side === 'red') { d.fr = d.refs; d.fb = 0; } else { d.fb = d.refs; d.fr = 0; }
    c.render();
  },
  flag(c, el) {
    const d = draftFor(c, el.dataset.k, el.dataset.mid);
    if (!d.winner) return;
    const side = el.dataset.side, delta = +el.dataset.d;
    // Een vlag erbij aan de ene kant gaat er aan de andere kant af: totaal blijft gelijk aan het aantal scheidsrechters.
    if (side === 'red') { d.fr = Math.max(0, Math.min(d.refs, d.fr + delta)); d.fb = d.refs - d.fr; }
    else { d.fb = Math.max(0, Math.min(d.refs, d.fb + delta)); d.fr = d.refs - d.fb; }
    const before = d.winner;
    d.winner = d.fr > d.fb ? 'red' : 'blue';
    if (before !== d.winner) c.toast(`De meeste vlaggen gaan nu naar ${d.winner === 'red' ? 'ROOD' : 'BLAUW'}: die is nu winnaar.`);
    c.render();
  },
  emergency(c, el) {
    const L = prefs(c), m = c.ev.matches.find(x => x.id === el.dataset.mid);
    L.drafts[m.id] = { winner: null, fr: 0, fb: 0, refs: el.checked ? 1 : (c.ev.settings.referees || 3) };
    c.render();
  },
  clearDraft(c, el) { delete prefs(c).drafts[el.dataset.mid]; c.render(); },
  async confirm(c, el) {
    if (!await ensureOperator(c)) return;
    const L = prefs(c), ev = c.ev;
    const m = ev.matches.find(x => x.id === el.dataset.mid);
    const d = L.drafts[m.id];
    if (!d || !d.winner) return;
    if (resultFor(ev, m.id)) { c.toast('Deze partij heeft al een uitslag (mogelijk op een ander scherm ingevoerd). Gebruik Corrigeren.', 'error'); delete L.drafts[m.id]; c.render(); return; }
    const res = c.mutate(ev => saveResult(ev, m, { flagsRed: d.fr, flagsBlue: d.fb, referees: d.refs, by: c.state.operator, deviceId: c.state.device.id }), { reason: 'uitslag', silent: true });
    if (!res.ok) { c.toast(res.errors.join(' '), 'error'); return; }
    delete L.drafts[m.id]; delete L.override[m.poolId];
    if (timer.matchId === m.id) { clearInterval(timer.iv); timer.matchId = null; timer.running = false; }
    // Afwisselend afwerken: naar de andere poule als die nog partijen heeft.
    const other = ev.pools.find(p => p.id === L.slots[1 - L.active]);
    if (L.autoSwitch && other && currentMatch(c, other)) { L.active = 1 - L.active; persist(c); }
    const pById = byId(ev.participants);
    c.toast(`Opgeslagen: ${displayName(pById[res.result.winnerId])} wint (${d.fr}–${d.fb}).`);
    // Automatisch een kopie versturen als er internet is; lukt dat niet, dan gebeurt er niets (de uitslag staat al op de iPad).
    if (isConfigured(ev) && navigator.onLine) setTimeout(() => doPush(c, true), 300);
    c.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  startEdit(c, el) {
    const L = prefs(c), r = resultFor(c.ev, el.dataset.mid), m = c.ev.matches.find(x => x.id === el.dataset.mid);
    L.editing = m.id;
    L.drafts['edit:' + m.id] = { winner: r.winnerId === m.redId ? 'red' : 'blue', fr: r.flagsRed, fb: r.flagsBlue, refs: r.referees || 3 };
    c.render();
  },
  correct(c, el) { actions.startEdit(c, el); c.ui.correcting = el.dataset.mid; c.ui.schedPool = undefined; c.render(); },
  cancelEdit(c) { const L = prefs(c); delete L.drafts['edit:' + L.editing]; L.editing = null; c.ui.correcting = null; c.render(); },
  async saveEdit(c, el) {
    if (!await ensureOperator(c)) return;
    const L = prefs(c), m = c.ev.matches.find(x => x.id === el.dataset.mid);
    const d = L.drafts['edit:' + m.id];
    const r = resultFor(c.ev, m.id);
    const pById = byId(c.ev.participants);
    const ok = await c.confirm({ title: 'Opgeslagen uitslag wijzigen?', text: `Oud: ${displayName(pById[r.winnerId])} wint, vlaggen rood ${r.flagsRed} – blauw ${r.flagsBlue}. Nieuw: ${displayName(pById[d.winner === 'red' ? m.redId : m.blueId])} wint, vlaggen rood ${d.fr} – blauw ${d.fb}. De wijziging wordt met jouw naam (${c.state.operator}) in de historie bewaard.`, ok: 'Ja, wijzigen' });
    if (!ok) return;
    const res = c.mutate(ev => saveResult(ev, m, { flagsRed: d.fr, flagsBlue: d.fb, referees: d.refs, by: c.state.operator, deviceId: c.state.device.id, reason: 'correctie aan tafel' }), { reason: 'uitslag gecorrigeerd', snapshot: true, silent: true });
    if (!res.ok) { c.toast(res.errors.join(' '), 'error'); return; }
    delete L.drafts['edit:' + m.id]; L.editing = null; c.ui.correcting = null;
    c.toast('Uitslag gewijzigd; klassement bijgewerkt.');
    c.render();
  },
  call(c, el) { prefs(c).called[el.dataset.mid] = Date.now(); c.render(); },
  activateMatch(c, el) { const L = prefs(c); L.override[el.dataset.pool] = el.dataset.mid; L.active = L.slots.indexOf(el.dataset.pool); persist(c); c.render(); },
  playNow(c, el) { const L = prefs(c); L.override[el.dataset.pool] = el.dataset.mid; if (!L.slots.includes(el.dataset.pool)) L.slots[L.active] = el.dataset.pool; L.active = L.slots.indexOf(el.dataset.pool); c.ui.schedPool = undefined; persist(c); c.render(); },
  jump(c, el) { document.getElementById('panel-' + el.dataset.slot)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  openSchedule(c, el) { c.ui.schedPool = el.dataset.pool || 'algemeen'; c.render(); },
  closeSchedule(c) { c.ui.schedPool = undefined; c.render(); },
  syncNow(c) { doPush(c, false); },
  async operator(c) {
    const name = await c.confirm({ title: 'Naam tafelmedewerker', text: 'Wordt bewaard bij elke uitslag en correctie.', ok: 'Opslaan', input: { label: 'Naam', value: c.state.operator } });
    if (name !== false) { await c.setOperator(name.trim()); c.render(); }
  },
  timerStart(c, el) {
    const total = +el.dataset.total;
    if (timer.matchId !== el.dataset.mid) Object.assign(timer, { matchId: el.dataset.mid, left: total, total, short: +el.dataset.short, shortSignaled: false });
    if (timer.left <= 0) { timer.left = total; timer.shortSignaled = false; }
    timer.running = true; timer.end = Date.now() + timer.left * 1000;
    clearInterval(timer.iv); timer.iv = setInterval(tick, 200);
    buzz(); setCard('hajime');
  },
  timerStop() { if (!timer.running) return; tick(); timer.running = false; clearInterval(timer.iv); setCard('gestopt'); },
  timerReset(c) { clearInterval(timer.iv); timer.running = false; timer.matchId = null; c.render(); },
};
