// Datamodel van een evenement. Alles wat later online gesynchroniseerd moet
// worden is een lijst records met een eigen id, rev, updatedAt en deviceId.
import { uid, nowIso, ageOn } from './util.js';

export const SCHEMA_VERSION = 1;
export const APP_ID = 'kuro-cup-planner';

// Kyu-graad -> bandkleur (standaard; per deelnemer aanpasbaar via CSV-kolom "band")
export const KYU_BELTS = {
  10: 'wit', 9: 'geel', 8: 'oranje', 7: 'groen', 6: 'blauw', 5: 'blauw',
  4: 'paars', 3: 'bruin', 2: 'bruin', 1: 'bruin', 0: 'zwart',
};
export const BELT_SWATCH = {
  wit: '#ffffff', geel: '#f2c94c', oranje: '#f2994a', groen: '#27ae60', blauw: '#2f6fd6',
  paars: '#8e44ad', bruin: '#7a4a24', zwart: '#111111', rood: '#c8102e',
};

// Niveau-groepen voor indeling. index loopt op met ervaring.
export const LEVELS = [
  { key: 'beginner', label: 'Beginner', kyus: [10, 9] },
  { key: 'basis', label: 'Basis', kyus: [8, 7] },
  { key: 'gevorderd', label: 'Gevorderd', kyus: [6, 5, 4] },
  { key: 'ver', label: 'Ver gevorderd', kyus: [3, 2, 1, 0] },
];
export function levelIndex(kyu) {
  if (kyu == null) return 0;
  const i = LEVELS.findIndex(l => l.kyus.includes(kyu));
  return i < 0 ? 0 : i;
}
export function beltFor(p) {
  if (p.belt) return p.belt;
  if (p.kyu == null) return 'wit';
  return KYU_BELTS[p.kyu] || 'wit';
}

export const ROLES = {
  scheidsrechter: { label: 'Scheidsrechter', perField: 3 },
  tafel: { label: 'Tafelmedewerker', perField: 2 },
  reserve: { label: 'Reserve-scheidsrechter', perField: 1, optional: true },
  helper: { label: 'Helper (banden & klaarzetten)', perField: 2 },
  ehbo: { label: 'Hoofd EHBO', perEvent: 1 },
  ehboAssist: { label: 'Assistent EHBO', perEvent: 1, canAlso: 'helper' },
};
// Rollen voor de hele zaal (niet per veld). De assistent EHBO mag tegelijk helper bij een tafel zijn.
export const GENERAL_FIELD = 'algemeen';

export const DISCIPLINES = { kata: 'Kata', kumite: 'Kumite' };

export function stamp(rec, device) {
  rec.rev = (rec.rev || 0) + 1;
  rec.updatedAt = nowIso();
  if (device) rec.deviceId = device;
  return rec;
}

export function defaultSupplies() {
  // Aantal = vast + per actief veld + per poule + per deelnemer + per vrijwilliger
  return [
    { id: uid('s'), key: 'band-rood', name: 'Rode banden', perField: 2, fixed: 2, note: '' },
    { id: uid('s'), key: 'band-blauw', name: 'Blauwe banden', perField: 2, fixed: 2, note: '' },
    { id: uid('s'), key: 'vlaggen', name: 'Vlaggensets rood/blauw (per scheidsrechter)', perField: 4, fixed: 0, note: 'incl. reserve-scheidsrechter' },
    { id: uid('s'), key: 'ballen', name: 'Ballen of stootkussens (kumiteveld)', perField: 2, fixed: 1, onlyKumite: true, note: '' },
    { id: uid('s'), key: 'timer', name: 'Timer / stopwatch(-display)', perField: 1, fixed: 1, note: '' },
    { id: uid('s'), key: 'fluit', name: 'Fluit', perField: 1, fixed: 0, note: '' },
    { id: uid('s'), key: 'stoelen', name: 'Stoelen', perField: 7, fixed: 4, note: 'scheidsrechters, tafel, helpers, administratie' },
    { id: uid('s'), key: 'tafels', name: 'Tafels', perField: 1, fixed: 2, note: 'plus administratie en eten & drinken' },
    { id: uid('s'), key: 'tablet', name: 'Tablet/laptop met de app erop (1 per tafel)', perField: 1, fixed: 0, note: 'vooraf geopend en geïnstalleerd' },
    { id: uid('s'), key: 'oplader', name: 'Opladers / powerbank + verlengkabel', perField: 1, fixed: 1, note: 'stroomkabel naar kumitetafel' },
    { id: uid('s'), key: 'formulieren', name: 'Geprinte poule-/scoreformulieren', perField: 0, fixed: 0, perPool: 2, note: 'papieren back-up' },
    { id: uid('s'), key: 'pennen', name: 'Pennen en markers', perField: 4, fixed: 4, note: '' },
    { id: uid('s'), key: 'klemborden', name: 'Klemborden', perField: 2, fixed: 1, note: '' },
    { id: uid('s'), key: 'ehbo', name: 'EHBO-set', perField: 0, fixed: 1, note: 'plus koelelementen' },
    { id: uid('s'), key: 'matten', name: 'Matten / tatami (vlak)', perField: 1, fixed: 0, note: 'per veld één vlak' },
    { id: uid('s'), key: 'vaantje', name: 'Deelnemersvaantjes (bestellen)', perParticipant: 1, fixed: 0, note: 'iedere deelnemer krijgt een vaantje' },
    { id: uid('s'), key: 'certificaat', name: 'Certificaten van deelname (mooi papier, zwarte inkt)', perParticipant: 1, fixed: 3, note: 'print via Documenten > Certificaten' },
    { id: uid('s'), key: 'bedankje', name: 'Bedankje vrijwilliger: {bedankje}', perVolunteer: 1, fixed: 0, note: '' },
    { id: uid('s'), key: 'podium', name: 'Gelamineerde A4 met cijfer 1, 2 en 3', fixed: 3, note: 'op gymkasten van verschillende hoogte als podium' },
    { id: uid('s'), key: 'gymkasten', name: 'Gymkasten (3 hoogtes) voor podium', fixed: 3, note: '' },
  ];
}

export function defaultCatering() {
  return [
    { id: uid('c'), key: 'water', name: 'Flesjes water', perVolunteer: 1.5, fixed: 0, note: '1,5 flesje per vrijwilliger' },
    { id: uid('c'), key: 'koffie', name: 'Koffiebonnen', perVolunteer: 2, fixed: 0, note: '' },
    { id: uid('c'), key: 'reep', name: 'Tussendoortje / reepje', perVolunteer: 1, fixed: 0, note: '' },
    { id: uid('c'), key: 'appels', name: 'Appels', perVolunteer: 0.5, fixed: 0, note: 'fruit' },
    { id: uid('c'), key: 'bananen', name: 'Bananen', perVolunteer: 0.5, fixed: 0, note: 'fruit' },
    { id: uid('c'), key: 'snoep', name: 'Pot snoep (dropjes)', perVolunteer: 0, fixed: 1, note: '' },
    { id: uid('c'), key: 'lunch', name: 'Lunch', perVolunteer: 1, fixed: 0, note: '' },
  ];
}

// Standaard kostenposten. Eenheidsprijzen zijn schattingen en per toernooi aan te passen.
export const COST_DEFAULTS = { 'prijs:1': 6.5, 'prijs:2': 3.5, 'prijs:3': 3.5, 'prijs:4': 3.5, deelname: 2.5, vaantjes: 2.75, certificaten: 0.6, printen: 15, eten: 4, lunch: 6, bedankjes: 7.5 };
export function defaultCosts() { return { unit: { ...COST_DEFAULTS }, qty: {}, actual: {}, notes: {}, oneOff: [] }; }

export function defaultProgram() {
  return [
    { id: uid('p'), title: 'Zaal indelen en klaarzetten (vrijwilligers)', kind: 'vrijwilligers', start: '08:15', durationMin: 30, afterMatches: false },
    { id: uid('p'), title: 'Vrijwilligersoverleg en indeling bespreken', kind: 'vrijwilligers', start: '08:45', durationMin: 15, afterMatches: false },
    { id: uid('p'), title: 'Opening', kind: 'opening', start: '09:00', durationMin: 10, afterMatches: false },
    { id: uid('p'), title: 'Pauze', kind: 'pauze', start: '11:00', durationMin: 15, afterMatches: false },
    { id: uid('p'), title: 'Demonstratie (max. 10 minuten)', kind: 'demonstratie', start: '', durationMin: 10, afterMatches: true },
    { id: uid('p'), title: 'Prijsuitreiking', kind: 'prijsuitreiking', start: '', durationMin: 20, afterMatches: true },
  ];
}

export function newEvent(deviceId, overrides = {}) {
  const kata = { id: uid('f'), name: 'Veld 1 — Kata', discipline: 'kata', flexible: true };
  const kumite = { id: uid('f'), name: 'Veld 2 — Kumite', discipline: 'kumite', flexible: true };
  const year = new Date().getFullYear();
  return {
    id: uid('e'),
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    rev: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    deviceId,
    archived: false,
    isSample: false,
    info: {
      name: `Kuro Cup ${year}`,
      date: '',
      location: '',
      startTime: '08:15',
      endTime: '13:30',
      organizer: 'Dojo Kuro',
      notes: '',
    },
    settings: {
      poolTarget: 6,
      poolMax: 8,
      poolMin: 3,
      kataMatchSec: 180,          // 3 minuten incl. wissel en uitslag
      kumiteYoungSec: 30,         // t/m 7 jaar
      kumiteOldSec: 60,           // vanaf 8 jaar
      kumiteYoungMaxAge: 7,
      kumiteOverheadSec: 90,      // klaarzetten, wissel, uitslag
      kumiteTarget: 'bal',        // 'bal' | 'stootkussen'
      referees: 3,
      allowEmergencySingleReferee: false,
      crossFieldBufferSec: 180,   // tijd tussen partijen van één deelnemer op verschillende velden
      fieldSwitching: true,       // velden mogen na afloop het andere onderdeel overnemen
      shiftMinutes: 60,           // vrijwilligersblokken
      maxConsecutiveShifts: 2,    // daarna pauze
      useReserveReferee: true,
      prizePlaces: 3,
      prizeTypes: { 1: 'Beker / goud', 2: 'Medaille zilver', 3: 'Medaille brons' },
      participationMedal: false,
      doubleRoundUpTo: 3,         // poules t/m dit aantal deelnemers: iedereen twee keer tegen elkaar
      linkedPools: true,          // kata- en kumitepoules gelijk indelen
      rosterMode: 'heledag',      // 'heledag' | 'blokken'
      thanksGift: 'Bosje bloemen',
    },
    fields: [kata, kumite],
    program: defaultProgram(),
    participants: [],
    pools: [],
    matches: [],
    results: [],
    decisions: [],
    volunteers: [],
    assignments: [],
    supplies: defaultSupplies(),
    catering: defaultCatering(),
    costs: defaultCosts(),
    log: [],
    ...overrides,
  };
}

// Kumitetijd per deelnemer, op basis van werkelijke leeftijd op wedstrijddatum.
export function kumiteSecondsFor(ev, p) {
  const age = ageOn(p.birthDate, ev.info.date);
  if (age == null) return ev.settings.kumiteOldSec;
  return age <= ev.settings.kumiteYoungMaxAge ? ev.settings.kumiteYoungSec : ev.settings.kumiteOldSec;
}

export function matchDurationSec(ev, m, pById) {
  if (m.discipline === 'kata') return ev.settings.kataMatchSec;
  const r = pById[m.redId], b = pById[m.blueId];
  const fight = Math.max(r ? kumiteSecondsFor(ev, r) : 60, b ? kumiteSecondsFor(ev, b) : 60);
  return fight + ev.settings.kumiteOverheadSec;
}

export function displayName(p) {
  if (!p) return '?';
  return p.name || [p.firstName, p.lastName].filter(Boolean).join(' ');
}

export function shortName(p) {
  if (!p) return '?';
  const parts = displayName(p).split(' ');
  if (parts.length < 2) return parts[0];
  return parts[0] + ' ' + parts.slice(1).map(x => /^(van|de|der|den|het|ter|te|v\.?d\.?)$/i.test(x) ? x : x[0] + '.').join(' ');
}

// Migraties voor oudere opgeslagen gegevens
export function migrate(ev) {
  if (!ev.schemaVersion) ev.schemaVersion = 1;
  ev.decisions = ev.decisions || []; ev.assignments = ev.assignments || []; ev.log = ev.log || []; ev.program = ev.program || [];
  ev.supplies = ev.supplies || defaultSupplies();
  ev.catering = ev.catering || defaultCatering();
  ev.costs = { ...defaultCosts(), ...(ev.costs || {}) };
  ev.costs.unit = { ...COST_DEFAULTS, ...ev.costs.unit };
  ev.settings = { ...newEvent('x').settings, ...ev.settings };
  // Nieuwe standaard-benodigdheden toevoegen aan oudere evenementen
  const keys = new Set(ev.supplies.map(s => s.key).filter(Boolean));
  const oldTablet = ev.supplies.find(s => s.name === 'Tablets (opgeladen) + oplader');
  if (oldTablet) { oldTablet.key = 'tablet'; oldTablet.name = 'Tablet/laptop met de app erop (1 per tafel)'; oldTablet.fixed = 0; keys.add('tablet'); }
  for (const d of defaultSupplies()) if (['tablet', 'vaantje', 'certificaat', 'bedankje', 'podium', 'gymkasten'].includes(d.key) && !keys.has(d.key)) ev.supplies.push(d);
  return ev;
}
