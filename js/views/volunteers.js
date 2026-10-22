// Vrijwilligers: invoer, beschikbaarheid, rooster per veld en tijdsblok.
import { esc, uid, byId, parseTime } from '../util.js';
import { icon, note } from '../ui.js';
import { ROLES, GENERAL_FIELD } from '../model.js';
import { autoAssign, coverage, isAvailable, missingRoles, wholeDay, partialAvailability, busyFor } from '../volunteers.js';

const ROLE_KEYS = ['scheidsrechter', 'tafel', 'helper', 'ehbo', 'ehboAssist'];
const SHORT = { scheidsrechter: 'Scheidsr.', tafel: 'Tafel', helper: 'Helper', ehbo: 'Hoofd EHBO', ehboAssist: 'Assist. EHBO' };

export function render(c) {
  const ev = c.ev;
  const fById = byId(ev.fields);
  const vById = byId(ev.volunteers);
  const cov = coverage(ev);
  const tab = c.ui.volTab || (ev.volunteers.length ? 'rooster' : 'lijst');
  const missing = missingRoles(ev);
  const day = wholeDay(ev);
  const partial = day ? ev.volunteers.map(v => ({ v, t: partialAvailability(ev, v) })).filter(x => x.t) : [];
  const missingBanner = missing.length
    ? `<div class="note error" role="alert">${icon.warn}<div class="txt"><div><strong>Nog niet genoeg vrijwilligers. Er missen:</strong> ${missing.map(m => `${m.n} × ${esc(ROLES[m.role].label.replace(/^./, ch => ch.toLowerCase()))}`).join(', ')}.</div><div class="fix">Voeg vrijwilligers toe met deze rol, of vink bij bestaande vrijwilligers een extra rol aan.</div></div></div>`
    : ev.volunteers.length ? note('ok', 'Alle functies zijn bezet.') : note('warn', 'Er zijn nog geen vrijwilligers ingevoerd.', 'Voeg vrijwilligers toe; per actief veld zijn 3 scheidsrechters, 2 tafelmedewerkers en 2 helpers nodig, plus 1 hoofd EHBO en 1 assistent EHBO voor de hele zaal.');

  const listHtml = `<div class="card"><div class="card-head"><h3>Vrijwilligers (${ev.volunteers.length})</h3><button class="btn" data-act="add">${icon.plus}Vrijwilliger toevoegen</button></div>
    <p class="muted">Vink aan welke rollen iemand kan doen; de eerste rol is de voorkeur. Voor de hele zaal zijn er 1 hoofd EHBO en 1 assistent EHBO. De assistent EHBO kan daarnaast helper bij een tafel zijn: vink dan ook "Helper" aan. Vrijwilligers zijn standaard de hele dag (${esc(ev.info.startTime)} tot het einde) ingepland. Vul alleen bij uitzondering een afwijkende begin- of eindtijd in.</p>
    <div class="table-wrap"><table class="t"><thead><tr><th>Naam</th>${ROLE_KEYS.map(r => `<th>${SHORT[r]}</th>`).join('')}<th>Afwijkend vanaf</th><th>Afwijkend tot</th><th>Ingepland</th><th></th></tr></thead><tbody>
    ${ev.volunteers.map((v, i) => `<tr>
      <td><input class="input s" value="${esc(v.name)}" data-change="setV" data-i="${i}" data-k="name" aria-label="Naam"></td>
      ${ROLE_KEYS.map(r => `<td><label class="check"><input type="checkbox" ${v.roles.includes(r) ? 'checked' : ''} data-change="role" data-i="${i}" data-r="${r}"><span class="sr-only">${ROLES[r].label}</span></label></td>`).join('')}
      <td><input class="input s" type="time" value="${esc(v.from || '')}" data-change="setV" data-i="${i}" data-k="from" style="width:120px" aria-label="Beschikbaar vanaf"></td>
      <td><input class="input s" type="time" value="${esc(v.to || '')}" data-change="setV" data-i="${i}" data-k="to" style="width:120px" aria-label="Beschikbaar tot"></td>
      <td class="num">${day ? (ev.assignments.filter(a => a.volunteerId === v.id).map(a => `${esc(a.fieldId === GENERAL_FIELD ? 'Hele zaal' : fById[a.fieldId]?.name || '')} · ${ROLES[a.role].label.replace(/^./, ch => ch.toLowerCase())}`).join('<br>') || '–') : `${ev.assignments.filter(a => a.volunteerId === v.id).length} blok(ken)`}</td>
      <td class="right"><button class="btn s danger" data-act="del" data-i="${i}" aria-label="Verwijderen">${icon.close}</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">Nog geen vrijwilligers.</td></tr>'}
    </tbody></table></div></div>`;

  const totals = `<div class="table-wrap"><table class="t"><thead><tr><th>Rol</th><th>Per actief veld</th><th>Nodig tegelijk (piek ${cov.peakFields} velden)</th><th>Beschikbaar</th><th></th></tr></thead><tbody>
    ${cov.totals.map(t => `<tr><td>${ROLES[t.role].label}</td><td class="num">${t.perEvent ? `${t.perField} (hele zaal)` : t.perField}${t.role === 'reserve' ? ' (optioneel)' : ''}</td><td class="num">${t.needed}</td><td class="num">${t.available}</td>
      <td>${t.available < t.needed ? `<span class="badge ${t.role === 'reserve' ? 'warn' : 'error'}">${t.needed - t.available} te weinig</span>` : !day && t.available < t.needed * 1.5 ? '<span class="badge warn">weinig ruimte voor pauzes</span>' : '<span class="badge ok">genoeg</span>'}</td></tr>`).join('')}
    </tbody></table></div>`;

  const slot = (s, fid, role, k) => {
    const a = ev.assignments.filter(a => a.shiftIndex === s.index && a.fieldId === fid && a.role === role)[k];
    const busy = busyFor(ev, s.index, role, a);
    const opts = ev.volunteers.filter(v => (v.roles.includes(role) || (role === 'reserve' && v.roles.includes('scheidsrechter'))));
    return `<select class="select s" data-change="assign" data-s="${s.index}" data-f="${esc(fid)}" data-r="${role}" data-aid="${esc(a?.id || '')}" style="${a ? '' : 'border-color:var(--warn-line);background:var(--warn-bg)'}" aria-label="${ROLES[role].label}">
      <option value="">${role === 'reserve' ? '— optioneel —' : '— open —'}</option>
      ${opts.map(v => `<option value="${esc(v.id)}" ${a?.volunteerId === v.id ? 'selected' : ''} ${busy.has(v.id) || !isAvailable(v, s) ? 'disabled' : ''}>${esc(v.name)}${busy.has(v.id) ? ' (elders)' : !isAvailable(v, s) ? ' (niet beschikbaar)' : ''}</option>`).join('')}</select>`;
  };

  const rooster = cov.shifts.map(s => {
    if (!s.activeFields.length) return `<div class="card"><h3>${s.label}</h3><p class="muted">Geen wedstrijden in dit blok.</p></div>`;
    const resting = ev.volunteers.filter(v => !ev.assignments.some(a => a.volunteerId === v.id && a.shiftIndex === s.index) && isAvailable(v, s));
    return `<div class="card"><div class="card-head"><h3>${s.label}</h3>${cov.gaps.filter(g => g.shift.index === s.index && !g.optional).length ? '<span class="badge error">onderbezet</span>' : '<span class="badge ok">bezet</span>'}</div>
      <div class="stack" style="gap:8px;padding:12px 14px;background:var(--surface-soft)"><h4>Hele zaal — EHBO</h4>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px">${Object.keys(cov.eventNeeds).map(role => `<div class="stack" style="gap:6px"><span class="small muted">${ROLES[role].label}${ROLES[role].canAlso ? ' (mag ook helper zijn)' : ''}</span>${slot(s, GENERAL_FIELD, role, 0)}</div>`).join('')}</div></div>
      <div class="grid two">${s.activeFields.map(fid => `<div class="stack" style="gap:8px"><h4>${esc(fById[fid]?.name)}</h4>
        ${Object.entries(cov.needs).map(([role, n]) => `<div class="stack" style="gap:6px"><span class="small muted">${ROLES[role].label} (${n})</span><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px">${Array.from({ length: n }, (_, k) => slot(s, fid, role, k)).join('')}</div></div>`).join('')}
      </div>`).join('')}</div>
      ${resting.length ? `<p class="small muted">Pauze / vrij: ${resting.map(v => esc(v.name)).join(', ')}</p>` : ''}</div>`;
  }).join('');

  return `<main class="page">
    <div class="page-head"><div class="grow"><span class="eyebrow">Voorbereiden</span><h1>Vrijwilligers</h1>
      <p class="sub">Standaard per actief veld: ${ev.settings.referees} scheidsrechters, 2 tafelmedewerkers, ${ev.settings.useReserveReferee ? '1 reserve-scheidsrechter, ' : ''}2 helpers. Voor de hele zaal: 1 hoofd EHBO en 1 assistent EHBO. ${day ? 'Iedereen staat de hele dag op één veld (van begin tot eind).' : `Blokken van ${ev.settings.shiftMinutes} minuten, na ${ev.settings.maxConsecutiveShifts} blokken een pauze.`}</p></div>
      <div class="row"><button class="btn primary l" data-act="auto">Rooster automatisch vullen</button></div></div>
    ${missingBanner}
    ${partial.length ? note('warn', 'Afwijkende tijden: ' + partial.map(x => `${x.v.name} (${x.t})`).join(', ') + '.', 'Regel voor deze vrijwilligers een vervanger voor de rest van de dag.') : ''}
    <div class="seg"><button class="${tab === 'rooster' ? 'on' : ''}" data-act="tab" data-t="rooster">Rooster</button><button class="${tab === 'lijst' ? 'on' : ''}" data-act="tab" data-t="lijst">Vrijwilligers (${ev.volunteers.length})</button></div>
    ${!ev.matches.some(m => m.start != null) ? note('warn', 'Er is nog geen wedstrijdplanning.', 'Het rooster gebruikt de planning om te zien welke velden wanneer actief zijn. Maak eerst de planning.') : ''}
    ${tab === 'lijst' ? listHtml : `
      <div class="card"><h3>Benodigd en beschikbaar</h3>${totals}
        ${cov.gaps.filter(g => !g.optional).length ? note('warn', `${cov.gaps.filter(g => !g.optional).length} open plek(ken) in het rooster.`, 'Voeg vrijwilligers toe, verruim beschikbaarheid, of verhoog "max. blokken achter elkaar" bij Wedstrijdregels.') : ev.assignments.length ? note('ok', 'Alle verplichte plekken zijn bezet.') : ''}
        ${cov.doubles.length ? note('error', `${cov.doubles.length} dubbele boeking(en): iemand staat in hetzelfde blok op twee plekken.`, 'Pas de toewijzing aan.') : ''}
      </div>${rooster}`}
  </main>`;
}

export const actions = {
  tab(c, el) { c.ui.volTab = el.dataset.t; c.render(); },
  add(c) { c.ui.volTab = 'lijst'; c.mutate(ev => ev.volunteers.push({ id: uid('v'), name: '', roles: ['scheidsrechter'], from: '', to: '', notes: '' })); setTimeout(() => { const ins = document.querySelectorAll('[data-k="name"]'); ins[ins.length - 1]?.focus(); }, 30); },
  setV(c, el) {
    if ((el.dataset.k === 'from' || el.dataset.k === 'to') && el.value && parseTime(el.value) == null) { c.toast('Gebruik een tijd als 10:00.', 'error'); return; }
    c.mutate(ev => { ev.volunteers[+el.dataset.i][el.dataset.k] = el.value.trim(); });
  },
  role(c, el) { c.mutate(ev => { const v = ev.volunteers[+el.dataset.i]; v.roles = el.checked ? [...new Set([...v.roles, el.dataset.r])] : v.roles.filter(r => r !== el.dataset.r); }); },
  async del(c, el) {
    const v = c.ev.volunteers[+el.dataset.i];
    if (!await c.confirm({ title: 'Vrijwilliger verwijderen?', text: `${v.name || 'Deze vrijwilliger'} wordt ook uit het rooster gehaald.`, ok: 'Verwijderen', danger: true })) return;
    c.mutate(ev => { ev.volunteers.splice(+el.dataset.i, 1); ev.assignments = ev.assignments.filter(a => a.volunteerId !== v.id); });
  },
  async auto(c) {
    const manual = c.ev.assignments.filter(a => a.manual).length;
    let keep = true;
    if (manual) keep = await c.confirm({ title: 'Handmatige keuzes behouden?', text: `Er zijn ${manual} handmatige toewijzingen. Wil je die behouden en alleen de rest automatisch vullen?`, ok: 'Behouden', cancel: 'Alles opnieuw' });
    const cov = c.mutate(ev => autoAssign(ev, { keepManual: keep }), { reason: 'rooster gevuld', snapshot: true });
    c.ui.volTab = 'rooster';
    const g = cov.gaps.filter(x => !x.optional).length;
    c.toast(g ? `Rooster gevuld; ${g} plek(ken) blijven open.` : 'Rooster gevuld; alle verplichte plekken zijn bezet.');
    c.render();
  },
  assign(c, el) {
    c.mutate(ev => {
      const { s, f, r, aid } = el.dataset;
      if (aid) ev.assignments = ev.assignments.filter(a => a.id !== aid);
      if (el.value) ev.assignments.push({ id: uid('a'), volunteerId: el.value, fieldId: f, shiftIndex: +s, role: r, manual: true });
    });
  },
};
