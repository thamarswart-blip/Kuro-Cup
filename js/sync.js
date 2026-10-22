// Synchroniseren via een kleine cloudopslag (Supabase, EU). De tablet blijft altijd leidend:
// - "Versturen" kopieert de uitslagen van dit apparaat naar de cloud. Er wordt niets lokaal gewijzigd.
// - "Ophalen" haalt de uitslagen van de andere apparaten op en laat ze samenvoegen via het bekende
//   samenvoegscherm (nieuw / dubbel / conflict). Er wordt nooit stilzwijgend iets overschreven.
// Lukt een verbinding niet, dan gebeurt er niets met de gegevens; je kunt het later opnieuw proberen.
import { deepClone } from './util.js';
import { getMeta, setMeta } from './store.js';

const TIMEOUT_MS = 15000;

export function syncConfig(ev) {
  const s = ev.sync || {};
  return { url: (s.url || '').trim().replace(/\/+$/, ''), key: (s.key || '').trim(), code: (s.code || '').trim() };
}
export function isConfigured(ev) {
  const c = syncConfig(ev);
  return !!(c.url && c.key && c.code.length >= 8);
}

// Een goed leesbare, moeilijk te raden code, bijv. KURO-7F3K-Q9PD-M2XA
export function newEventCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(12));
  const part = i => Array.from(r.slice(i, i + 4), b => chars[b % chars.length]).join('');
  return `KURO-${part(0)}-${part(4)}-${part(8)}`;
}

// Alleen wat nodig is om uitslagen samen te voegen: geen deelnemersgegevens.
export function payloadFor(ev) {
  return {
    schemaVersion: ev.schemaVersion,
    results: ev.results,
    decisions: ev.decisions || [],
    matches: ev.matches.filter(m => m.kind === 'beslis'),
    sentAt: new Date().toISOString(),
  };
}

async function rpc(cfg, fn, body) {
  if (!navigator.onLine) throw new Error('Dit apparaat heeft geen internetverbinding. De gegevens blijven gewoon bewaard; probeer het later opnieuw.');
  const headers = { 'Content-Type': 'application/json', apikey: cfg.key };
  // Oude "anon"-sleutels zijn JWT's en gaan ook mee als Authorization; nieuwe "publishable"-sleutels niet.
  if (!cfg.key.startsWith('sb_')) headers.Authorization = `Bearer ${cfg.key}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal, cache: 'no-store' });
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'De verbinding is te traag (geen antwoord binnen 15 seconden). Er is niets verloren; probeer het opnieuw.' : 'Geen verbinding met de cloud. Controleer internet of de hotspot. Er is niets verloren.');
  } finally { clearTimeout(t); }
  if (!res.ok) {
    let msg = '';
    try { const j = await res.json(); msg = j.message || j.hint || ''; } catch { }
    if (res.status === 401 || res.status === 403) throw new Error('De cloud weigert toegang. Controleer de sleutel (publishable/anon key) bij Gegevens delen.');
    if (res.status === 404) throw new Error('De cloud is nog niet ingericht: voer eenmalig het script supabase/kuro-sync.sql uit in Supabase.');
    throw new Error(`De cloud gaf een fout (${res.status})${msg ? ': ' + msg : ''}.`);
  }
  return res.status === 204 ? null : res.json();
}

export async function push(ev, device) {
  const cfg = syncConfig(ev);
  if (!isConfigured(ev)) throw new Error('Synchroniseren is nog niet ingesteld. Vul bij Gegevens delen de cloudgegevens en de evenementcode in.');
  const payload = payloadFor(ev);
  const at = await rpc(cfg, 'kc_push', { p_code: cfg.code, p_event_id: ev.id, p_device_id: device.id, p_device_name: device.name || 'Apparaat zonder naam', p_payload: payload });
  const info = { at: typeof at === 'string' ? at : new Date().toISOString(), count: payload.results.length, rev: ev.rev };
  const all = await getMeta('syncPush', {});
  all[ev.id] = info;
  await setMeta('syncPush', all);
  return info;
}

export async function lastPush(ev) {
  const all = await getMeta('syncPush', {});
  return all[ev.id] || null;
}

export async function pull(ev, device) {
  const cfg = syncConfig(ev);
  if (!isConfigured(ev)) throw new Error('Synchroniseren is nog niet ingesteld.');
  const rows = await rpc(cfg, 'kc_pull', { p_code: cfg.code, p_event_id: ev.id });
  return (rows || []).filter(r => r.device_id !== device.id);
}

// Test of URL, sleutel en code werken (haalt alleen op, verandert niets).
export async function testConnection(ev) {
  const rows = await rpc(syncConfig(ev), 'kc_pull', { p_code: syncConfig(ev).code, p_event_id: ev.id });
  return (rows || []).length;
}

// Maakt van een opgehaalde rij een "binnenkomend evenement" voor het bestaande samenvoegscherm:
// alles gelijk aan het eigen evenement, behalve de uitslagen, beslissingen en beslispartijen van dat apparaat.
export function incomingFromRow(ev, row) {
  const inc = deepClone(ev);
  const p = row.payload || {};
  const known = new Set(ev.matches.map(m => m.id));
  inc.results = p.results || [];
  inc.decisions = p.decisions || [];
  inc.matches = [...inc.matches, ...(p.matches || []).filter(m => !known.has(m.id))];
  return {
    format: 'kuro-cup-planner/evenement',
    exportedAt: row.updated_at,
    device: { id: row.device_id, name: row.device_name || 'apparaat' },
    event: inc,
    fromCloud: true,
  };
}
