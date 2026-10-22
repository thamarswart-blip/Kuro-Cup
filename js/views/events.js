// Startscherm: alle evenementen op dit apparaat.
import { esc, fmtDate, fmtDateTime, uid, deepClone, nowIso } from '../util.js';
import { icon, emptyState } from '../ui.js';
import { newEvent } from '../model.js';
import { sampleParticipants, sampleVolunteers } from '../sample.js';
import { regenerate } from '../pools.js';
import { buildSchedule } from '../schedule.js';
import { autoAssign } from '../volunteers.js';
import { readExport } from '../merge.js';

export function render(c) {
  const { state } = c;
  const showArchived = c.ui.showArchived;
  const list = state.events.filter(e => !!e.archived === !!showArchived);
  const archivedCount = state.events.filter(e => e.archived).length;
  const tiles = list.map(e => {
    const pools = e.pools.length, parts = e.participants.length, done = e.results.length;
    return `<div class="tile" data-act="open" data-id="${esc(e.id)}" role="button" tabindex="0">
      <div class="row" style="justify-content:space-between"><span class="eyebrow">${esc(fmtDate(e.info.date, true))}</span>${e.isSample ? '<span class="badge sample">Voorbeeld</span>' : ''}${e.archived ? '<span class="badge">Gearchiveerd</span>' : ''}</div>
      <h3>${esc(e.info.name)}</h3>
      <div class="muted">${esc(e.info.location || 'Locatie nog niet ingevuld')}</div>
      <div class="row small muted"><span>${parts} deelnemers</span><span>·</span><span>${pools} poules</span><span>·</span><span>${done} uitslagen</span></div>
      <div class="row" style="margin-top:6px">
        <button class="btn s dark" data-act="open" data-id="${esc(e.id)}">Openen</button>
        <button class="btn s" data-act="duplicate" data-id="${esc(e.id)}" title="Gebruik als startpunt voor een nieuw jaar">Dupliceren</button>
        <button class="btn s" data-act="archive" data-id="${esc(e.id)}">${e.archived ? 'Terugzetten' : 'Archiveren'}</button>
        ${e.archived ? `<button class="btn s danger" data-act="delete" data-id="${esc(e.id)}">Verwijderen</button>` : ''}
      </div>
      <div class="small muted">Laatst gewijzigd ${esc(fmtDateTime(e.updatedAt))}</div>
    </div>`;
  }).join('');

  return `<main class="page">
    <div class="page-head"><div class="grow"><span class="eyebrow">Kuro Cup Planner</span><h1>${showArchived ? 'Gearchiveerde evenementen' : 'Evenementen'}</h1>
      <p class="sub">Maak per toernooi een evenement aan. Alles wordt op dit apparaat bewaard en werkt zonder internet.</p></div>
      <div class="row"><button class="btn primary l" data-act="new">${icon.plus}Nieuw evenement</button></div></div>
    ${list.length ? `<div class="grid three">${tiles}</div>` : emptyState(showArchived ? 'Geen gearchiveerde evenementen' : 'Nog geen evenementen', showArchived ? 'Gearchiveerde evenementen verschijnen hier.' : 'Begin met een nieuw evenement, of bekijk eerst het voorbeeld om te zien hoe de planner werkt.',
      showArchived ? '' : `<button class="btn primary l" data-act="new">${icon.plus}Nieuw evenement</button><button class="btn l" data-act="sample">Voorbeeld bekijken</button>`)}
    <div class="grid two">
      <div class="card"><h3>Evenement van een ander apparaat openen</h3><p class="muted">Kies een JSON-bestand dat met "Exporteren" is gemaakt. Bestaat het evenement al, ga dan naar het evenement en kies "Gegevens delen & back-up" om veilig samen te voegen.</p>
        <label class="btn" style="align-self:flex-start">${icon.upload}JSON-bestand kiezen<input type="file" accept=".json,application/json" data-change="importFile" hidden></label></div>
      <div class="card"><h3>Meer</h3><div class="row">
        <button class="btn" data-act="sample">Voorbeeldevenement maken</button>
        <button class="btn" data-act="toggleArchived">${showArchived ? 'Actieve evenementen' : `Archief (${archivedCount})`}</button></div>
        <p class="small muted">Apparaatnaam: <strong>${esc(c.state.device.name || 'nog niet ingesteld')}</strong> — <button class="btn ghost s" data-act="deviceName">wijzigen</button><br>De naam staat in exportbestanden zodat je ziet van welke tablet gegevens komen.</p></div>
    </div>
  </main>`;
}

export const actions = {
  open: (c, el) => c.go(`/e/${el.dataset.id}/overzicht`),
  async new(c) {
    const name = await c.confirm({ title: 'Nieuw evenement', text: 'Geef het evenement een naam. Alle andere gegevens vul je daarna in.', ok: 'Aanmaken', input: { label: 'Naam', value: `Kuro Cup ${new Date().getFullYear() + (new Date().getMonth() > 8 ? 1 : 0)}` } });
    if (!name) return;
    const ev = newEvent(c.state.device.id);
    ev.info.name = name;
    await c.createEvent(ev);
  },
  async sample(c) {
    const ev = newEvent(c.state.device.id);
    const d = new Date(); d.setDate(d.getDate() + 30);
    ev.isSample = true;
    ev.info = { ...ev.info, name: 'Kuro Cup — VOORBEELD', date: d.toISOString().slice(0, 10), location: 'Sporthal Voorbeeldstad (fictief)', endTime: '15:00', notes: 'Dit is een voorbeeld met verzonnen deelnemers.' };
    ev.participants = sampleParticipants(ev.info.date);
    ev.volunteers = sampleVolunteers();
    regenerate(ev, 'kata'); // kata en kumite gelijk ingedeeld
    buildSchedule(ev);
    autoAssign(ev);
    await c.createEvent(ev);
  },
  async duplicate(c, el) {
    const src = c.state.events.find(e => e.id === el.dataset.id);
    const name = await c.confirm({ title: 'Evenement dupliceren', text: 'Er wordt een nieuw evenement gemaakt met dezelfde instellingen, velden, programma, vrijwilligers en benodigdheden. Deelnemers, poules en uitslagen worden niet meegenomen.', ok: 'Dupliceren', input: { label: 'Naam nieuw evenement', value: src.info.name.replace(/\d{4}/, y => String(+y + 1)) } });
    if (!name) return;
    const ev = newEvent(c.state.device.id);
    Object.assign(ev, {
      info: { ...deepClone(src.info), name, date: '' },
      settings: deepClone(src.settings),
      fields: src.fields.map(f => ({ ...f, id: uid('f') })),
      program: src.program.map(p => ({ ...p, id: uid('p') })),
      volunteers: src.volunteers.map(v => ({ ...v, id: uid('v') })),
      supplies: src.supplies.map(s => ({ ...s, id: uid('s') })),
      isSample: false,
    });
    await c.createEvent(ev);
  },
  async archive(c, el) {
    const ev = await c.store.getEvent(el.dataset.id);
    ev.archived = !ev.archived;
    await c.store.saveEvent(ev, { reason: ev.archived ? 'gearchiveerd' : 'teruggezet' });
    c.state.events = await c.store.listEvents();
    c.render();
  },
  async delete(c, el) {
    const ev = c.state.events.find(e => e.id === el.dataset.id);
    const ok = await c.confirm({ title: 'Evenement verwijderen?', text: `"${ev.info.name}" en alle versies worden van dit apparaat verwijderd. Dit kan niet ongedaan worden gemaakt. Exporteer eerst als je een back-up wilt bewaren.`, ok: 'Definitief verwijderen', danger: true });
    if (!ok) return;
    await c.store.deleteEvent(ev.id);
    c.state.events = await c.store.listEvents();
    c.render();
  },
  toggleArchived(c) { c.ui.showArchived = !c.ui.showArchived; c.render(); },
  async deviceName(c) {
    const name = await c.confirm({ title: 'Naam van dit apparaat', text: 'Bijvoorbeeld "Tablet veld 1" of "Laptop organisatie".', ok: 'Opslaan', input: { label: 'Apparaatnaam', value: c.state.device.name } });
    if (name === false) return;
    await c.setDeviceName(name.trim());
    c.render();
  },
  async importFile(c, el) {
    const file = el.files[0]; if (!file) return;
    try {
      const data = readExport(await file.text());
      const exists = await c.store.getEvent(data.event.id);
      if (exists) {
        c.toast('Dit evenement staat al op dit apparaat. Je gaat nu naar "Gegevens delen" om samen te voegen.');
        c.go(`/e/${data.event.id}/gegevens`);
        return;
      }
      data.event.log = [...(data.event.log || []), { at: nowIso(), text: `Geïmporteerd van ${data.device?.name || 'ander apparaat'}` }];
      await c.store.saveEvent(data.event, { reason: 'geïmporteerd', forceSnapshot: true });
      c.toast('Evenement geïmporteerd.');
      c.go(`/e/${data.event.id}/overzicht`);
    } catch (err) { c.toast(err.message, 'error'); }
    el.value = '';
  },
};
