// Indeling in categorieën en poules + round-robin wedstrijdschema's.
import { uid, ageOn, ageExact, byId } from './util.js';
import { levelIndex, LEVELS, displayName, DISCIPLINES } from './model.js';

const SEX_LABEL = { M: 'Jongens', V: 'Meisjes', X: 'Gemengd' };

// Indelingsscore: leeftijd weegt het zwaarst, niveau en ervaring schuiven iets op.
function score(p, date) {
  const age = ageExact(p.birthDate, date) ?? 8;
  const lvl = levelIndex(p.kyu);
  const exp = Math.min(p.experience ?? 0, 4);
  return age + lvl * 0.9 + exp * 0.25 + (p.weight ? (p.weight - 30) / 100 : 0);
}

function sizesFor(n, target, max) {
  if (n <= max) return [n];
  let k = Math.max(Math.ceil(n / max), Math.round(n / target));
  const base = Math.floor(n / k), extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

// Maakt een nieuw voorstel voor één onderdeel. Bestaande poules met uitslagen blijven staan.
export function proposePools(ev, discipline, entrantFilter = p => p[discipline]) {
  const date = ev.info.date;
  const { poolTarget, poolMax } = ev.settings;
  const entrants = ev.participants.filter(p => entrantFilter(p) && !p.withdrawn && p.birthDate && p.sex);
  const pools = [];
  for (const sex of ['M', 'V']) {
    const list = entrants.filter(p => p.sex === sex).sort((a, b) => score(a, date) - score(b, date));
    if (!list.length) continue;
    const sizes = sizesFor(list.length, poolTarget, poolMax);
    let i = 0;
    for (const s of sizes) {
      const members = list.slice(i, i + s); i += s;
      pools.push({ id: uid('pl'), discipline, sex, name: '', participantIds: members.map(p => p.id), auto: true, confirmedWarnings: [] });
    }
  }
  return pools;
}

export function poolProfile(ev, pool) {
  const pById = byId(ev.participants);
  const ps = pool.participantIds.map(id => pById[id]).filter(Boolean);
  const ages = ps.map(p => ageOn(p.birthDate, ev.info.date)).filter(a => a != null);
  const lvls = ps.map(p => levelIndex(p.kyu));
  const weights = ps.map(p => p.weight).filter(Boolean);
  const sexes = new Set(ps.map(p => p.sex));
  return {
    n: ps.length,
    minAge: ages.length ? Math.min(...ages) : null, maxAge: ages.length ? Math.max(...ages) : null,
    minLvl: lvls.length ? Math.min(...lvls) : 0, maxLvl: lvls.length ? Math.max(...lvls) : 0,
    minW: weights.length ? Math.min(...weights) : null, maxW: weights.length ? Math.max(...weights) : null,
    sexes, ps,
  };
}

export function categoryLabel(ev, pool) {
  const pr = poolProfile(ev, pool);
  const sex = pr.sexes.size > 1 ? 'Gemengd' : SEX_LABEL[[...pr.sexes][0]] || SEX_LABEL[pool.sex] || '';
  const age = pr.minAge == null ? '' : pr.minAge === pr.maxAge ? `${pr.minAge} jaar` : `${pr.minAge}–${pr.maxAge} jaar`;
  return [sex, age].filter(Boolean).join(' ');
}

function kyuRange(ps) {
  const ks = ps.map(p => p.kyu);
  const known = ks.filter(k => k != null);
  const hasUnknown = known.length < ks.length;
  if (!known.length) return 'beginners';
  const fmt = k => k === 0 ? 'dan' : `${k}e`;
  const hi = Math.max(...known), lo = Math.min(...known); // hoog getal = lagere graad
  let txt = hi === lo ? `${fmt(hi)} kyu` : `${fmt(hi)}–${fmt(lo)} kyu`;
  if (lo === 0 && hi === 0) txt = 'dan';
  return hasUnknown ? `${txt} + beginners` : txt;
}

// Automatische naam: onderdeel · jongens/meisjes · leeftijd · kyu-graad, bijv. "Kata · Jongens 7–8 jaar · 10e–8e kyu".
export function autoPoolName(ev, pool) {
  const pr = poolProfile(ev, pool);
  if (!pr.n) return `${DISCIPLINES[pool.discipline]} · lege poule`;
  return `${DISCIPLINES[pool.discipline]} · ${categoryLabel(ev, pool)} · ${kyuRange(pr.ps)}`;
}

// Geeft alle automatisch benoemde poules hun naam; dubbele namen krijgen A, B, …
export function nameAll(ev) {
  const auto = ev.pools.filter(p => !p.customName);
  const base = new Map(auto.map(p => [p.id, autoPoolName(ev, p)]));
  const count = {};
  for (const n of base.values()) count[n] = (count[n] || 0) + 1;
  const seen = {};
  for (const p of auto) {
    const n = base.get(p.id);
    if (count[n] > 1) { seen[n] = (seen[n] || 0) + 1; p.name = `${n} · ${String.fromCharCode(64 + seen[n])}`; }
    else p.name = n;
  }
}

// Oude namen als "Kata A" automatisch laten hernoemen.
export function upgradeNames(ev) {
  let changed = false;
  for (const p of ev.pools) if (p.customName == null) { if (!/^(Kata|Kumite) [A-Z]( \(\d\))?$/.test(p.name)) p.customName = true; else changed = true; }
  if (changed) nameAll(ev);
  return changed;
}

export function twinOf(ev, pool) {
  return pool.groupId ? ev.pools.find(p => p.groupId === pool.groupId && p.id !== pool.id) || null : null;
}

// Uitleg en waarschuwingen per poule, in gewone taal.
export function explainPool(ev, pool) {
  const pr = poolProfile(ev, pool);
  const reasons = [], warnings = [];
  if (pr.n) {
    reasons.push(pr.minAge === pr.maxAge ? `Allemaal ${pr.minAge} jaar op de wedstrijddag` : `Leeftijd ${pr.minAge}–${pr.maxAge} jaar op de wedstrijddag`);
    reasons.push(pr.minLvl === pr.maxLvl ? `Niveau: ${LEVELS[pr.minLvl].label.toLowerCase()}` : `Niveau: ${LEVELS[pr.minLvl].label.toLowerCase()} t/m ${LEVELS[pr.maxLvl].label.toLowerCase()}`);
    if (pr.minW != null) reasons.push(`Gewicht ${pr.minW}–${pr.maxW} kg (meegewogen)`);
  }
  const { poolMax, poolMin } = ev.settings;
  if (pr.n > poolMax) warnings.push({ key: 'te-groot', text: `${pr.n} deelnemers is meer dan het maximum van ${poolMax}. Splits deze poule.`, action: 'split' });
  if (pr.n > 0 && pr.n < poolMin) warnings.push({ key: 'te-klein', text: `Maar ${pr.n} deelnemer${pr.n === 1 ? '' : 's'}. Voeg samen met een poule met vergelijkbare leeftijd, of verplaats deelnemers.`, action: 'merge' });
  if (pr.n === 0) warnings.push({ key: 'leeg', text: 'Deze poule is leeg. Verwijder hem of verplaats deelnemers hierheen.', action: 'delete' });
  if (pr.sexes.size > 1) warnings.push({ key: 'gemengd', text: 'Jongens en meisjes zitten samen in deze poule.', confirmable: true });
  if (pr.maxAge - pr.minAge >= 3) warnings.push({ key: 'leeftijd', text: `Groot leeftijdsverschil (${pr.maxAge - pr.minAge} jaar).`, confirmable: true });
  if (pr.maxLvl - pr.minLvl >= 2) warnings.push({ key: 'niveau', text: `Sterk verschillend niveau (${LEVELS[pr.minLvl].label.toLowerCase()} tot ${LEVELS[pr.maxLvl].label.toLowerCase()}).`, confirmable: true });
  if (pr.minW != null && pr.maxW - pr.minW > 15) warnings.push({ key: 'gewicht', text: `Gewichtsverschil van ${Math.round(pr.maxW - pr.minW)} kg.`, confirmable: true });
  if (pool.discipline === 'kumite') {
    const young = pr.ps.filter(p => ageOn(p.birthDate, ev.info.date) <= ev.settings.kumiteYoungMaxAge).length;
    if (young && young < pr.n) warnings.push({ key: 'kumitetijd', text: `Gemengde kumitetijd: ${young} deelnemer(s) t/m ${ev.settings.kumiteYoungMaxAge} jaar draaien ${ev.settings.kumiteYoungSec} s, de rest ${ev.settings.kumiteOldSec} s.`, info: true });
  }
  if (pr.n >= 2 && legsFor(ev, pool) === 2) warnings.push({ key: 'dubbel', text: `Kleine poule: iedereen speelt twee keer tegen elkaar (${pr.n * (pr.n - 1)} partijen), de tweede keer met omgedraaide kleuren.`, info: true });
  const confirmed = new Set(pool.confirmedWarnings || []);
  for (const w of warnings) w.confirmed = confirmed.has(w.key);
  // Per deelnemer: past minder goed?
  const misfits = [];
  const ages = pr.ps.map(p => ageOn(p.birthDate, ev.info.date));
  const median = ages.slice().sort((a, b) => a - b)[Math.floor(ages.length / 2)];
  for (const p of pr.ps) {
    const a = ageOn(p.birthDate, ev.info.date);
    if (Math.abs(a - median) >= 2) misfits.push({ id: p.id, text: `${displayName(p)} (${a} jr) wijkt af in leeftijd` });
    if (pr.sexes.size > 1 && p.sex !== pool.sex) misfits.push({ id: p.id, text: `${displayName(p)} is ${p.sex === 'M' ? 'jongen' : 'meisje'} in een ${SEX_LABEL[pool.sex]?.toLowerCase()}-poule` });
  }
  return { reasons, warnings, misfits, profile: pr };
}

// Round robin (cirkelmethode), met evenwichtige verdeling rood/blauw.
// legs = 2: iedereen speelt twee keer tegen elkaar (standaard bij poules van 3), de tweede keer met gewisselde kleuren.
export function roundRobin(ids, legs = 1) {
  const list = ids.slice();
  if (list.length < 2) return [];
  if (list.length % 2) list.push(null);
  const n = list.length, rounds = n - 1, half = n / 2;
  const pairs = [];
  const arr = list.slice();
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a && b) pairs.push({ round: r + 1, a, b });
    }
    arr.splice(1, 0, arr.pop());
  }
  // Kleurverdeling: wie minder vaak rood was, wordt rood.
  const red = {}, total = {};
  const first = [];
  for (const p of pairs) {
    const ra = red[p.a] || 0, rb = red[p.b] || 0;
    let redId, blueId;
    if (ra < rb || (ra === rb && ((total[p.a] || 0) + p.round) % 2 === 0)) { redId = p.a; blueId = p.b; }
    else { redId = p.b; blueId = p.a; }
    red[redId] = (red[redId] || 0) + 1;
    total[p.a] = (total[p.a] || 0) + 1; total[p.b] = (total[p.b] || 0) + 1;
    first.push({ round: p.round, redId, blueId, leg: 1 });
  }
  const out = orderForRest(first);
  if (legs < 2) return out;
  // Tweede ronde: zelfde paren, kleuren omgedraaid, niet beginnen met het laatste paar van ronde 1.
  const second = orderForRest(first.map(m => ({ round: m.round + rounds, redId: m.blueId, blueId: m.redId, leg: 2 })), out[out.length - 1]);
  return out.concat(second);
}

// Wedstrijden bijwerken als het aantal rondes (1× of 2× tegen elkaar) niet meer klopt. Gespeelde partijen blijven staan.
export function syncLegs(ev) {
  let changed = false;
  for (const p of ev.pools) {
    const n = p.participantIds.length;
    const want = n * (n - 1) / 2 * legsFor(ev, p);
    const have = ev.matches.filter(m => m.poolId === p.id && m.kind === 'pool' && !m.orphan).length;
    if (want !== have) { generateMatches(ev, p); changed = true; }
  }
  if (changed) ev.planStale = true;
  return changed;
}

export const legsFor = (ev, pool) => pool.participantIds.length <= (ev.settings.doubleRoundUpTo ?? 3) ? 2 : 1;

// Volgorde zodat niemand twee partijen direct achter elkaar heeft (waar mogelijk).
function orderForRest(list, prev = null) {
  const rest = list.slice(), out = [];
  while (rest.length) {
    const last = out[out.length - 1] || prev;
    let idx = rest.findIndex(m => !last || (m.redId !== last.redId && m.redId !== last.blueId && m.blueId !== last.redId && m.blueId !== last.blueId));
    if (idx < 0) idx = 0;
    out.push(rest.splice(idx, 1)[0]);
  }
  return out;
}

export function matchKey(poolId, a, b, kind = 'pool', leg = 1) {
  return [poolId, kind, ...[a, b].sort()].join(':') + (leg > 1 ? ':' + leg : '');
}

// Wedstrijden van een poule (opnieuw) maken. Gespeelde partijen blijven behouden.
export function generateMatches(ev, pool) {
  const keep = ev.matches.filter(m => m.poolId === pool.id);
  const resultIds = new Set(ev.results.map(r => r.matchId));
  const played = keep.filter(m => resultIds.has(m.id));
  const playedKeys = new Set(played.map(m => matchKey(pool.id, m.redId, m.blueId, m.kind, m.leg)));
  const rr = roundRobin(pool.participantIds, legsFor(ev, pool));
  // Bestaande ongespeelde partijen met hetzelfde paar (en dezelfde ronde) houden hun id en eventuele handmatige planning.
  const existingByKey = new Map(keep.filter(m => m.kind === 'pool' && !resultIds.has(m.id)).map(m => [matchKey(pool.id, m.redId, m.blueId, 'pool', m.leg), m]));
  const fresh = rr
    .filter(x => !playedKeys.has(matchKey(pool.id, x.redId, x.blueId, 'pool', x.leg)))
    .map(x => {
      const key = matchKey(pool.id, x.redId, x.blueId, 'pool', x.leg);
      const old = existingByKey.get(key);
      return { ...(old || {}), id: old ? old.id : uid('m'), key, poolId: pool.id, discipline: pool.discipline, kind: 'pool', round: x.round, leg: x.leg, redId: old ? old.redId : x.redId, blueId: old ? old.blueId : x.blueId, _new: !old };
    });
  // Tweede ronde: altijd de omgekeerde kleuren van de eerste ontmoeting.
  const firstLeg = new Map([...played, ...fresh].filter(m => (m.leg || 1) === 1).map(m => [[m.redId, m.blueId].sort().join(), m]));
  for (const m of fresh) {
    if (m.leg === 2 && m._new) { const f = firstLeg.get([m.redId, m.blueId].sort().join()); if (f) { m.redId = f.blueId; m.blueId = f.redId; } }
    delete m._new;
  }
  const memberSet = new Set(pool.participantIds);
  // Gespeelde partijen van deelnemers die niet meer in de poule zitten blijven bewaard maar tellen niet mee.
  const keptPlayed = played.map(m => ({ ...m, orphan: !(memberSet.has(m.redId) && memberSet.has(m.blueId)) || undefined }));
  const tiebreaks = keep.filter(m => m.kind === 'beslis' && !resultIds.has(m.id));
  ev.matches = ev.matches.filter(m => m.poolId !== pool.id).concat(keptPlayed, fresh, tiebreaks);
  numberMatches(ev, pool.id);
}

export function numberMatches(ev, poolId) {
  const list = ev.matches.filter(m => m.poolId === poolId);
  let n = 1;
  for (const m of list) m.num = n++;
}

export function poolMatches(ev, poolId) {
  return ev.matches.filter(m => m.poolId === poolId && !m.orphan).sort((a, b) => (a.num || 0) - (b.num || 0));
}

export function poolHasResults(ev, poolId) {
  const ids = new Set(ev.matches.filter(m => m.poolId === poolId).map(m => m.id));
  return ev.results.some(r => ids.has(r.matchId));
}

// Handmatige bewerkingen ------------------------------------------------------
// Bij gekoppelde poules (kata en kumite gelijk ingedeeld) gaat elke wijziging ook naar de tweelingpoule.
const linked = ev => ev.settings.linkedPools !== false;

function moveOne(ev, pid, from, to) {
  if (!from || !to) return;
  from.participantIds = from.participantIds.filter(x => x !== pid);
  const p = ev.participants.find(x => x.id === pid);
  if (p && p[to.discipline] && !to.participantIds.includes(pid)) to.participantIds.push(pid);
  from.auto = to.auto = false;
  generateMatches(ev, from); generateMatches(ev, to);
}

export function moveParticipant(ev, pid, fromPoolId, toPoolId) {
  const from = ev.pools.find(p => p.id === fromPoolId), to = ev.pools.find(p => p.id === toPoolId);
  if (!from || !to) return;
  moveOne(ev, pid, from, to);
  const tt = linked(ev) && twinOf(ev, to);
  if (tt) {
    const cur = ev.pools.find(p => p.discipline === tt.discipline && p.participantIds.includes(pid));
    if (cur && cur !== tt) moveOne(ev, pid, cur, tt);
    else if (!cur && ev.participants.find(x => x.id === pid)?.[tt.discipline]) { tt.participantIds.push(pid); tt.auto = false; generateMatches(ev, tt); }
  }
  nameAll(ev);
}

export function placeParticipant(ev, pid, toPoolId) {
  const to = ev.pools.find(p => p.id === toPoolId);
  if (!to) return;
  if (!to.participantIds.includes(pid)) to.participantIds.push(pid);
  to.auto = false; generateMatches(ev, to);
  const tt = linked(ev) && twinOf(ev, to);
  const p = ev.participants.find(x => x.id === pid);
  if (tt && p?.[tt.discipline] && !ev.pools.some(x => x.discipline === tt.discipline && x.participantIds.includes(pid))) { tt.participantIds.push(pid); tt.auto = false; generateMatches(ev, tt); }
  nameAll(ev);
}

export function splitPool(ev, poolId) {
  const pool = ev.pools.find(p => p.id === poolId);
  const pById = byId(ev.participants);
  const sorted = pool.participantIds.slice().sort((a, b) => score(pById[a], ev.info.date) - score(pById[b], ev.info.date));
  const half = Math.ceil(sorted.length / 2);
  const secondIds = new Set(sorted.slice(half));
  const groupId = pool.groupId ? uid('g') : undefined;
  const make = (src, ids) => {
    const np = { id: uid('pl'), discipline: src.discipline, sex: src.sex, name: '', participantIds: ids, auto: false, confirmedWarnings: [], groupId };
    src.participantIds = src.participantIds.filter(id => !ids.includes(id));
    src.auto = false;
    ev.pools.splice(ev.pools.indexOf(src) + 1, 0, np);
    generateMatches(ev, src); generateMatches(ev, np);
    return np;
  };
  const tw = linked(ev) && twinOf(ev, pool);
  const np = make(pool, sorted.slice(half));
  if (tw) make(tw, tw.participantIds.filter(id => secondIds.has(id)));
  nameAll(ev);
  return np;
}

function mergeOne(ev, keep, other) {
  keep.participantIds = [...new Set([...keep.participantIds, ...other.participantIds])];
  keep.auto = false;
  ev.matches.filter(m => m.poolId === other.id).forEach(m => { m.poolId = keep.id; });
  ev.pools = ev.pools.filter(p => p.id !== other.id);
  generateMatches(ev, keep);
}

export function mergePools(ev, keepId, otherId) {
  const keep = ev.pools.find(p => p.id === keepId), other = ev.pools.find(p => p.id === otherId);
  const tk = linked(ev) && twinOf(ev, keep), to = linked(ev) && twinOf(ev, other);
  mergeOne(ev, keep, other);
  if (tk && to) mergeOne(ev, tk, to);
  nameAll(ev);
}

export function deletePool(ev, poolId) {
  const pool = ev.pools.find(p => p.id === poolId);
  const tw = pool && linked(ev) && twinOf(ev, pool);
  const ids = [poolId, ...(tw && !tw.participantIds.length ? [tw.id] : [])];
  ev.pools = ev.pools.filter(p => !ids.includes(p.id));
  ev.matches = ev.matches.filter(m => !ids.includes(m.poolId));
  if (tw && !ids.includes(tw.id)) tw.groupId = undefined;
  nameAll(ev);
}

// Vervangt poules zonder uitslagen door een nieuw voorstel.
// Gekoppeld (standaard): één indeling, toegepast op kata én kumite, met aparte prijzen per onderdeel.
export function regenerate(ev, discipline) {
  const disciplines = linked(ev) ? ['kata', 'kumite'] : [discipline];
  // Poules met uitslagen (en hun tweeling) blijven staan.
  const lockedGroups = new Set();
  const locked = new Set();
  for (const p of ev.pools) if (disciplines.includes(p.discipline) && poolHasResults(ev, p.id)) { locked.add(p.id); if (p.groupId) lockedGroups.add(p.groupId); }
  for (const p of ev.pools) if (p.groupId && lockedGroups.has(p.groupId)) locked.add(p.id);
  const removed = ev.pools.filter(p => disciplines.includes(p.discipline) && !locked.has(p.id)).map(p => p.id);
  ev.pools = ev.pools.filter(p => !removed.includes(p.id));
  ev.matches = ev.matches.filter(m => !removed.includes(m.poolId));
  const inLocked = d => new Set(ev.pools.filter(p => p.discipline === d && locked.has(p.id)).flatMap(p => p.participantIds));
  let created = 0;
  if (linked(ev)) {
    const lk = inLocked('kata'), lu = inLocked('kumite');
    const groups = proposePools(ev, 'kata', p => (p.kata && !lk.has(p.id)) || (p.kumite && !lu.has(p.id)));
    for (const g of groups) {
      const groupId = uid('g');
      for (const d of disciplines) {
        const ids = g.participantIds.filter(id => { const p = ev.participants.find(x => x.id === id); return p[d] && !(d === 'kata' ? lk : lu).has(id); });
        if (!ids.length) continue;
        const pool = { ...g, id: uid('pl'), discipline: d, participantIds: ids, groupId };
        ev.pools.push(pool); generateMatches(ev, pool); created++;
      }
    }
  } else {
    const lk = inLocked(discipline);
    const fresh = proposePools(ev, discipline, p => p[discipline] && !lk.has(p.id));
    ev.pools.push(...fresh); fresh.forEach(p => generateMatches(ev, p)); created = fresh.length;
  }
  nameAll(ev);
  return { created, keptWithResults: locked.size };
}

// Deelnemers die bij een onderdeel staan ingeschreven maar in geen poule zitten.
export function unassigned(ev, discipline) {
  const inPool = new Set(ev.pools.filter(p => p.discipline === discipline).flatMap(p => p.participantIds));
  return ev.participants.filter(p => p[discipline] && !p.withdrawn && !inPool.has(p.id));
}
