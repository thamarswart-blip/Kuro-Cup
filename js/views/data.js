// Gegevens delen & back-up: JSON-export, samenvoegen van tablets, versies terugzetten.
import { esc, fmtDateTime, downloadFile, byId } from '../util.js';
import { icon, note } from '../ui.js';
import { buildExport, exportFileName, readExport, analyze, applyMerge, unresolved, describeResult } from '../merge.js';
import { displayName } from '../model.js';
import { syncConfig, isConfigured, newEventCode, push, pull, lastPush, testConnection, incomingFromRow } from '../sync.js';

const TYPE_LABEL = { nieuw: 'Nieuw', dubbel: 'Dubbel', conflict: 'Conflict', bijgewerkt: 'Nieuwere versie', ouder: 'Oudere versie', historie: 'Zelfde uitslag' };

function short(coll, x, ev) {
  if (!x) return '–';
  if (coll === 'results') return describeResult(x, ev);
  if (coll === 'participants') return `${displayName(x)} · ${x.birthDate || '?'} · ${x.sex === 'M' ? 'jongen' : 'meisje'} · kyu ${x.kyu ?? '–'}`;
  if (coll === 'pools') return `${x.name} · ${x.participantIds.length} deelnemers`;
  if (coll === 'matches') return `veld ${x.fieldId || '–'} · start ${x.start != null ? Math.floor(x.start / 3600) + ':' + String(Math.floor(x.start % 3600 / 60)).padStart(2, '0') : '–'}`;
  if (coll === 'info') return `${x.name} · ${x.date} · ${x.location} · ${x.startTime}–${x.endTime}`;
  if (coll === 'settings') return 'Instellingen (poules, tijden, scheidsrechters, prijzen)';
  if (coll === 'costs') return `Kosten: ${Object.keys(x.actual || {}).length} werkelijke bedragen, ${(x.oneOff || []).length} eenmalige uitgaven`;
  if (coll === 'volunteers') return `${x.name} · ${(x.roles || []).join(', ')}`;
  return x.name || x.title || x.id;
}

function mergeView(c) {
  const mg = c.ui.merge;
  const ev = c.ev;
  const a = mg.analysis;
  const sums = Object.entries(a.summary).filter(([k, s]) => (s.nieuw || s.dubbel || s.conflict || s.bijgewerkt || s.ouder) && (!mg.data.fromCloud || ['results', 'decisions', 'matches'].includes(k)) && !(mg.data.fromCloud && k === 'matches' && !s.nieuw && !s.conflict)).map(([, s]) => s);
  const visible = a.items.filter(i => !i.silent);
  const conflicts = visible.filter(i => i.type === 'conflict');
  const updates = visible.filter(i => i.type === 'bijgewerkt' || i.type === 'ouder');
  const news = visible.filter(i => i.type === 'nieuw');
  const open = unresolved(a);
  const mergedEv = { ...ev, participants: [...ev.participants, ...mg.data.event.participants] };
  return `<div class="card bar-blue"><div class="card-head"><h2>Samenvoegen: ${esc(mg.fileName)}</h2><button class="btn" data-act="cancelMerge">Annuleren</button></div>
    <p class="muted">${mg.data.fromCloud ? 'Uit de cloud: uitslagen' : 'Export'} van <strong>${esc(mg.data.device?.name || 'onbekend apparaat')}</strong>, ${mg.data.fromCloud ? 'verstuurd' : 'gemaakt'} op ${esc(fmtDateTime(mg.data.exportedAt))}.${c.ui.mergeQueue?.length ? ` Hierna nog ${c.ui.mergeQueue.length} ${mg.data.fromCloud ? 'apparaat/apparaten' : 'bestand(en)'}.` : ''}</p>
    <div class="table-wrap"><table class="t"><thead><tr><th>Onderdeel</th><th class="right">Nieuw</th><th class="right">Dubbel (al aanwezig)</th><th class="right">Nieuwere versie</th><th class="right">Oudere versie</th><th class="right">Conflict</th></tr></thead><tbody>
      ${sums.map(s => `<tr><td>${esc(s.label)}</td><td class="right num">${s.nieuw}</td><td class="right num">${s.dubbel}</td><td class="right num">${s.bijgewerkt}</td><td class="right num">${s.ouder}</td><td class="right num">${s.conflict ? `<span class="badge error">${s.conflict}</span>` : 0}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Geen verschillen: alles staat al op dit apparaat.</td></tr>'}
    </tbody></table></div>
    ${note('info', 'Er wordt niets stilzwijgend overschreven.', 'Dubbele gegevens worden overgeslagen. Bij een conflict kies jij welke versie blijft. De niet gekozen uitslag blijft bewaard in de wijzigingshistorie.')}
    </div>
    ${conflicts.length ? `<div class="card"><h3>Conflicten (${conflicts.length}) — kies per regel</h3>
      ${conflicts.map(it => { const idx = a.items.indexOf(it); return `<div class="stack" style="gap:8px;padding:12px;background:${it.choice ? 'var(--surface-soft)' : 'var(--warn-bg)'}">
        <div><span class="badge error">${esc(TYPE_LABEL[it.type])}</span> <strong>${esc(it.coll === 'results' || it.coll === 'matches' ? it.name : `${a.summary[it.coll]?.label || ''}: ${it.name}`)}</strong></div>
        <div class="grid two" style="gap:8px">
          <label class="check" style="align-items:flex-start;padding:10px;border:1.5px solid ${it.choice === 'local' ? 'var(--ink)' : 'var(--line)'};background:#fff"><input type="radio" name="c${idx}" ${it.choice === 'local' ? 'checked' : ''} data-change="choose" data-i="${idx}" value="local"><span><strong>Dit apparaat</strong><br><span class="small">${esc(short(it.coll, it.local, mergedEv))}</span></span></label>
          <label class="check" style="align-items:flex-start;padding:10px;border:1.5px solid ${it.choice === 'incoming' ? 'var(--ink)' : 'var(--line)'};background:#fff"><input type="radio" name="c${idx}" ${it.choice === 'incoming' ? 'checked' : ''} data-change="choose" data-i="${idx}" value="incoming"><span><strong>Geïmporteerd bestand</strong><br><span class="small">${esc(short(it.coll, it.incoming, mergedEv))}</span></span></label>
        </div></div>`; }).join('')}
      <div class="row"><button class="btn s" data-act="chooseAll" data-v="local">Overal "dit apparaat" kiezen</button><button class="btn s" data-act="chooseAll" data-v="incoming">Overal "geïmporteerd" kiezen</button></div></div>` : ''}
    ${updates.length ? `<div class="card"><h3>Andere versies van dezelfde uitslag (${updates.length})</h3><p class="muted">Deze uitslagen zijn op een apparaat gecorrigeerd. Standaard blijft de nieuwste versie staan; je kunt dat aanpassen.</p>
      ${updates.map(it => { const idx = a.items.indexOf(it); return `<div class="row" style="padding:10px;background:var(--surface-soft)"><span class="badge ${it.type === 'bijgewerkt' ? 'blue' : ''}">${esc(TYPE_LABEL[it.type])}</span><span style="flex:1;min-width:240px">${esc(it.name)}<br><span class="small muted">Hier: ${esc(short('results', it.local, mergedEv))}<br>Import: ${esc(short('results', it.incoming, mergedEv))}</span></span>
        <select class="select s" data-change="chooseSel" data-i="${idx}" style="max-width:240px"><option value="local" ${it.choice === 'local' ? 'selected' : ''}>Houd dit apparaat</option><option value="incoming" ${it.choice === 'incoming' ? 'selected' : ''}>Neem geïmporteerde versie</option></select></div>`; }).join('')}</div>` : ''}
    ${news.length ? `<div class="card"><h3>Nieuw (${news.length})</h3><p class="muted">Deze gegevens staan nog niet op dit apparaat en worden toegevoegd.</p><div class="small">${news.slice(0, 40).map(it => `<div>• ${esc(a.summary[it.coll]?.label || '')}: ${esc(it.name || '')}</div>`).join('')}${news.length > 40 ? `<div class="muted">… en ${news.length - 40} meer</div>` : ''}</div></div>` : ''}
    <div class="card"><div class="row end">${open ? `<span class="badge warn">Nog ${open} conflict(en) kiezen</span>` : ''}<button class="btn" data-act="cancelMerge">Annuleren</button><button class="btn dark l" data-act="applyMerge" ${open ? 'disabled' : ''}>Samenvoegen</button></div></div>`;
}


function syncCard(c) {
  const ev = c.ev;
  const cfg = syncConfig(ev);
  const ok = isConfigured(ev);
  const lp = c.ui.lastPush;
  const editing = c.ui.syncEdit || !ok;
  const form = `<div class="form-grid">
      <label class="field"><span>Project-URL <span class="hint">(Supabase → Project Settings → API)</span></span><input class="input" id="sync-url" value="${esc(cfg.url)}" placeholder="https://xxxx.supabase.co" autocomplete="off" autocapitalize="off"></label>
      <label class="field"><span>Publishable key <span class="hint">(of "anon public" key)</span></span><input class="input" id="sync-key" value="${esc(cfg.key)}" placeholder="sb_publishable_…" autocomplete="off" autocapitalize="off"></label>
      <label class="field"><span>Evenementcode <span class="hint">(geheim, min. 8 tekens)</span></span><input class="input" id="sync-code" value="${esc(cfg.code)}" placeholder="KURO-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters"></label>
    </div>
    <div class="row"><button class="btn" data-act="newCode">Nieuwe code maken</button><button class="btn dark" data-act="saveSync">Opslaan en verbinding testen</button>${ok ? '<button class="btn" data-act="cancelSyncEdit">Annuleren</button>' : ''}</div>
    <p class="small muted">Deze instellingen gaan mee in de JSON-export. Importeer je dat bestand op een tablet, dan is synchroniseren daar meteen ingesteld.</p>`;
  return `<div class="card bar-blue"><div class="card-head"><h3>Synchroniseren via de cloud</h3>${ok ? '<span class="badge ok">Ingesteld</span>' : '<span class="badge">Nog niet ingesteld</span>'}</div>
    <p class="muted">De uitslagen blijven altijd eerst op dit apparaat staan. <strong>Versturen</strong> zet een kopie in de cloud (alleen uitslagen, geen deelnemersgegevens). <strong>Ophalen</strong> haalt de uitslagen van de andere tablets op en voegt ze veilig samen: nieuw wordt toegevoegd, dubbel overgeslagen, bij een conflict kies jij. Werkt met wifi of een telefoon-hotspot; zonder internet gaat er niets verloren.</p>
    ${editing ? form : `<div class="row small muted">Cloud: ${esc(cfg.url.replace(/^https?:\/\//, ''))} · code ${esc(cfg.code.slice(0, 9))}… <button class="btn ghost s" data-act="editSync">Wijzigen</button></div>
      <div class="row"><button class="btn primary l" data-act="syncPush">${icon.upload}Uitslagen versturen</button><button class="btn dark l" data-act="syncPull">${icon.download}Uitslagen ophalen en samenvoegen</button></div>
      <p class="small muted">${lp ? `Laatst verstuurd: ${esc(fmtDateTime(lp.at))} (${lp.count} uitslagen)${lp.rev < ev.rev ? ' — er zijn sindsdien wijzigingen' : ' — alles verstuurd'}.` : 'Nog niet verstuurd vanaf dit apparaat.'}</p>`}
  </div>`;
}

export function render(c) {
  const ev = c.ev;
  if (c.ui.merge) return `<main class="page"><div class="page-head"><div class="grow"><span class="eyebrow">Gegevens</span><h1>Gegevens samenvoegen</h1></div></div>${mergeView(c)}</main>`;
  const info = c.state.exportInfo;
  const fresh = info && info.rev >= ev.rev;
  const versions = c.ui.versions;
  return `<main class="page">
    <div class="page-head"><div class="grow"><span class="eyebrow">Gegevens</span><h1>Gegevens delen & back-up</h1>
      <p class="sub">Alles staat lokaal op dit apparaat (ook zonder internet). Exporteer regelmatig als back-up en om tablets samen te voegen.</p></div></div>
    ${fresh ? note('ok', `Laatst geëxporteerd op ${fmtDateTime(info.at)}. Er zijn sindsdien geen wijzigingen.`) : note('warn', info ? `Er zijn wijzigingen sinds de laatste export (${fmtDateTime(info.at)}).` : 'Deze gegevens staan alleen op dit apparaat en zijn nog nooit geëxporteerd.', 'Exporteer nu een JSON-bestand als back-up of om te delen.')}
    ${syncCard(c)}
    <div class="grid two">
      <div class="card"><h3>1 · Exporteren</h3><p class="muted">Maakt één JSON-bestand met alle evenementgegevens, poules, wedstrijden, uitslagen en wijzigingshistorie. Het bestand bevat een versienummer zodat het later veilig kan worden samengevoegd.</p>
        <label class="field"><span>Naam van dit apparaat <span class="hint">(komt in de bestandsnaam)</span></span><input class="input" value="${esc(c.state.device.name)}" placeholder="Bijv. Tablet veld 1" data-change="deviceName"></label>
        <button class="btn primary l" data-act="export">${icon.download}JSON exporteren</button>
        <p class="small muted">Op een iPad: kies "Bewaar in Bestanden" of deel via AirDrop/e-mail. Op Android: het bestand staat in Downloads.</p></div>
      <div class="card"><h3>2 · Importeren en samenvoegen</h3><p class="muted">Kies één of meer exportbestanden van andere tablets. Je ziet eerst een samenvatting van nieuwe gegevens, dubbelingen en conflicten. Daarna kies je wat blijft.</p>
        <label class="btn dark l" style="align-self:flex-start">${icon.upload}JSON-bestand(en) kiezen<input type="file" accept=".json,application/json" multiple data-change="importFiles" hidden></label>
        <p class="small muted">3 · Na samenvoegen: exporteer opnieuw en importeer dat bestand op de andere tablets, zodat iedereen hetzelfde totaaloverzicht heeft.</p></div>
    </div>
    <div class="card"><div class="card-head"><h3>Versies op dit apparaat</h3><button class="btn s" data-act="loadVersions">${versions ? 'Vernieuwen' : 'Versies tonen'}</button></div>
      <p class="muted">Automatische momentopnames (hooguit elke 5 minuten en bij belangrijke stappen). Terugzetten maakt eerst zelf een momentopname, dus je kunt altijd terug.</p>
      ${versions ? `<div class="table-wrap"><table class="t"><thead><tr><th>Moment</th><th>Aanleiding</th><th>Versie</th><th>Inhoud</th><th></th></tr></thead><tbody>
        ${versions.map(v => `<tr><td>${esc(fmtDateTime(v.at))}</td><td>${esc(v.reason)}</td><td class="num">${v.rev}</td><td class="small">${v.data.participants.length} deelnemers · ${v.data.pools.length} poules · ${v.data.results.length} uitslagen</td>
          <td class="right"><button class="btn s" data-act="restore" data-vid="${esc(v.vid)}">Terugzetten</button> <button class="btn s" data-act="exportVersion" data-vid="${esc(v.vid)}">${icon.download}</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nog geen versies.</td></tr>'}
      </tbody></table></div>` : ''}</div>
    <div class="card"><h3>Na afloop: dit evenement van dit apparaat wissen</h3>
      <p class="muted">Voor een geleende iPad van een vrijwilliger. Wis pas als alle uitslagen veilig bij de organisatie zijn: verstuurd via de cloud én opgehaald op de iPad van de organisatie, of geëxporteerd en daar geïmporteerd.</p>
      ${(c.ui.lastPush && c.ui.lastPush.rev >= ev.rev) || fresh ? note('ok', 'Alle wijzigingen op dit apparaat zijn verstuurd of geëxporteerd.') : note('warn', 'Er zijn wijzigingen die nog niet verstuurd of geëxporteerd zijn.', 'Verstuur of exporteer eerst. Wissen kan dan pas veilig.')}
      <div class="row"><button class="btn danger" data-act="wipeEvent">Dit evenement van dit apparaat wissen</button></div>
      <p class="small muted">Daarna op de iPad: houd het app-icoon ingedrukt → App verwijderen. Optioneel: Instellingen → Safari → Geavanceerd → Websitegegevens → dit adres verwijderen.</p></div>
    <div class="card"><h3>Opslag op dit apparaat</h3><p class="muted" id="storage-info">Bezig met controleren…</p>
      <p class="small muted">Tip: zet de app op het beginscherm ("Zet op beginscherm" in Safari / "App installeren" in Chrome). Browsers wissen gegevens van geïnstalleerde apps veel minder snel. Wis nooit de websitegegevens van deze app voordat je hebt geëxporteerd.</p></div>
  </main>`;
}

export async function mount(c) {
  const lp = await lastPush(c.ev);
  if (JSON.stringify(lp) !== JSON.stringify(c.ui.lastPush ?? null)) { c.ui.lastPush = lp; c.render(); return; }
  const el = document.getElementById('storage-info');
  if (!el) return;
  try {
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    el.textContent = `${persisted ? 'Duurzame opslag is ingeschakeld: de browser wist deze gegevens niet automatisch.' : 'De browser heeft nog geen duurzame opslag toegekend; exporteer daarom regelmatig.'}${est ? ` Gebruikt: ${(est.usage / 1024 / 1024).toFixed(1)} MB.` : ''}`;
  } catch { el.textContent = 'Opslaginformatie niet beschikbaar.'; }
}

async function ensureDeviceName(c) {
  if (c.state.device.name) return true;
  const name = await c.confirm({ title: 'Naam van deze iPad', text: 'Geef deze iPad een herkenbare naam. Die zie je terug bij het ophalen, zodat je weet van welke tafel de uitslagen komen.', ok: 'Opslaan', input: { label: 'Naam', placeholder: 'Bijv. Tablet veld 1' } });
  if (!name || !name.trim()) return false;
  await c.setDeviceName(name.trim());
  return true;
}

async function startNext(c) {
  const q = c.ui.mergeQueue || [];
  while (q.length) {
    const { data, fileName } = q.shift();
    if (data.event.id !== c.state.ev.id) { c.toast(`"${fileName}" hoort bij een ander evenement (${data.event.info.name}) en is overgeslagen. Open het via Alle evenementen.`, 'error'); continue; }
    data.event.__device = data.device?.name;
    const analysis = analyze(c.state.ev, data.event);
    // Uit de cloud en niets nieuws? Dan hoeft er niets gekozen te worden.
    if (data.fromCloud && !analysis.items.some(i => !i.silent)) { c.ui.syncNothing = (c.ui.syncNothing || 0) + 1; continue; }
    c.ui.merge = { data, fileName, analysis };
    c.render();
    return;
  }
  c.ui.merge = null;
  if (c.ui.syncNothing) { c.toast(c.ui.syncNothing === 1 ? 'Eén apparaat had geen nieuwe uitslagen.' : `${c.ui.syncNothing} apparaten hadden geen nieuwe uitslagen.`); c.ui.syncNothing = 0; }
  c.render();
}

export const actions = {
  async deviceName(c, el) { await c.setDeviceName(el.value.trim()); },
  editSync(c) { c.ui.syncEdit = true; c.render(); },
  cancelSyncEdit(c) { c.ui.syncEdit = false; c.render(); },
  newCode(c) { document.getElementById('sync-code').value = newEventCode(); },
  async saveSync(c) {
    const $ = id => document.getElementById(id).value.trim();
    const url = $('sync-url'), key = $('sync-key'), code = $('sync-code');
    if (!/^https:\/\/.+/.test(url)) return c.toast('Vul de project-URL in, beginnend met https://', 'error');
    if (key.length < 20) return c.toast('Vul de publishable key (of anon key) in.', 'error');
    if (code.length < 8) return c.toast('De evenementcode moet minimaal 8 tekens hebben. Kies "Nieuwe code maken".', 'error');
    c.mutate(ev => { ev.sync = { url, key, code }; }, { silent: true });
    try {
      const n = await testConnection(c.ev);
      c.ui.syncEdit = false;
      c.toast(`Verbinding werkt. ${n ? `Er staan al gegevens van ${n} apparaat/apparaten klaar.` : 'Nog geen gegevens in de cloud voor dit evenement.'}`);
    } catch (err) { c.toast('Opgeslagen, maar de test lukte niet: ' + err.message, 'error'); }
    c.render();
  },
  async syncPush(c, el) {
    if (!await ensureDeviceName(c)) return;
    el.disabled = true; el.textContent = 'Bezig met versturen…';
    try {
      await c.flush();
      const info = await push(c.ev, c.state.device);
      c.ui.lastPush = info;
      c.toast(`Verstuurd: ${info.count} uitslagen staan nu ook in de cloud.`);
    } catch (err) { c.toast(err.message, 'error'); }
    c.render();
  },
  async syncPull(c, el) {
    el.disabled = true; el.textContent = 'Bezig met ophalen…';
    try {
      await c.flush();
      const rows = await pull(c.ev, c.state.device);
      if (!rows.length) { c.toast('Er zijn nog geen uitslagen van andere apparaten in de cloud.'); c.render(); return; }
      c.ui.mergeQueue = rows.map(r => ({ data: incomingFromRow(c.ev, r), fileName: `cloud: ${r.device_name || 'apparaat'}` }));
      startNext(c);
    } catch (err) { c.toast(err.message, 'error'); c.render(); }
  },
  async export(c) {
    await c.flush();
    const dev = c.state.device;
    const data = buildExport(c.ev, dev);
    downloadFile(exportFileName(c.ev, dev), JSON.stringify(data, null, 1));
    await c.store.markExported(c.ev);
    c.toast('Export gemaakt. Bewaar het bestand op een veilige plek.');
    await c.refreshExportInfo();
  },
  async importFiles(c, el) {
    const files = [...el.files];
    const q = [];
    for (const f of files) {
      try { q.push({ data: readExport(await f.text()), fileName: f.name }); }
      catch (err) { c.toast(`${f.name}: ${err.message}`, 'error'); }
    }
    el.value = '';
    c.ui.mergeQueue = q;
    startNext(c);
  },
  choose(c, el) { c.ui.merge.analysis.items[+el.dataset.i].choice = el.value; c.render(); },
  chooseSel(c, el) { c.ui.merge.analysis.items[+el.dataset.i].choice = el.value; },
  chooseAll(c, el) { c.ui.merge.analysis.items.filter(i => i.type === 'conflict').forEach(i => { i.choice = el.dataset.v; }); c.render(); },
  cancelMerge(c) { c.ui.merge = null; c.ui.mergeQueue = []; c.render(); },
  async applyMerge(c) {
    const { data, analysis } = c.ui.merge;
    if (unresolved(analysis)) return;
    await c.store.snapshot(c.state.ev, 'voor samenvoegen');
    const merged = applyMerge(c.state.ev, data.event, analysis, c.state.operator || c.state.device.name);
    await c.replaceEvent(merged, `samengevoegd met ${data.device?.name || data.fileName}`);
    c.toast('Samengevoegd. Exporteer het resultaat om het op andere tablets te zetten.');
    startNext(c);
  },
  async wipeEvent(c) {
    const ev = c.state.ev;
    const safe = (c.ui.lastPush && c.ui.lastPush.rev >= ev.rev) || (c.state.exportInfo && c.state.exportInfo.rev >= ev.rev);
    if (!safe) {
      const t = await c.confirm({ title: 'Nog niet alles is verstuurd', text: 'Op dit apparaat staan wijzigingen die nog niet zijn verstuurd of geëxporteerd. Als je nu wist, zijn die weg. Typ WISSEN om toch door te gaan, of kies Annuleren en verstuur eerst.', ok: 'Toch wissen', danger: true, input: { label: 'Typ WISSEN', value: '' } });
      if (!t || t.trim().toUpperCase() !== 'WISSEN') return;
    } else if (!await c.confirm({ title: 'Evenement wissen?', text: `"${ev.info.name}" met alle deelnemers, uitslagen en versies wordt van dit apparaat verwijderd. Controleer eerst op de iPad van de organisatie dat de uitslagen van dit apparaat daar staan.`, ok: 'Wissen', danger: true })) return;
    await c.flush();
    await c.store.deleteEvent(ev.id);
    await c.store.setMeta('lastEventId', null);
    c.toast('Het evenement is van dit apparaat gewist.');
    c.go('/');
  },
  async loadVersions(c) { c.ui.versions = await c.store.listVersions(c.ev.id); c.render(); },
  async restore(c, el) {
    const v = c.ui.versions.find(x => x.vid === el.dataset.vid);
    if (!await c.confirm({ title: 'Versie terugzetten?', text: `De gegevens van ${fmtDateTime(v.at)} (${v.reason}) worden teruggezet. De huidige stand wordt eerst als versie bewaard.`, ok: 'Terugzetten' })) return;
    await c.store.snapshot(c.ev, 'voor terugzetten');
    const restored = { ...v.data, rev: c.ev.rev };
    await c.replaceEvent(restored, `teruggezet naar ${fmtDateTime(v.at)}`);
    c.ui.versions = await c.store.listVersions(c.ev.id);
    c.toast('Versie teruggezet.');
    c.render();
  },
  exportVersion(c, el) {
    const v = c.ui.versions.find(x => x.vid === el.dataset.vid);
    downloadFile(exportFileName(v.data, { name: (c.state.device.name || 'apparaat') + '-versie' }), JSON.stringify(buildExport(v.data, c.state.device), null, 1));
  },
};
