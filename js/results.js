// Uitslagen, poulestand en gelijke standen.
import { uid, nowIso, byId } from './util.js';
import { displayName } from './model.js';
import { poolMatches, numberMatches, matchKey } from './pools.js';

export const WIN_POINTS = 20, LOSS_POINTS = 10;

// Controleert een uitslag. Geeft een lijst foutmeldingen in gewone taal terug.
export function validateResult(r, refs) {
  const errs = [];
  if (r.flagsRed == null || r.flagsBlue == null) errs.push('Vul het aantal vlaggen voor rood en blauw in.');
  const total = (r.flagsRed || 0) + (r.flagsBlue || 0);
  if (total !== refs) errs.push(`Er moeten precies ${refs} vlag${refs === 1 ? '' : 'gen'} zijn; nu ${total}.`);
  if (r.flagsRed < 0 || r.flagsBlue < 0) errs.push('Een aantal vlaggen kan niet negatief zijn.');
  if (r.flagsRed === r.flagsBlue) errs.push('Gelijke vlaggen kan niet: er moet een winnaar zijn.');
  return errs;
}

export function winnerFromFlags(match, flagsRed, flagsBlue) {
  if (flagsRed === flagsBlue) return null;
  return flagsRed > flagsBlue ? match.redId : match.blueId;
}

export function resultFor(ev, matchId) {
  return ev.results.find(r => r.matchId === matchId && !r.voided) || null;
}

// Slaat een (nieuwe of gecorrigeerde) uitslag op met wijzigingshistorie.
export function saveResult(ev, match, { flagsRed, flagsBlue, referees, by, deviceId, reason }) {
  const refs = referees || ev.settings.referees;
  const winnerId = winnerFromFlags(match, flagsRed, flagsBlue);
  const errs = validateResult({ flagsRed, flagsBlue }, refs);
  if (errs.length) return { ok: false, errors: errs };
  const at = nowIso();
  let r = resultFor(ev, match.id);
  if (r) {
    const prev = { winnerId: r.winnerId, flagsRed: r.flagsRed, flagsBlue: r.flagsBlue, referees: r.referees, by: r.by, at: r.updatedAt };
    r.history = [...(r.history || []), { at, by: by || 'onbekend', deviceId, reason: reason || 'correctie', prev }];
    Object.assign(r, { winnerId, flagsRed, flagsBlue, referees: refs, by, deviceId, updatedAt: at, rev: (r.rev || 1) + 1 });
  } else {
    r = { id: 'r-' + match.id, matchId: match.id, matchKey: match.key, poolId: match.poolId, winnerId, flagsRed, flagsBlue, referees: refs, by, deviceId, createdAt: at, updatedAt: at, rev: 1, history: [] };
    ev.results.push(r);
  }
  return { ok: true, result: r };
}

// Poulestand: punten, dan vlaggen. Beslispartijen en beslissingen bepalen de rest.
export function standings(ev, pool) {
  const pById = byId(ev.participants);
  const matches = poolMatches(ev, pool.id);
  const rows = new Map(pool.participantIds.map(id => [id, { id, p: pById[id], name: displayName(pById[id]), played: 0, wins: 0, points: 0, flags: 0, refCounts: new Set(), total: 0, tbWins: 0, tbFlags: 0 }]));
  const regular = matches.filter(m => m.kind !== 'beslis');
  let done = 0;
  for (const m of regular) {
    const r = resultFor(ev, m.id);
    for (const id of [m.redId, m.blueId]) if (rows.has(id)) rows.get(id).total++;
    if (!r) continue;
    done++;
    for (const [id, f] of [[m.redId, r.flagsRed], [m.blueId, r.flagsBlue]]) {
      const row = rows.get(id); if (!row) continue;
      row.played++; row.flags += f; row.refCounts.add(r.referees);
      if (r.winnerId === id) { row.wins++; row.points += WIN_POINTS; } else row.points += LOSS_POINTS;
    }
  }
  const tbMatches = matches.filter(m => m.kind === 'beslis');
  for (const m of tbMatches) {
    const r = resultFor(ev, m.id); if (!r) continue;
    for (const [id, f] of [[m.redId, r.flagsRed], [m.blueId, r.flagsBlue]]) {
      const row = rows.get(id); if (!row) continue;
      row.tbFlags += f; if (r.winnerId === id) row.tbWins++;
    }
  }
  const list = [...rows.values()];
  const decision = (ev.decisions || []).filter(d => d.poolId === pool.id).slice(-1)[0];
  const decRank = decision ? Object.fromEntries(decision.order.map((id, i) => [id, i])) : {};
  list.sort((a, b) => b.points - a.points || b.flags - a.flags || b.tbWins - a.tbWins || b.tbFlags - a.tbFlags || (decRank[a.id] ?? 99) - (decRank[b.id] ?? 99) || a.name.localeCompare(b.name));
  // Posities toekennen; gelijken zonder beslissing delen een positie.
  let pos = 0;
  list.forEach((row, i) => {
    const prev = list[i - 1];
    const same = prev && prev.points === row.points && prev.flags === row.flags && prev.tbWins === row.tbWins && prev.tbFlags === row.tbFlags && (decRank[prev.id] ?? 99) === (decRank[row.id] ?? 99);
    if (!same) pos = i + 1;
    row.pos = pos;
  });
  const complete = done === regular.length && regular.length > 0;
  const mixedRefs = new Set(list.flatMap(r => [...r.refCounts])).size > 1;
  const ties = complete ? findPrizeTies(ev, list) : [];
  return { rows: list, done, total: regular.length, complete, mixedRefs, ties, decision, pending: ties.length > 0 };
}

// Groepen deelnemers die gelijk staan op een prijspositie.
function findPrizeTies(ev, rows) {
  const places = ev.settings.prizePlaces || 3;
  const groups = new Map();
  for (const r of rows) { if (!groups.has(r.pos)) groups.set(r.pos, []); groups.get(r.pos).push(r); }
  const out = [];
  for (const [pos, g] of groups) if (g.length > 1 && pos <= places) out.push({ pos, ids: g.map(r => r.id), names: g.map(r => r.name) });
  return out;
}

// Plant beslispartijen in voor een gelijke stand (ieder tegen ieder binnen de groep).
export function addTiebreak(ev, pool, ids) {
  const created = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const key = matchKey(pool.id, ids[i], ids[j], 'beslis');
    const exists = ev.matches.find(m => m.key === key && !resultFor(ev, m.id));
    if (exists) continue;
    const m = { id: uid('m'), key: key + ':' + uid().slice(0, 4), poolId: pool.id, discipline: pool.discipline, kind: 'beslis', round: 99, redId: ids[i], blueId: ids[j] };
    ev.matches.push(m); created.push(m);
  }
  numberMatches(ev, pool.id);
  return created;
}

export function recordDecision(ev, pool, { order, referee, note, by }) {
  const d = { id: uid('dc'), poolId: pool.id, order, referee, note, by, at: nowIso() };
  ev.decisions.push(d);
  return d;
}

// Prijswinnaars van een poule (alleen als stand vaststaat).
export function prizeWinners(ev, pool) {
  const st = standings(ev, pool);
  const places = ev.settings.prizePlaces || 3;
  return { ...st, winners: st.rows.filter(r => r.pos <= places) };
}

export function nextOpenMatch(ev, pool) {
  return poolMatches(ev, pool.id).find(m => !resultFor(ev, m.id)) || null;
}
