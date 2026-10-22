// Kostenraming per toernooi: standaardposten (aantallen uit het evenement) + eenmalige kosten.
import { COST_DEFAULTS } from './model.js';

export function participantCount(ev) { return ev.participants.filter(p => !p.withdrawn && (p.kata || p.kumite)).length; }

// Standaardposten met automatisch berekend aantal. Aantal en prijs zijn per post aan te passen.
export function costLines(ev) {
  const c = ev.costs;
  const pools = ev.pools.length;
  const parts = participantCount(ev);
  const vols = ev.volunteers.length;
  const lines = [];
  for (let i = 1; i <= (ev.settings.prizePlaces || 3); i++) {
    lines.push({ key: `prijs:${i}`, group: 'Prijzen', label: `Prijzen ${i}e plaats — ${ev.settings.prizeTypes[i] || 'prijs'}`, auto: pools, basis: `${pools} poules (kata en kumite apart)` });
  }
  if (ev.settings.participationMedal) lines.push({ key: 'deelname', group: 'Prijzen', label: 'Deelnamemedailles', auto: parts, basis: `${parts} deelnemers` });
  lines.push({ key: 'vaantjes', group: 'Deelnemers', label: 'Deelnemersvaantjes', auto: parts, basis: `${parts} deelnemers` });
  lines.push({ key: 'certificaten', group: 'Deelnemers', label: 'Certificaten van deelname (mooi papier)', auto: parts, basis: `${parts} deelnemers` });
  lines.push({ key: 'printen', group: 'Organisatie', label: "Printen schema's en formulieren", auto: 1, basis: 'vast bedrag' });
  lines.push({ key: 'eten', group: 'Vrijwilligers', label: 'Eten en drinken vrijwilligers', auto: vols, basis: `${vols} vrijwilligers (water, koffie, reepje, fruit, snoep)` });
  lines.push({ key: 'lunch', group: 'Vrijwilligers', label: 'Lunch vrijwilligers', auto: vols, basis: `${vols} vrijwilligers` });
  lines.push({ key: 'bedankjes', group: 'Vrijwilligers', label: `Bedankje vrijwilligers (${ev.settings.thanksGift || 'bosje bloemen'})`, auto: vols, basis: `${vols} vrijwilligers` });
  return lines.map(l => {
    const qty = c.qty[l.key] ?? l.auto;
    const unit = c.unit[l.key] ?? COST_DEFAULTS[l.key] ?? 0;
    const est = round(qty * unit);
    const actual = c.actual[l.key];
    return { ...l, qty, qtyOverridden: c.qty[l.key] != null, unit, est, actual: actual ?? null, note: c.notes[l.key] || '' };
  });
}

export function costSummary(ev) {
  const lines = costLines(ev);
  const one = (ev.costs.oneOff || []).map(o => ({ ...o, est: +o.est || 0, actual: o.actual ?? null }));
  const all = [...lines, ...one];
  const est = round(all.reduce((t, l) => t + l.est, 0));
  const actualFilled = all.filter(l => l.actual != null);
  const actual = round(actualFilled.reduce((t, l) => t + l.actual, 0));
  // Eindtotaal: werkelijk bedrag waar ingevuld, anders de schatting.
  const final = round(all.reduce((t, l) => t + (l.actual != null ? l.actual : l.est), 0));
  return { lines, oneOff: one, est, actual, final, filled: actualFilled.length, count: all.length,
    estStandard: round(lines.reduce((t, l) => t + l.est, 0)), estOneOff: round(one.reduce((t, l) => t + l.est, 0)) };
}

export const round = n => Math.round(n * 100) / 100;
export const euro = n => n == null ? '–' : '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
