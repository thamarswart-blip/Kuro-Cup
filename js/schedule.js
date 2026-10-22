// Tijdschema: poules over velden verdelen en wedstrijden in de tijd zetten.
// Tijden in seconden sinds middernacht.
import { parseTime, fmtTime, fmtDuration, byId } from './util.js';
import { matchDurationSec, displayName, DISCIPLINES } from './model.js';
import { resultFor } from './results.js';

export function programBlocks(ev, lastMatchEnd = null) {
  const out = [];
  // Onderdelen "na de laatste wedstrijd" volgen elkaar op in programmavolgorde (bijv. demonstratie, dan prijsuitreiking).
  let after = lastMatchEnd;
  for (const p of ev.program || []) {
    const dur = (p.durationMin || 0) * 60;
    if (p.afterMatches) {
      if (after != null) { out.push({ ...p, s: after, e: after + dur }); after += dur; }
      continue;
    }
    const s = parseTime(p.start);
    if (s == null) continue;
    out.push({ ...p, s, e: s + dur });
  }
  return out.sort((a, b) => a.s - b.s);
}

function poolDuration(ev, pool, pById) {
  return ev.matches.filter(m => m.poolId === pool.id && !m.orphan).reduce((t, m) => t + matchDurationSec(ev, m, pById), 0);
}

// Stap 1: poules aan velden toewijzen (langste eerst naar minst belaste veld).
export function assignPoolsToFields(ev) {
  const pById = byId(ev.participants);
  const fields = ev.fields;
  const load = Object.fromEntries(fields.map(f => [f.id, 0]));
  const assign = {};
  const pools = ev.pools.slice().map(p => ({ p, d: poolDuration(ev, p, pById) }));
  const canTake = (f, pool) => f.discipline === pool.discipline || (ev.settings.fieldSwitching && f.flexible);
  // Vaste toewijzingen eerst.
  for (const { p, d } of pools) if (p.pinnedFieldId && fields.some(f => f.id === p.pinnedFieldId)) { assign[p.id] = p.pinnedFieldId; load[p.pinnedFieldId] += d; }
  const free = pools.filter(x => !assign[x.p.id]).sort((a, b) => b.d - a.d);
  for (const { p, d } of free) {
    let cands = fields.filter(f => f.discipline === p.discipline);
    if (!cands.length) cands = fields.filter(f => canTake(f, p));
    if (!cands.length) cands = fields;
    if (!cands.length) continue;
    const f = cands.reduce((a, b) => load[a.id] <= load[b.id] ? a : b);
    assign[p.id] = f.id; load[f.id] += d;
  }
  // Herverdelen: een veld dat eerder klaar is neemt poules van het andere onderdeel over.
  if (ev.settings.fieldSwitching) {
    for (let iter = 0; iter < 60; iter++) {
      const maxF = fields.reduce((a, b) => load[a.id] >= load[b.id] ? a : b, fields[0]);
      if (!maxF) break;
      const movable = pools.filter(x => assign[x.p.id] === maxF.id && !x.p.pinnedFieldId).sort((a, b) => a.d - b.d);
      let moved = false;
      for (const x of movable) {
        const targets = fields.filter(f => f.id !== maxF.id && canTake(f, x.p));
        if (!targets.length) continue;
        const g = targets.reduce((a, b) => load[a.id] <= load[b.id] ? a : b);
        if (load[g.id] + x.d < load[maxF.id] - 60) {
          assign[x.p.id] = g.id; load[g.id] += x.d; load[maxF.id] -= x.d; moved = true; break;
        }
      }
      if (!moved) break;
    }
  }
  return { assign, load };
}

// Stap 2: wedstrijden in de tijd plannen.
export function buildSchedule(ev) {
  const pById = byId(ev.participants);
  const dayStart = parseTime(ev.info.startTime) ?? 9 * 3600;
  const blocks = programBlocks(ev);
  const { assign } = assignPoolsToFields(ev);
  const buffer = ev.settings.crossFieldBufferSec || 0;
  for (const p of ev.pools) p.fieldId = assign[p.id] || null;

  const busy = {}; // deelnemer -> [{s,e,fieldId}]
  const fieldBusy = Object.fromEntries(ev.fields.map(f => [f.id, []]));
  const addBusy = (m) => {
    for (const id of [m.redId, m.blueId]) (busy[id] = busy[id] || []).push({ s: m.start, e: m.end, fieldId: m.fieldId });
    (fieldBusy[m.fieldId] = fieldBusy[m.fieldId] || []).push({ s: m.start, e: m.end });
  };

  // Gespeelde en handmatig vastgezette partijen blijven op hun plek.
  const all = ev.matches.filter(m => !m.orphan);
  const fixed = all.filter(m => m.start != null && m.fieldId && (m.pinned || resultFor(ev, m.id)));
  fixed.forEach(m => { m.end = m.start + matchDurationSec(ev, m, pById); addBusy(m); });
  const fixedIds = new Set(fixed.map(m => m.id));
  const todo = all.filter(m => !fixedIds.has(m.id));
  todo.forEach(m => { m.start = null; m.end = null; m.fieldId = null; });

  const earliest = (m, fieldId, t, d) => {
    let s = t;
    for (let guard = 0; guard < 500; guard++) {
      let moved = false;
      for (const b of blocks) if (s < b.e && s + d > b.s) { s = b.e; moved = true; }
      for (const x of fieldBusy[fieldId]) if (s < x.e && s + d > x.s) { s = x.e; moved = true; }
      for (const id of [m.redId, m.blueId]) for (const x of busy[id] || []) {
        const buf = x.fieldId !== fieldId ? buffer : 0;
        if (s < x.e + buf && s + d + buf > x.s) { s = x.e + buf; moved = true; }
      }
      if (!moved) return s;
    }
    return s;
  };

  // Per veld: poulevolgorde (eigen onderdeel eerst), steeds twee poules tegelijk open.
  const fieldState = ev.fields.map(f => {
    const pools = ev.pools.filter(p => p.fieldId === f.id)
      .sort((a, b) => (a.discipline === f.discipline ? 0 : 1) - (b.discipline === f.discipline ? 0 : 1));
    const queues = pools.map(p => ({ pool: p, list: todo.filter(m => m.poolId === p.id).sort((a, b) => (a.kind === 'beslis') - (b.kind === 'beslis') || (a.num || 0) - (b.num || 0)) }));
    return { f, t: dayStart, queues, lastPool: null };
  });

  let remaining = todo.length;
  for (let guard = 0; remaining > 0 && guard < 20000; guard++) {
    const active = fieldState.filter(fs => fs.queues.some(q => q.list.length));
    if (!active.length) break;
    // Veld met de vroegst mogelijke volgende partij
    let best = null;
    for (const fs of active) {
      const open = fs.queues.filter(q => q.list.length).slice(0, 2);
      // Afwisselen tussen de twee open poules
      open.sort((a, b) => (a.pool.id === fs.lastPool ? 1 : 0) - (b.pool.id === fs.lastPool ? 1 : 0));
      for (const q of open) {
        // Binnen een poule mag een latere partij voor als de eerste moet wachten.
        for (const m of q.list.slice(0, 3)) {
          const d = matchDurationSec(ev, m, pById);
          const s = earliest(m, fs.f.id, fs.t, d);
          if (!best || s < best.s - 1) best = { fs, q, m, s, d };
        }
      }
    }
    if (!best) break;
    const { fs, q, m, s, d } = best;
    m.fieldId = fs.f.id; m.start = s; m.end = s + d;
    addBusy(m);
    q.list.splice(q.list.indexOf(m), 1);
    fs.t = m.end; fs.lastPool = q.pool.id;
    remaining--;
  }
  // Partijnummers volgen de geplande volgorde, zodat "partij 1" ook echt de eerste is.
  for (const p of ev.pools) {
    ev.matches.filter(m => m.poolId === p.id && !m.orphan)
      .sort((a, b) => (a.kind === 'beslis') - (b.kind === 'beslis') || (a.start ?? 1e9) - (b.start ?? 1e9) || (a.num || 0) - (b.num || 0))
      .forEach((m, i) => { m.num = i + 1; });
  }
  ev.planGeneratedAt = new Date().toISOString();
  return checkSchedule(ev);
}

// Controle op conflicten en overschrijding (ook na handmatige wijzigingen).
export function checkSchedule(ev) {
  const pById = byId(ev.participants);
  const fById = byId(ev.fields);
  const poolById = byId(ev.pools);
  const issues = [];
  const all = ev.matches.filter(m => !m.orphan);
  for (const m of all) if (m.start != null) m.end = m.start + matchDurationSec(ev, m, pById);
  const planned = all.filter(m => m.start != null && m.fieldId);
  const unplanned = all.filter(m => m.start == null || !m.fieldId);
  const lastEnd = planned.length ? Math.max(...planned.map(m => m.end)) : null;
  const blocks = programBlocks(ev, lastEnd);
  const buffer = ev.settings.crossFieldBufferSec || 0;
  const label = m => `${poolById[m.poolId]?.name || ''} partij ${m.num} (${displayName(pById[m.redId])} – ${displayName(pById[m.blueId])})`;

  if (!ev.fields.length) issues.push({ level: 'error', text: 'Er zijn geen velden ingesteld.', fix: 'Voeg bij Evenement > Velden minimaal één veld toe.' });
  if (unplanned.length) issues.push({ level: 'error', text: `${unplanned.length} wedstrijd(en) zijn niet ingepland.`, fix: 'Klik op "Planning maken" of zet ze handmatig op een veld en tijd.', matchIds: unplanned.map(m => m.id) });

  // Velden: geen twee partijen tegelijk
  const byField = new Map();
  for (const m of planned) { if (!byField.has(m.fieldId)) byField.set(m.fieldId, []); byField.get(m.fieldId).push(m); }
  for (const [fid, list] of byField) {
    if (!fById[fid]) issues.push({ level: 'error', text: `${list.length} wedstrijd(en) staan op een veld dat niet meer bestaat.`, fix: 'Maak de planning opnieuw.', matchIds: list.map(m => m.id) });
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) if (list[i].start < list[i - 1].end) {
      issues.push({ level: 'error', text: `Dubbele boeking op ${fById[fid]?.name}: ${label(list[i - 1])} en ${label(list[i])} overlappen om ${fmtTime(list[i].start)}.`, fix: 'Schuif een van beide partijen op of maak de planning opnieuw.', matchIds: [list[i - 1].id, list[i].id] });
    }
    for (const m of list) for (const b of blocks) if (!b.afterMatches && m.start < b.e && m.end > b.s)
      issues.push({ level: 'warn', text: `${label(m)} valt in "${b.title}" (${fmtTime(b.s)}–${fmtTime(b.e)}).`, fix: 'Verplaats de partij of pas het programmaonderdeel aan.', matchIds: [m.id] });
  }
  // Deelnemers: niet op twee plaatsen tegelijk
  const byP = new Map();
  for (const m of planned) for (const id of [m.redId, m.blueId]) { if (!byP.has(id)) byP.set(id, []); byP.get(id).push(m); }
  for (const [pid, list] of byP) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      const buf = a.fieldId !== b.fieldId ? buffer : 0;
      if (b.start < a.end) issues.push({ level: 'error', text: `${displayName(pById[pid])} staat om ${fmtTime(b.start)} op twee plaatsen tegelijk.`, fix: 'Schuif een van de partijen op.', matchIds: [a.id, b.id] });
      else if (b.start < a.end + buf) issues.push({ level: 'warn', text: `${displayName(pById[pid])} heeft maar ${Math.round((b.start - a.end) / 60)} min om van ${fById[a.fieldId]?.name} naar ${fById[b.fieldId]?.name} te gaan.`, fix: 'Geef meer tijd tussen beide partijen.', matchIds: [a.id, b.id] });
    }
  }
  // Eindtijd
  const wanted = parseTime(ev.info.endTime);
  const finalEnd = blocks.length ? Math.max(lastEnd || 0, ...blocks.map(b => b.e)) : lastEnd;
  let overrun = null;
  if (wanted != null && finalEnd != null && finalEnd > wanted) {
    overrun = finalEnd - wanted;
    issues.push({ level: 'warn', text: `De dag loopt ${fmtDuration(overrun)} uit: klaar om ${fmtTime(finalEnd)} in plaats van ${fmtTime(wanted)}.`, fix: overrunReason(ev, planned, pById), kind: 'overrun' });
  }
  // Velden zonder werk
  for (const f of ev.fields) if (!byField.has(f.id) && planned.length) issues.push({ level: 'info', text: `${f.name} heeft geen wedstrijden.`, fix: 'Zet "Veld mag ander onderdeel overnemen" aan of verwijder het veld.' });

  const fieldSpans = {};
  for (const [fid, list] of byField) fieldSpans[fid] = { s: Math.min(...list.map(m => m.start)), e: Math.max(...list.map(m => m.end)), disciplines: [...new Set(list.map(m => m.discipline))] };
  return { issues, lastEnd, finalEnd, overrun, blocks, fieldSpans, plannedCount: planned.length, total: all.length };
}

function overrunReason(ev, planned, pById) {
  const fields = ev.fields.length || 1;
  const work = planned.reduce((t, m) => t + (m.end - m.start), 0);
  const start = parseTime(ev.info.startTime), end = parseTime(ev.info.endTime);
  const blocks = programBlocks(ev).reduce((t, b) => t + (b.e - b.s), 0);
  const avail = (end - start - blocks) * fields;
  const parts = [];
  if (work > avail) parts.push(`Reden: er is ${fmtDuration(work)} aan wedstrijden, verdeeld over ${fields} veld(en) is dat meer dan de ${fmtDuration(Math.max(0, avail))} die beschikbaar is.`);
  else parts.push('Reden: deelnemers die zowel kata als kumite doen moeten op elkaar wachten, of de velden zijn ongelijk belast.');
  parts.push('Mogelijke oplossingen: een veld extra, kortere wisseltijd, een kortere pauze, of de eindtijd later zetten.');
  return parts.join(' ');
}

export function matchesByField(ev) {
  const out = {};
  for (const f of ev.fields) out[f.id] = ev.matches.filter(m => m.fieldId === f.id && m.start != null && !m.orphan).sort((a, b) => a.start - b.start);
  return out;
}

export function setMatchTime(ev, match, fieldId, hhmm) {
  const s = parseTime(hhmm);
  if (s == null) return false;
  match.fieldId = fieldId; match.start = s; match.pinned = true;
  return true;
}

export function disciplineLabel(d) { return DISCIPLINES[d] || d; }
