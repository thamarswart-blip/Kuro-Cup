// VOORBEELDDATA — fictieve namen, geen echte leden.
import { uid } from './util.js';

const BOYS = ['Daan', 'Sem', 'Lucas', 'Milan', 'Noah', 'Levi', 'Finn', 'Luuk', 'Bram', 'Jesse', 'Thijs', 'Mees', 'Ruben', 'Tijn', 'Siem', 'Jens', 'Gijs', 'Olivier', 'Hugo', 'Boaz', 'Teun', 'Stijn', 'Ties', 'Jurre'];
const GIRLS = ['Julia', 'Sara', 'Lotte', 'Fleur', 'Emma', 'Tess', 'Noor', 'Sophie', 'Mila', 'Evi', 'Lieke', 'Roos', 'Anna', 'Saar', 'Fenna', 'Isa', 'Yara', 'Nova'];
const LAST = ['Voorbeeld', 'Testman', 'de Proef', 'Oefening', 'van Demo', 'Fictief', 'Bedacht', 'Verzonnen', 'Model', 'Schets'];

// Deterministische pseudo-random zodat het voorbeeld altijd hetzelfde is.
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

export function sampleParticipants(eventDate) {
  const r = rng(42);
  const year = +eventDate.slice(0, 4);
  const out = [];
  const make = (first, sex, i) => {
    const age = 5 + Math.floor(r() * 9);                 // 5 t/m 13 jaar
    const month = 1 + Math.floor(r() * 12), day = 1 + Math.floor(r() * 28);
    const by = year - age - (month > +eventDate.slice(5, 7) ? 1 : 0);
    const maxKyu = 10 - Math.min(7, Math.floor((age - 5) * 0.9 + r() * 2));
    const kyu = r() < 0.08 ? null : Math.max(3, Math.min(10, maxKyu));
    r();
    out.push({
      id: uid('p'),
      name: `${first} ${LAST[i % LAST.length]}`,
      birthDate: `${by}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      sex, kyu, belt: null,
      weight: r() < 0.5 ? Math.round(18 + (age - 5) * 4 + r() * 8) : null,
      experience: Math.floor(r() * 4),
      kata: true, kumite: true, // iedereen doet standaard mee aan beide onderdelen
      assumptions: kyu == null ? ['Geen kyu-graad: als beginner behandeld'] : [],
      checked: false,
    });
  };
  BOYS.forEach((n, i) => make(n, 'M', i));
  GIRLS.forEach((n, i) => make(n, 'V', i + 3));
  return out;
}

export function sampleVolunteers() {
  const list = [
    ['Scheidsrechter A (voorbeeld)', ['scheidsrechter']], ['Scheidsrechter B (voorbeeld)', ['scheidsrechter']], ['Scheidsrechter C (voorbeeld)', ['scheidsrechter']],
    ['Scheidsrechter D (voorbeeld)', ['scheidsrechter']], ['Scheidsrechter E (voorbeeld)', ['scheidsrechter']], ['Scheidsrechter F (voorbeeld)', ['scheidsrechter']],
    ['Scheidsrechter G (voorbeeld)', ['scheidsrechter', 'tafel']], ['Scheidsrechter H (voorbeeld)', ['scheidsrechter']],
    ['Tafel 1 (voorbeeld)', ['tafel']], ['Tafel 2 (voorbeeld)', ['tafel']], ['Tafel 3 (voorbeeld)', ['tafel']], ['Tafel 4 (voorbeeld)', ['tafel', 'helper']], ['Tafel 5 (voorbeeld)', ['tafel']],
    ['EHBO (voorbeeld)', ['ehbo']], ['Assistent EHBO (voorbeeld)', ['ehboAssist', 'helper']],
    ['Helper 1 (voorbeeld)', ['helper']], ['Helper 2 (voorbeeld)', ['helper']], ['Helper 3 (voorbeeld)', ['helper']], ['Helper 4 (voorbeeld)', ['helper']], ['Helper 5 (voorbeeld)', ['helper', 'tafel']],
  ];
  return list.map(([name, roles], i) => ({ id: uid('v'), name, roles, from: i === 5 ? '10:00' : '', to: i === 15 ? '11:30' : '', phone: '', notes: '' }));
}

export const SAMPLE_CSV = `Voornaam,Achternaam,Geboortedatum,Jongen/meisje,Kyu-graad,Gewicht,Wedstrijdervaring,Onderdelen
Pim,Voorbeeld,12-04-2018,jongen,10,22,0,kata en kumite
Lisa,Testman,03-09-2016,meisje,8,28,1,kata
Ravi,de Proef,21-01-2015,jongen,7,,2,kumite
Mara,Oefening,15-06-2017,meisje,,24,0,beide
Tom,van Demo,30-02-2016,jongen,9,27,0,kata
,Fictief,01-01-2014,meisje,6,35,3,kumite
`;
