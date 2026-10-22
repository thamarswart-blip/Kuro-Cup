// Kosten: raming van standaardposten, eenmalige uitgaven en wat het toernooi werkelijk kostte.
import { esc, uid } from '../util.js';
import { icon, note } from '../ui.js';
import { costSummary, euro } from '../costs.js';

const money = (v, attrs) => `<input class="input s num" inputmode="decimal" style="width:110px;text-align:right" value="${v == null || v === '' ? '' : Number(v).toFixed(2).replace('.', ',')}" ${attrs}>`;

export function render(c) {
  const ev = c.ev;
  const s = costSummary(ev);
  const groups = [...new Set(s.lines.map(l => l.group))];
  return `<main class="page">
    <div class="page-head"><div class="grow"><span class="eyebrow">Voorbereiden</span><h1>Kosten</h1>
      <p class="sub">Een schatting vooraf en wat het toernooi werkelijk heeft gekost. Aantallen komen uit het evenement; prijzen per stuk zijn schattingen die je zelf aanpast.</p></div>
      <div class="row"><a class="btn l" href="#${esc(c.evPath('documenten', 'kosten'))}">${icon.print}Kostenoverzicht printen</a></div></div>
    <div class="grid four">
      <div class="stat"><b>${euro(s.est)}</b><span>geschatte kosten</span></div>
      <div class="stat"><b>${s.filled ? euro(s.actual) : '–'}</b><span>werkelijk ingevuld (${s.filled} van ${s.count} posten)</span></div>
      <div class="stat" style="border-top:6px solid var(--ink)"><b>${euro(s.final)}</b><span>dit toernooi kost${s.filled < s.count ? ' (werkelijk waar ingevuld, anders schatting)' : ''}</span></div>
      <div class="stat"><b>${euro(s.estOneOff)}</b><span>waarvan eenmalige uitgaven</span></div>
    </div>
    <div class="card"><h3>Standaardposten</h3>
      <p class="muted">Deze posten horen bij elk toernooi. Wijzig het aantal alleen als het afwijkt (leeg = automatisch). Vul na afloop het werkelijke bedrag in.</p>
      <div class="table-wrap"><table class="t"><thead><tr><th>Post</th><th>Aantal</th><th>Prijs per stuk</th><th class="right">Schatting</th><th>Werkelijk</th><th>Notitie</th></tr></thead><tbody>
      ${groups.map(g => `<tr><td colspan="6" class="eyebrow" style="padding-top:18px">${esc(g)}</td></tr>` + s.lines.filter(l => l.group === g).map(l => `<tr>
        <td><strong>${esc(l.label)}</strong><div class="small muted">${esc(l.basis)}</div></td>
        <td><input class="input s num" inputmode="numeric" style="width:84px" value="${l.qtyOverridden ? l.qty : ''}" placeholder="${l.auto}" data-change="qty" data-k="${esc(l.key)}" aria-label="Aantal ${esc(l.label)}"></td>
        <td>${money(l.unit, `data-change="unit" data-k="${esc(l.key)}" aria-label="Prijs per stuk ${esc(l.label)}"`)}</td>
        <td class="right num">${euro(l.est)}</td>
        <td>${money(l.actual, `data-change="actual" data-k="${esc(l.key)}" placeholder="—" aria-label="Werkelijk bedrag ${esc(l.label)}"`)}</td>
        <td><input class="input s" value="${esc(l.note)}" data-change="note" data-k="${esc(l.key)}" aria-label="Notitie" style="min-width:140px"></td></tr>`).join('')).join('')}
      </tbody></table></div></div>
    <div class="card"><div class="card-head"><h3>Eenmalige kosten voor dit toernooi</h3><button class="btn" data-act="addOne">${icon.plus}Eenmalige uitgave toevoegen</button></div>
      <p class="muted">Bijvoorbeeld de eerste aanschaf van scheidsrechtersvlaggen, nieuwe ballen of een timerdisplay.</p>
      <div class="table-wrap"><table class="t"><thead><tr><th>Omschrijving</th><th>Geschat bedrag</th><th>Werkelijk</th><th>Notitie</th><th></th></tr></thead><tbody>
      ${(ev.costs.oneOff || []).map((o, i) => `<tr>
        <td><input class="input s" value="${esc(o.label)}" data-change="oneSet" data-i="${i}" data-k="label" placeholder="Bijv. scheidsrechtersvlaggen (6 sets)" style="min-width:240px"></td>
        <td>${money(o.est, `data-change="oneSet" data-i="${i}" data-k="est" data-num="1"`)}</td>
        <td>${money(o.actual, `data-change="oneSet" data-i="${i}" data-k="actual" data-num="1" placeholder="—"`)}</td>
        <td><input class="input s" value="${esc(o.note || '')}" data-change="oneSet" data-i="${i}" data-k="note"></td>
        <td class="right"><button class="btn s danger" data-act="delOne" data-i="${i}" aria-label="Verwijderen">${icon.close}</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nog geen eenmalige uitgaven.</td></tr>'}
      </tbody></table></div></div>
    <div class="card bar-ink"><h3>Totaal</h3>
      <table class="t"><tbody>
        <tr><td>Standaardposten (schatting)</td><td class="right num">${euro(s.estStandard)}</td></tr>
        <tr><td>Eenmalige uitgaven (schatting)</td><td class="right num">${euro(s.estOneOff)}</td></tr>
        <tr><td><strong>Geschat totaal</strong></td><td class="right num"><strong>${euro(s.est)}</strong></td></tr>
        <tr><td>Werkelijk ingevuld</td><td class="right num">${s.filled ? euro(s.actual) : '–'}</td></tr>
        <tr><td style="font-size:20px"><strong>Dit toernooi heeft gekost</strong></td><td class="right num" style="font-size:24px"><strong>${euro(s.final)}</strong></td></tr>
      </tbody></table>
      ${s.filled < s.count ? note('info', `${s.count - s.filled} post(en) hebben nog geen werkelijk bedrag; daar telt de schatting mee.`, 'Vul na het toernooi de bonnetjes in bij "Werkelijk" voor het definitieve totaal.') : note('ok', 'Alle werkelijke bedragen zijn ingevuld.')}
    </div>
  </main>`;
}

function num(v) {
  const t = String(v).trim().replace(/[€\s]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  if (t === '') return null;
  const n = parseFloat(t);
  return isNaN(n) ? undefined : n;
}

export const actions = {
  qty(c, el) { const n = num(el.value); if (n === undefined) return c.toast('Vul een getal in.', 'error'); c.mutate(ev => { if (n == null) delete ev.costs.qty[el.dataset.k]; else ev.costs.qty[el.dataset.k] = n; }); },
  unit(c, el) { const n = num(el.value); if (n === undefined) return c.toast('Vul een bedrag in, bijv. 3,50.', 'error'); c.mutate(ev => { ev.costs.unit[el.dataset.k] = n ?? 0; }); },
  actual(c, el) { const n = num(el.value); if (n === undefined) return c.toast('Vul een bedrag in, bijv. 42,50.', 'error'); c.mutate(ev => { if (n == null) delete ev.costs.actual[el.dataset.k]; else ev.costs.actual[el.dataset.k] = n; }); },
  note(c, el) { c.mutate(ev => { ev.costs.notes[el.dataset.k] = el.value.trim(); }); },
  addOne(c) { c.mutate(ev => { ev.costs.oneOff.push({ id: uid('k'), label: '', est: 0, actual: null, note: '' }); }); setTimeout(() => { const ins = document.querySelectorAll('[data-k="label"]'); ins[ins.length - 1]?.focus(); }, 30); },
  oneSet(c, el) {
    let v = el.value;
    if (el.dataset.num) { v = num(v); if (v === undefined) return c.toast('Vul een bedrag in, bijv. 24,95.', 'error'); if (v == null && el.dataset.k === 'est') v = 0; }
    c.mutate(ev => { ev.costs.oneOff[+el.dataset.i][el.dataset.k] = v; });
  },
  async delOne(c, el) {
    if (!await c.confirm({ title: 'Uitgave verwijderen?', text: 'Deze eenmalige uitgave wordt uit de kosten gehaald.', ok: 'Verwijderen', danger: true })) return;
    c.mutate(ev => ev.costs.oneOff.splice(+el.dataset.i, 1));
  },
};
