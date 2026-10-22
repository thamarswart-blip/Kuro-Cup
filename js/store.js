// Lokale opslag in IndexedDB (blijft bewaard na sluiten/verversen).
// - "events": het actuele evenement-document per id
// - "versions": automatische momentopnames (versiebeheer, terugzetten)
// - "meta": apparaat-id, apparaatnaam, laatste export per evenement
import { uid, nowIso, deepClone } from './util.js';
import { migrate } from './model.js';

const DB_NAME = 'kuro-cup-planner';
const DB_VERSION = 1;
const MAX_VERSIONS = 40;           // per evenement
const SNAPSHOT_EVERY_MS = 5 * 60e3; // hooguit één automatische momentopname per 5 min

let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('events')) d.createObjectStore('events', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('versions')) {
        const v = d.createObjectStore('versions', { keyPath: 'vid' });
        v.createIndex('eventId', 'eventId');
      }
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(r => { out = r; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function getMeta(key, fallback = null) {
  const r = await tx('meta', 'readonly', s => reqP(s.get(key)));
  return r ? r.value : fallback;
}
export async function setMeta(key, value) {
  return tx('meta', 'readwrite', s => reqP(s.put({ key, value })));
}

export async function deviceInfo() {
  let id = await getMeta('deviceId');
  if (!id) { id = uid('d'); await setMeta('deviceId', id); }
  const name = await getMeta('deviceName', '');
  return { id, name };
}

export async function listEvents() {
  const all = await tx('events', 'readonly', s => reqP(s.getAll()));
  return all.map(migrate).sort((a, b) => (b.info.date || '').localeCompare(a.info.date || '') || b.updatedAt.localeCompare(a.updatedAt));
}

export async function getEvent(id) {
  const ev = await tx('events', 'readonly', s => reqP(s.get(id)));
  return ev ? migrate(ev) : null;
}

const lastSnapshot = {};
export async function saveEvent(ev, { reason = 'wijziging', forceSnapshot = false } = {}) {
  // rev wordt door de aanroeper verhoogd (synchroon), zodat de exportstatus direct klopt
  ev.updatedAt = nowIso();
  const copy = deepClone(ev);
  await tx('events', 'readwrite', s => reqP(s.put(copy)));
  const t = Date.now();
  if (forceSnapshot || !lastSnapshot[ev.id] || t - lastSnapshot[ev.id] > SNAPSHOT_EVERY_MS) {
    lastSnapshot[ev.id] = t;
    await snapshot(ev, reason);
  }
  return ev;
}

export async function snapshot(ev, reason) {
  const v = { vid: uid('v'), eventId: ev.id, at: nowIso(), rev: ev.rev, reason, data: deepClone(ev) };
  await tx('versions', 'readwrite', s => reqP(s.put(v)));
  const list = await listVersions(ev.id);
  if (list.length > MAX_VERSIONS) {
    const old = list.slice(MAX_VERSIONS);
    await tx('versions', 'readwrite', s => Promise.all(old.map(o => reqP(s.delete(o.vid)))));
  }
}

export async function listVersions(eventId) {
  const all = await tx('versions', 'readonly', s => reqP(s.index('eventId').getAll(eventId)));
  return all.sort((a, b) => b.at.localeCompare(a.at));
}

export async function deleteEvent(id) {
  await tx('events', 'readwrite', s => reqP(s.delete(id)));
  const vs = await listVersions(id);
  await tx('versions', 'readwrite', s => Promise.all(vs.map(v => reqP(s.delete(v.vid)))));
}

// Laatste export per evenement: bepaalt de melding "nog niet geëxporteerd"
export async function markExported(ev) {
  const map = await getMeta('exports', {});
  map[ev.id] = { at: nowIso(), rev: ev.rev };
  await setMeta('exports', map);
}
export async function exportState(ev) {
  const map = await getMeta('exports', {});
  return map[ev.id] || null;
}

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      return already || await navigator.storage.persist();
    }
  } catch (e) { /* niet ondersteund */ }
  return false;
}
