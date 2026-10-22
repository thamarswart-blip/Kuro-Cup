// Vrijwilligersrooster: tijdsblokken per veld, bezetting per rol, roulatie en pauzes.
import { uid, parseTime, fmtTime, deepClone } from './util.js';
import { ROLES, GENERAL_FIELD } from './model.js';
import { checkSchedule } from './schedule.js';

// Rollen voor de hele zaal: 1 hoofd EHBO en 1 assistent EHBO.
export function eventNeeds() { return { ehbo: ROLES.ehbo.perEvent, ehboAssist: ROLES.ehboAssist.perEvent }; }

// Mag iemand in hetzelfde blok twee rollen hebben? Alleen assistent EHBO + helper.
export function canCombine(r1, r2) {
  return (ROLES[r1]?.canAlso === r2) || (ROLES[r2]?.canAlso === r1);
}
function busyFor(ev, shiftIndex, role, except = null) {
  const out = new Set();
  for (const a of ev.assignments) if (a.shiftIndex === shiftIndex && a !== except && !canCombine(a.role, role)) out.add(a.volunteerId);
  // Iemand die al twee rollen heeft, kan geen derde krijgen.
  const count = {};
  for (const a of ev.assignments) if (a.shiftIndex === shiftIndex && a !== except) count[a.volunteerId] = (count[a.volunteerId] || 0) + 1;
  for (const [vid, n] of Object.entries(count)) if (n >= 2) out.add(vid);
  return out;
}
export { busyFor };

export function roleNeeds(ev) {
  const needs = {
    scheidsrechter: ev.settings.referees || 3,
    tafel: ROLES.tafel.perField,
    helper: ROLES.helper.perField,
  };
  if (ev.settings.useReserveReferee) needs.reserve = 1;
  return needs;
}

// Tijdsblokken van de dag, met per blok welke velden actief zijn.
export const wholeDay = ev => (ev.settings.rosterMode || 'heledag') === 'heledag';

export function shifts(ev) {
  const chk = checkSchedule(ev);
  const start = parseTime(ev.info.startTime) ?? 9 * 3600;
  const end = Math.max(chk.finalEnd || parseTime(ev.info.endTime) || start + 4 * 3600, start + 3600);
  if (wholeDay(ev)) {
    // Standaard: iedereen staat van begin tot eind op hetzelfde veld in dezelfde rol.
    const activeFields = ev.fields.filter(f => ev.matches.some(m => m.fieldId === f.id && m.start != null)).map(f => f.id);
    return [{ index: 0, s: start, e: end, label: `Hele dag ${fmtTime(start)}–${fmtTime(end)}`, activeFields: activeFields.length ? activeFields : ev.fields.map(f => f.id) }];
  }
  const len = (ev.settings.shiftMinutes || 60) * 60;
  const out = [];
  for (let s = start, i = 0; s < end; s += len, i++) {
    const e = Math.min(s + len, end);
    const activeFields = ev.fields.filter(f => {
      const sp = chk.fieldSpans[f.id];
      if (!sp) return false;
      return ev.matches.some(m => m.fieldId === f.id && m.start != null && m.start < e && m.end > s);
    }).map(f => f.id);
    out.push({ index: i, s, e, label: `${fmtTime(s)}–${fmtTime(e)}`, activeFields });
  }
  return out;
}

// Bij "hele dag" mag iedereen ingepland worden; afwijkende tijden worden als aandachtspunt getoond.
export function partialAvailability(ev, v) {
  const start = parseTime(ev.info.startTime), from = parseTime(v.from), to = parseTime(v.to);
  if ((from != null && start != null && from > start) || (to != null)) return `${v.from || ev.info.startTime}–${v.to || 'einde'}`;
  return null;
}

export function isAvailable(v, shift) {
  if (shift.label && shift.label.startsWith('Hele dag')) return true;
  const from = parseTime(v.from), to = parseTime(v.to);
  if (from != null && from > shift.s) return false;
  if (to != null && to < shift.e) return false;
  return true;
}

const canDo = (v, role) => (v.roles || []).includes(role) || (role === 'reserve' && (v.roles || []).includes('scheidsrechter'));

export function autoAssign(ev, { keepManual = true } = {}) {
  const sh = shifts(ev);
  const needs = roleNeeds(ev);
  ev.assignments = keepManual ? ev.assignments.filter(a => a.manual && sh[a.shiftIndex]) : [];
  const total = {};
  ev.assignments.forEach(a => { total[a.volunteerId] = (total[a.volunteerId] || 0) + 1; });
  const maxRun = ev.settings.maxConsecutiveShifts || 2;
  const runLength = (vid, idx) => { let n = 0; for (let k = idx - 1; k >= 0; k--) { if (ev.assignments.some(a => a.volunteerId === vid && a.shiftIndex === k)) n++; else break; } return n; };
  const slots = s => [...Object.entries(eventNeeds()).map(([role, need]) => ({ fid: GENERAL_FIELD, role, need })),
    ...s.activeFields.flatMap(fid => Object.entries(needs).map(([role, need]) => ({ fid, role, need })))];
  for (const s of sh) {
    if (!s.activeFields.length) continue;
    for (const { fid, role, need } of slots(s)) {
      {
        const have = ev.assignments.filter(a => a.shiftIndex === s.index && a.fieldId === fid && a.role === role).length;
        for (let k = have; k < need; k++) {
          const busy = busyFor(ev, s.index, role);
          const hasRole = vid => ev.assignments.some(a => a.shiftIndex === s.index && a.volunteerId === vid);
          const cands = ev.volunteers.filter(v => canDo(v, role) && isAvailable(v, s) && !busy.has(v.id) && (runLength(v.id, s.index) < maxRun || hasRole(v.id)));
          if (!cands.length) break;
          const prevSame = a => ev.assignments.some(x => x.volunteerId === a.id && x.shiftIndex === s.index - 1 && x.fieldId === fid && x.role === role);
          // Voorkeur: wie nog vrij is, zelfde rol en veld als vorig blok, eigen hoofdrol, daarna wie het minst heeft gedaan.
          // (De assistent EHBO wordt dus pas helper als er niemand anders is.)
          cands.sort((a, b) => (hasRole(a.id) - hasRole(b.id)) || (prevSame(b) - prevSame(a)) || ((a.roles[0] === role ? 0 : 1) - (b.roles[0] === role ? 0 : 1)) || ((total[a.id] || 0) - (total[b.id] || 0)));
          const v = cands[0];
          ev.assignments.push({ id: uid('a'), volunteerId: v.id, fieldId: fid, shiftIndex: s.index, role, manual: false });
          total[v.id] = (total[v.id] || 0) + 1;
        }
      }
    }
  }
  return coverage(ev);
}

export function coverage(ev) {
  const sh = shifts(ev);
  const needs = roleNeeds(ev);
  const gaps = [], doubles = [];
  for (const s of sh) {
    const seen = new Map();
    for (const a of ev.assignments.filter(a => a.shiftIndex === s.index)) {
      const prev = seen.get(a.volunteerId);
      if (prev && !canCombine(prev.role, a.role)) doubles.push({ shift: s, volunteerId: a.volunteerId });
      seen.set(a.volunteerId, a);
    }
    if (s.activeFields.length) for (const [role, need] of Object.entries(eventNeeds())) {
      const have = ev.assignments.filter(a => a.shiftIndex === s.index && a.fieldId === GENERAL_FIELD && a.role === role).length;
      if (have < need) gaps.push({ shift: s, fieldId: GENERAL_FIELD, role, need, have, optional: false });
    }
    for (const fid of s.activeFields) for (const [role, need] of Object.entries(needs)) {
      const have = ev.assignments.filter(a => a.shiftIndex === s.index && a.fieldId === fid && a.role === role).length;
      if (have < need) gaps.push({ shift: s, fieldId: fid, role, need, have, optional: role === 'reserve' });
    }
  }
  // Totalen per rol: benodigd (piek) vs beschikbaar
  const peakFields = Math.max(0, ...sh.map(s => s.activeFields.length));
  const totals = [...Object.entries(needs).map(([role, need]) => ({
    role, perField: need, needed: need * peakFields,
    available: ev.volunteers.filter(v => canDo(v, role)).length,
  })), ...Object.entries(eventNeeds()).map(([role, need]) => ({
    role, perField: need, perEvent: true, needed: need,
    available: ev.volunteers.filter(v => canDo(v, role)).length,
  }))];
  return { shifts: sh, needs, eventNeeds: eventNeeds(), gaps, doubles, totals, peakFields };
}

// Welke functies ontbreken nog? Op basis van het (proef)rooster: per rol het aantal open plekken.
export function missingRoles(ev) {
  const copy = deepClone(ev);
  const cov = copy.assignments.length ? coverage(copy) : autoAssign(copy);
  const out = {};
  for (const g of cov.gaps) {
    if (g.optional) continue;
    out[g.role] = Math.max(out[g.role] || 0, 0) + (g.need - g.have);
  }
  // In blokken-modus telt het grootste tekort tegelijk, niet de som over alle blokken.
  if (!wholeDay(ev)) {
    for (const role of Object.keys(out)) {
      out[role] = Math.max(...cov.shifts.map(s => cov.gaps.filter(g => g.shift.index === s.index && g.role === role).reduce((t, g) => t + g.need - g.have, 0)));
    }
  }
  return Object.entries(out).filter(([, n]) => n > 0).map(([role, n]) => ({ role, n }));
}
