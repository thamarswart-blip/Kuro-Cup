// JSON-export en veilig samenvoegen van gegevens van meerdere tablets.
// Nooit stilzwijgend overschrijven: elk verschil wordt getoond en de gebruiker kiest.
import { stableStringify, nowIso, deepClone, slug } from './util.js';
import { APP_ID, SCHEMA_VERSION, migrate, displayName } from './model.js';

export const EXPORT_FORMAT = 'kuro-cup-planner/evenement';

export function buildExport(ev, device) {
  return {
    format: EXPORT_FORMAT,
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    device: { id: device.id, name: device.name || '' },
    eventRev: ev.rev,
    event: ev,
  };
}

export function exportFileName(ev, device) {
  const d = new Date();
  const stamp = d.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
  return `${slug(ev.info.name) || 'evenement'}_${slug(device.name) || 'apparaat'}_${stamp}.json`;
}

export function readExport(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Dit bestand is geen geldig JSON-bestand.'); }
  if (!data || data.format !== EXPORT_FORMAT || !data.event) throw new Error('Dit bestand komt niet uit de Kuro Cup Planner.');
  if ((data.schemaVersion || 1) > SCHEMA_VERSION) throw new Error(`Dit bestand is gemaakt met een nieuwere versie (schema ${data.schemaVersion}). Werk de app eerst bij.`);
  data.event = migrate(data.event);
  return data;
}

const COLLECTIONS = [
  ['fields', 'Velden', x => x.name],
  ['program', 'Programmaonderdelen', x => x.title],
  ['participants', 'Deelnemers', x => displayName(x)],
  ['pools', 'Poules', x => x.name],
  ['matches', 'Wedstrijden', null],
  ['results', 'Uitslagen', null],
  ['decisions', 'Beslissingen', null],
  ['volunteers', 'Vrijwilligers', x => x.name],
  ['assignments', 'Roostertoewijzingen', null],
  ['supplies', 'Benodigdheden', x => x.name],
  ['catering', 'Verzorging vrijwilligers', x => x.name],
];

// Velden die per apparaat kunnen verschillen zonder dat het een echt conflict is.
const strip = (coll, x) => {
  if (coll === 'results') { const { history, deviceId, rev, ...rest } = x; return rest; }
  return x;
};
const same = (coll, a, b) => stableStringify(strip(coll, a)) === stableStringify(strip(coll, b));
const resKey = r => `${r.winnerId}|${r.flagsRed}|${r.flagsBlue}|${r.referees}`;

export function analyze(local, incoming) {
  const items = [];
  const summary = {};
  const matchRemap = {};
  const localMatchByKey = new Map(local.matches.map(m => [m.key, m]));
  for (const [coll, label, nameFn] of COLLECTIONS) {
    const L = new Map((local[coll] || []).map(x => [x.id, x]));
    const s = summary[coll] = { label, nieuw: 0, dubbel: 0, conflict: 0, bijgewerkt: 0, ouder: 0 };
    for (const inc of incoming[coll] || []) {
      let loc = L.get(inc.id);
      if (coll === 'matches' && !loc && inc.key && localMatchByKey.has(inc.key)) {
        // Zelfde partij met een ander id: dubbel, uitslagen worden omgezet.
        loc = localMatchByKey.get(inc.key);
        matchRemap[inc.id] = loc.id;
        s.dubbel++; continue;
      }
      if (coll === 'results') {
        const mid = matchRemap[inc.matchId] || inc.matchId;
        loc = loc || (local.results || []).find(r => r.matchId === mid && !r.voided);
      }
      const name = nameFn ? nameFn(inc) : describe(coll, inc, local, incoming);
      if (!loc) { s.nieuw++; items.push({ coll, type: 'nieuw', id: inc.id, name, incoming: inc, choice: 'incoming' }); continue; }
      if (same(coll, loc, inc)) { s.dubbel++; continue; }
      if (coll === 'results') {
        if (resKey(loc) === resKey(inc)) {
          // Zelfde uitslag, andere metadata: historie samenvoegen zonder iets te wijzigen.
          s.dubbel++; items.push({ coll, type: 'historie', id: loc.id, name, local: loc, incoming: inc, choice: 'local', silent: true }); continue;
        }
        const incInLocalHist = (loc.history || []).some(h => resKey(h.prev) === resKey(inc));
        const locInIncHist = (inc.history || []).some(h => resKey(h.prev) === resKey(loc));
        if (incInLocalHist) { s.ouder++; items.push({ coll, type: 'ouder', id: loc.id, name, local: loc, incoming: inc, choice: 'local' }); continue; }
        if (locInIncHist) { s.bijgewerkt++; items.push({ coll, type: 'bijgewerkt', id: loc.id, name, local: loc, incoming: inc, choice: 'incoming' }); continue; }
      }
      s.conflict++;
      items.push({ coll, type: 'conflict', id: loc.id, name, local: loc, incoming: inc, choice: null });
    }
  }
  // Evenementgegevens en instellingen
  const OBJ_LABEL = { info: 'Evenementgegevens', settings: 'Instellingen', costs: 'Kosten' };
  for (const key of ['info', 'settings', 'costs']) {
    if (incoming[key] && stableStringify(local[key]) !== stableStringify(incoming[key])) {
      items.push({ coll: key, type: 'conflict', id: key, name: OBJ_LABEL[key], local: local[key], incoming: incoming[key], choice: null });
      summary[key] = { label: OBJ_LABEL[key], conflict: 1, nieuw: 0, dubbel: 0, bijgewerkt: 0, ouder: 0 };
    }
  }
  return { items, summary, matchRemap };
}

function describe(coll, x, local, incoming) {
  const P = new Map([...local.participants, ...incoming.participants].map(p => [p.id, p]));
  const M = new Map([...local.matches, ...incoming.matches].map(m => [m.id, m]));
  const pools = new Map([...local.pools, ...incoming.pools].map(p => [p.id, p]));
  if (coll === 'matches') return `${pools.get(x.poolId)?.name || 'Poule'} · ${displayName(P.get(x.redId))} – ${displayName(P.get(x.blueId))}`;
  if (coll === 'results') { const m = M.get(x.matchId); return m ? `${pools.get(m.poolId)?.name || ''} partij ${m.num ?? ''}: ${displayName(P.get(m.redId))} (rood) – ${displayName(P.get(m.blueId))} (blauw)` : 'Uitslag'; }
  if (coll === 'decisions') return `Beslissing ${pools.get(x.poolId)?.name || ''}`;
  if (coll === 'assignments') return 'Roostertoewijzing';
  return x.id;
}

export function unresolved(analysis) {
  return analysis.items.filter(i => i.type === 'conflict' && !i.choice).length;
}

// Past de gemaakte keuzes toe en geeft een nieuw samengevoegd evenement terug.
export function applyMerge(local, incoming, analysis, by) {
  const ev = deepClone(local);
  const remap = analysis.matchRemap;
  for (const it of analysis.items) {
    if (it.coll === 'info' || it.coll === 'settings' || it.coll === 'costs') { if (it.choice === 'incoming') ev[it.coll] = deepClone(it.incoming); continue; }
    const list = ev[it.coll];
    if (it.type === 'nieuw') {
      const x = deepClone(it.incoming);
      if (it.coll === 'results' && remap[x.matchId]) { x.matchId = remap[x.matchId]; x.id = 'r-' + x.matchId; }
      list.push(x);
      continue;
    }
    if (it.coll === 'results' && it.choice === 'incoming') {
      const r = list.find(x => x.id === it.id);
      const inc = deepClone(it.incoming);
      const hist = [...(r.history || []), { at: nowIso(), by: by || 'samenvoegen', reason: it.type === 'bijgewerkt' ? 'nieuwere versie uit import' : 'conflict opgelost bij samenvoegen', prev: { winnerId: r.winnerId, flagsRed: r.flagsRed, flagsBlue: r.flagsBlue, referees: r.referees, by: r.by, at: r.updatedAt } }];
      Object.assign(r, inc, { id: r.id, matchId: r.matchId, history: mergeHistory(hist, inc.history) });
      continue;
    }
    if (it.coll === 'results') {
      // Lokaal behouden, maar historie van de import bewaren zodat niets verloren gaat.
      const r = list.find(x => x.id === it.id);
      const extra = it.type === 'historie' ? (it.incoming.history || []) : [...(it.incoming.history || []), { at: nowIso(), by: by || 'samenvoegen', reason: 'andere versie uit import niet overgenomen', prev: { winnerId: it.incoming.winnerId, flagsRed: it.incoming.flagsRed, flagsBlue: it.incoming.flagsBlue, referees: it.incoming.referees, by: it.incoming.by, at: it.incoming.updatedAt } }];
      r.history = mergeHistory(r.history || [], extra);
      continue;
    }
    if (it.choice === 'incoming') {
      const i = list.findIndex(x => x.id === it.id);
      if (i >= 0) list[i] = deepClone(it.incoming);
    }
  }
  ev.log = [...(ev.log || []), { at: nowIso(), by, text: `Samengevoegd met export van ${incoming.__device || 'ander apparaat'}` }];
  return ev;
}

function mergeHistory(a, b) {
  const seen = new Set();
  return [...(a || []), ...(b || [])].filter(h => { const k = stableStringify(h); if (seen.has(k)) return false; seen.add(k); return true; }).sort((x, y) => (x.at || '').localeCompare(y.at || ''));
}

export function describeResult(r, ev) {
  if (!r) return '–';
  const P = new Map(ev.participants.map(p => [p.id, p]));
  return `${displayName(P.get(r.winnerId))} wint · vlaggen ${r.flagsRed}–${r.flagsBlue} (rood–blauw) · ${r.by || 'onbekend'}`;
}
