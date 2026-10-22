// Kuro Cup Planner — app-kern: status, routering, opslaan en weergave.
import * as store from './store.js';
import { esc, deepClone, fmtDate } from './util.js';
import { icon, toast, confirmDialog } from './ui.js';
import { newEvent, migrate } from './model.js';
import { upgradeNames, syncLegs } from './pools.js';

import * as vEvents from './views/events.js';
import * as vOverview from './views/overview.js';
import * as vSettings from './views/settings.js';
import * as vParticipants from './views/participants.js';
import * as vPools from './views/pools.js';
import * as vPlanning from './views/planning.js';
import * as vVolunteers from './views/volunteers.js';
import * as vLive from './views/live.js';
import * as vWinners from './views/winners.js';
import * as vData from './views/data.js';
import * as vDocs from './views/docs.js';
import * as vCosts from './views/costs.js';

const VIEWS = {
  overzicht: { mod: vOverview, label: 'Overzicht', group: 'Voorbereiden' },
  evenement: { mod: vSettings, label: 'Evenement & velden', group: 'Voorbereiden' },
  deelnemers: { mod: vParticipants, label: 'Deelnemers', group: 'Voorbereiden' },
  poules: { mod: vPools, label: 'Poules', group: 'Voorbereiden' },
  planning: { mod: vPlanning, label: 'Planning', group: 'Voorbereiden' },
  vrijwilligers: { mod: vVolunteers, label: 'Vrijwilligers', group: 'Voorbereiden' },
  kosten: { mod: vCosts, label: 'Kosten', group: 'Voorbereiden' },
  live: { mod: vLive, label: 'Wedstrijd live (tafel)', group: 'Wedstrijddag' },
  winnaars: { mod: vWinners, label: 'Poulewinnaars & uitslagen', group: 'Wedstrijddag' },
  documenten: { mod: vDocs, label: 'Documenten & printen', group: 'Wedstrijddag' },
  gegevens: { mod: vData, label: 'Gegevens delen & back-up', group: 'Gegevens' },
};

const state = {
  device: null,
  operator: '',
  events: [],
  ev: null,
  route: { view: 'home', args: [] },
  menu: false,
  exportInfo: null,
  ui: {},          // tijdelijke schermstatus per view (bijv. geopende dialoog)
};

const root = document.getElementById('app');

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'e' && parts[1]) return { eventId: parts[1], view: parts[2] || 'overzicht', args: parts.slice(3) };
  return { view: 'home', args: [] };
}

export function go(path) {
  if (location.hash === '#' + path) render(); else location.hash = path;
}
export const evPath = (view, ...args) => `/e/${encodeURIComponent(state.ev.id)}/${view}${args.length ? '/' + args.map(encodeURIComponent).join('/') : ''}`;

async function onRoute() {
  const r = parseHash();
  state.menu = false;
  if (r.eventId) {
    if (!state.ev || state.ev.id !== r.eventId) {
      const ev = await store.getEvent(r.eventId);
      if (!ev) { toast('Dit evenement bestaat niet (meer) op dit apparaat.', 'error'); go('/'); return; }
      state.ev = ev;
      const named = upgradeNames(ev), legs = syncLegs(ev);
      if (named || legs) await store.saveEvent(ev, { reason: legs ? 'poules van 3: twee keer tegen elkaar' : 'poulenamen bijgewerkt' });
      state.ui = {};
      await store.setMeta('lastEventId', ev.id);
    }
    state.exportInfo = await store.exportState(state.ev);
  } else {
    state.ev = null;
    state.events = await store.listEvents();
  }
  const changedView = state.route.view !== r.view;
  state.route = r;
  render();
  if (changedView) window.scrollTo(0, 0);
}

// Wijzig het evenement, sla lokaal op en teken opnieuw.
let saveChain = Promise.resolve();
export function mutate(fn, { reason = 'wijziging', snapshot = false, silent = false } = {}) {
  const ev = state.ev;
  const res = fn(ev);
  ev.rev = (ev.rev || 0) + 1;
  saveChain = saveChain.then(() => store.saveEvent(ev, { reason, forceSnapshot: snapshot }))
    .catch(err => { console.error(err); toast('Opslaan is mislukt: ' + err.message, 'error'); });
  if (!silent) render();
  return res;
}
export async function flush() { await saveChain; }

export async function replaceEvent(ev, reason) {
  await flush();
  state.ev = migrate(ev);
  state.ev.rev = (state.ev.rev || 0) + 1;
  await store.saveEvent(state.ev, { reason, forceSnapshot: true });
  state.exportInfo = await store.exportState(state.ev);
  render();
}

export async function createEvent(overrides = {}, open = true) {
  const ev = { ...newEvent(state.device.id), ...overrides };
  await store.saveEvent(ev, { reason: 'aangemaakt', forceSnapshot: true });
  if (open) go(`/e/${ev.id}/overzicht`);
  return ev;
}

export async function setOperator(name) {
  state.operator = name;
  await store.setMeta('operator', name);
}
export async function setDeviceName(name) {
  state.device.name = name;
  await store.setMeta('deviceName', name);
}
export async function refreshExportInfo() {
  state.exportInfo = state.ev ? await store.exportState(state.ev) : null;
  render();
}

function ctx() {
  return { state, ev: state.ev, ui: state.ui, go, evPath, mutate, render, toast, confirm: confirmDialog, store, replaceEvent, createEvent, setOperator, setDeviceName, refreshExportInfo, flush, args: state.route.args };
}

function exportPill() {
  const ev = state.ev;
  if (!ev) return '';
  const info = state.exportInfo;
  const fresh = info && info.rev >= ev.rev;
  const label = !info ? 'Alleen op dit apparaat' : fresh ? 'Geëxporteerd' : 'Niet geëxporteerd';
  return `<button class="local-pill ${fresh ? 'saved' : 'unsaved'}" data-act="go" data-to="${esc(evPath('gegevens'))}" title="${!info ? 'Nog nooit geëxporteerd: gegevens staan alleen op dit apparaat.' : fresh ? 'Alle wijzigingen zitten in de laatste export.' : 'Er zijn wijzigingen sinds de laatste export; ze staan alleen op dit apparaat.'} Tik om te exporteren."><span class="dot"></span>${esc(label)}</button>`;
}

function header(view) {
  const ev = state.ev;
  const title = ev ? ev.info.name : 'Kuro Cup Planner';
  const sub = ev ? [fmtDate(ev.info.date), ev.info.location].filter(x => x && x !== '–').join(' · ') || 'Datum en locatie nog invullen' : 'Toernooiplanner van Dojo Kuro';
  return `<header class="app-header"><div class="bar">
    <button class="menu-btn" data-act="menu" aria-expanded="${state.menu}">${icon.menu}Menu</button>
    <a class="brand" href="#${ev ? esc(evPath('overzicht')) : '/'}">
      <img src="assets/logo-white-bg.png" alt="Dojo Kuro">
      <div style="display:flex;flex-direction:column;gap:2px;min-width:0"><div class="t1">${esc(title)}${ev?.isSample ? ' <span class="badge sample">Voorbeeld</span>' : ''}</div><div class="t2">${esc(sub)}</div></div>
    </a>
    <div class="spacer"></div>
    ${view?.mod?.headerExtra ? view.mod.headerExtra(ctx()) : ''}
    ${exportPill()}
  </div></header>`;
}

function drawer() {
  if (!state.menu) return '';
  const ev = state.ev;
  let items = '';
  if (ev) {
    let grp = '';
    for (const [key, v] of Object.entries(VIEWS)) {
      if (v.group !== grp) { grp = v.group; items += `<div class="grp">${esc(grp)}</div>`; }
      items += `<a href="#${esc(evPath(key))}" class="${state.route.view === key ? 'on' : ''}">${esc(v.label)}</a>`;
    }
    items += `<div class="grp">Algemeen</div>`;
  }
  items += `<a href="#/" class="${!ev ? 'on' : ''}">Alle evenementen</a>`;
  return `<div class="scrim" data-act="menu-close"></div>
    <aside class="drawer" aria-label="Menu"><div class="drawer-head"><img src="assets/logo-white-bg.png" alt=""><span>Dojo Kuro</span>
    <button class="icon-btn" data-act="menu-close" aria-label="Sluiten">${icon.close}</button></div><nav>${items}</nav>
    <div style="padding:16px 28px;margin-top:auto" class="small muted">Apparaat: ${esc(state.device?.name || 'naam nog niet ingesteld')}</div></aside>`;
}

let currentView = null;
export function render() {
  const r = state.route;
  const view = r.view === 'home' || !state.ev ? { mod: vEvents } : VIEWS[r.view] || VIEWS.overzicht;
  currentView = view;
  const c = ctx();
  const scrollY = window.scrollY;
  const active = document.activeElement && document.activeElement.id;
  let body;
  try { body = view.mod.render(c); }
  catch (err) { console.error(err); body = `<main class="page"><div class="note error"><div class="txt"><div>Er ging iets mis bij het tonen van dit scherm.</div><div class="fix">${esc(err.message)} — ververs de pagina. Je gegevens zijn lokaal bewaard.</div></div></div></main>`; }
  root.innerHTML = (view.mod.bare ? '' : header(view)) + body + drawer();
  window.scrollTo(0, scrollY);
  if (active) { const el = document.getElementById(active); if (el && el.focus) { el.focus(); if (el.setSelectionRange && /text|search/.test(el.type)) { const n = el.value.length; el.setSelectionRange(n, n); } } }
  view.mod.mount && view.mod.mount(c, root);
}

// Gedelegeerde gebeurtenissen: data-act (klik), data-change, data-input
async function dispatch(type, e) {
  const el = e.target.closest(`[data-${type}]`);
  if (!el || !root.contains(el) && type !== 'act') return;
  const name = el.dataset[type];
  const c = ctx();
  if (type === 'act') {
    if (name === 'menu') { state.menu = !state.menu; render(); return; }
    if (name === 'menu-close') { state.menu = false; render(); return; }
    if (name === 'go') { e.preventDefault(); go(el.dataset.to); return; }
  }
  const fn = currentView?.mod?.actions?.[name];
  if (fn) { if (type === 'act') e.preventDefault(); await fn(c, el, e); }
}
document.addEventListener('click', e => dispatch('act', e));
document.addEventListener('change', e => dispatch('change', e));
document.addEventListener('input', e => dispatch('input', e));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.menu) { state.menu = false; render(); } });

window.addEventListener('hashchange', onRoute);

// ---- Veilig bijwerken: een nieuwe versie wordt pas gebruikt als iemand op "Nu bijwerken" tikt ----
let waitingWorker = null;
function setupUpdates() {
  navigator.serviceWorker.register('sw.js').then(reg => {
    const watch = w => w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w); });
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => watch(reg.installing));
    // Af en toe kijken of er een nieuwe versie klaarstaat (alleen downloaden, niet activeren).
    const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    setInterval(check, 30 * 60e3);
    window.addEventListener('online', check);
  }).catch(err => console.warn('Service worker niet geregistreerd', err));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Alleen herladen als de gebruiker zelf voor bijwerken koos.
    if (!window.__kcpUpdateRequested || reloading) return;
    reloading = true;
    location.reload();
  });
}

function showUpdate(worker) {
  waitingWorker = worker;
  let el = document.getElementById('update-bar');
  if (!el) { el = document.createElement('div'); el.id = 'update-bar'; document.body.appendChild(el); }
  el.className = 'update-bar';
  el.innerHTML = `<div><strong>Nieuwe versie van de app beschikbaar.</strong> Bijwerken kan veilig tussen twee partijen door: alle gegevens blijven bewaard. Tijdens een toernooi kun je ook gewoon doorwerken en later bijwerken.</div>
    <div class="row"><button class="btn s" data-upd="later">Later</button><button class="btn s dark" data-upd="nu">Nu bijwerken</button></div>`;
  el.onclick = async e => {
    const b = e.target.closest('[data-upd]'); if (!b) return;
    if (b.dataset.upd === 'later') { el.remove(); return; }
    await flush();
    window.__kcpUpdateRequested = true;
    b.textContent = 'Bezig…';
    waitingWorker.postMessage('NU_BIJWERKEN');
  };
}

async function init() {
  try {
    state.device = await store.deviceInfo();
    state.operator = await store.getMeta('operator', '');
    store.requestPersistence();
  } catch (err) {
    root.innerHTML = `<main class="page"><div class="note error"><div class="txt"><div>Lokale opslag is niet beschikbaar in deze browser.</div><div class="fix">Gebruik Safari, Chrome of Edge en geen privévenster. (${esc(err.message)})</div></div></div></main>`;
    return;
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') setupUpdates();
  if (!location.hash) {
    const last = await store.getMeta('lastEventId');
    if (last && await store.getEvent(last)) { location.hash = `/e/${last}/overzicht`; return; }
  }
  onRoute();
}
init();

export { state };
