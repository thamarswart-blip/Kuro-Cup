// Excel-export van de poule-formulieren op basis van het aangeleverde sjabloon
// ("Poule-formulieren leeg rood en blauw.xlsx", opgeslagen als assets/poule-formulieren.json).
// Per poule wordt het tabblad met het juiste aantal deelnemers gekopieerd, hernoemd en ingevuld.
// Geen externe library: het .xlsx-bestand (zip) wordt hier zelf opgebouwd, zodat het offline werkt.
import { byId, fmtDate, slug } from './util.js';
import { displayName } from './model.js';

let tplPromise = null;
function loadTemplate() {
  tplPromise = tplPromise || fetch('assets/poule-formulieren.json').then(r => { if (!r.ok) throw new Error('Sjabloon niet gevonden'); return r.json(); });
  return tplPromise;
}

const SIZES = [3, 4, 5, 6, 8];
export const MAX_FORM_SIZE = 8;
// Kleinste sjabloon waar de poule in past (7 deelnemers → sjabloon voor 8, de lege plek vervalt).
export function templateSizeFor(n) { return SIZES.find(s => s >= n) || null; }

const xmlEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Celinhoud vervangen door tekst (inline string, stijl blijft behouden).
function setCell(xml, ref, text) {
  const re = new RegExp(`<c r="${ref}"((?:(?!/>)[^>])*)(?:/>|>[\\s\\S]*?</c>)`);
  return xml.replace(re, (m, attrs) => `<c r="${ref}"${attrs.replace(/\s+t="[^"]*"/, '')} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(text)}</t></is></c>`);
}

// Formules met de berekende 0 weghalen: het formulier wordt met de hand ingevuld.
function stripFormulas(xml) {
  return xml.replace(/<c r="([A-Z]+\d+)"((?:(?!\/>)[^>])*)><f>[\s\S]*?<\/f>(?:<v>[\s\S]*?<\/v>)?<\/c>/g, (m, ref, attrs) => `<c r="${ref}"${attrs.replace(/\s+t="[^"]*"/, '')}/>`);
}

// Kolom A (namen) breed genoeg maken zodat namen niet worden afgekapt.
function widenNameColumn(xml, chars) {
  const want = Math.min(Math.round(chars * 1.15 + 2), 45);
  if (/<col min="1" max="1"[^>]*\/>/.test(xml)) {
    return xml.replace(/<col min="1" max="1"([^>]*?)width="([\d.]+)"([^>]*)\/>/, (m, a, w, b) => `<col min="1" max="1"${a}width="${Math.max(+w, want)}"${b.includes('customWidth') ? b : b + ' customWidth="1"'}/>`);
  }
  if (/<col min="1" max="(\d+)"/.test(xml)) {
    // Eerste kolomdefinitie begint bij 1 en loopt verder: splitsen in kolom A en de rest.
    return xml.replace(/<col min="1" max="(\d+)"([^>]*?)width="([\d.]+)"([^>]*)\/>/, (m, max, a, w, b) => `<col min="1" max="1"${a}width="${Math.max(+w, want)}"${b.includes('customWidth') ? b : b + ' customWidth="1"'}/><col min="2" max="${max}"${a}width="${w}"${b}/>`);
  }
  const col = `<col min="1" max="1" width="${want}" customWidth="1"/>`;
  return xml.includes('<cols>') ? xml.replace('<cols>', '<cols>' + col) : xml.replace('<sheetData', `<cols>${col}</cols><sheetData`);
}

// Tabbladnaam: max. 31 tekens, zonder : \ / ? * [ ] en uniek.
function sheetName(pool, used) {
  let base = pool.name
    .replace(/^Kata · /, 'Kata ').replace(/^Kumite · /, 'Kumite ')
    .replace(/Jongens /, 'J ').replace(/Meisjes /, 'M ').replace(/Gemengd /, 'Gem ')
    .replace(/ jaar/, 'j').replace(/ · /g, ' ').replace(/\s*\+\s*beginners/, '+b')
    .replace(/[:\\/?*[\]]/g, '-').trim();
  if (base.length > 31) base = base.slice(0, 31).trim();
  let name = base, k = 2;
  while (used.has(name.toLowerCase())) { const suf = ` (${k++})`; name = base.slice(0, 31 - suf.length) + suf; }
  used.add(name.toLowerCase());
  return name;
}

function fieldNumber(ev, pool) {
  const i = ev.fields.findIndex(f => f.id === pool.fieldId);
  if (i < 0) return '';
  const m = ev.fields[i].name.match(/\d+/);
  return m ? m[0] : String(i + 1);
}

// Welke poules krijgen een formulier, en welke niet (te groot of leeg)?
export function formPlan(ev, pools = ev.pools) {
  const fById = byId(ev.fields);
  const order = pools.slice().sort((a, b) => {
    const fa = ev.fields.findIndex(f => f.id === a.fieldId), fb = ev.fields.findIndex(f => f.id === b.fieldId);
    const sa = Math.min(...ev.matches.filter(m => m.poolId === a.id && m.start != null).map(m => m.start), 1e9);
    const sb = Math.min(...ev.matches.filter(m => m.poolId === b.id && m.start != null).map(m => m.start), 1e9);
    return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb) || sa - sb;
  });
  const ok = [], skipped = [];
  for (const p of order) {
    const n = p.participantIds.length;
    const size = templateSizeFor(n);
    if (!n) skipped.push({ pool: p, reason: 'lege poule' });
    else if (!size) skipped.push({ pool: p, reason: `${n} deelnemers; het sjabloon gaat tot ${MAX_FORM_SIZE}` });
    else ok.push({ pool: p, size, field: fById[p.fieldId]?.name || '' });
  }
  return { ok, skipped };
}

export async function buildPoolForms(ev, pools = ev.pools) {
  const tpl = await loadTemplate();
  const files = tpl.files;
  const pById = byId(ev.participants);
  const { ok, skipped } = formPlan(ev, pools);
  if (!ok.length) throw new Error('Er zijn geen poules om te exporteren.');
  const used = new Set();
  const date = ev.info.date ? fmtDate(ev.info.date) : '';
  const headerText = `&C${(ev.info.name || 'Kuro Cup').replace(/&/g, '&&')} · Dojo Kuro`;
  const sheets = ok.map(({ pool, size }, i) => {
    const t = tpl.templates[size];
    let xml = files[t.path];
    const names = pool.participantIds.map(id => displayName(pById[id]));
    xml = setCell(xml, t.datum, `DATUM: ${date}`);
    xml = setCell(xml, t.shiao, `SHIAO: ${fieldNumber(ev, pool)}`);
    xml = setCell(xml, t.poule, `POULE: ${pool.name}`);
    for (let k = 1; k <= size; k++) {
      const nm = names[k - 1];
      xml = setCell(xml, t.names[k], nm ? `${k}: ${nm}` : `${k}: — (vervalt)`);
      if (t.ranks[k]) xml = setCell(xml, t.ranks[k], nm ? `${k}: ${nm}` : '—');
    }
    xml = stripFormulas(xml);
    xml = widenNameColumn(xml, Math.max(...names.map(n => n.length + 4), 12));
    xml = xml.replace(/ tabSelected="1"/g, '');
    if (i === 0) xml = xml.replace('<sheetView ', '<sheetView tabSelected="1" ');
    xml = xml.replace(/<oddHeader>[\s\S]*?<\/oddHeader>/, `<oddHeader>${xmlEsc(headerText)}</oddHeader>`);
    return { name: sheetName(pool, used), path: `xl/worksheets/sheet${i + 1}.xml`, xml };
  });

  const out = {};
  for (const [path, content] of Object.entries(files)) if (!path.startsWith('xl/worksheets/')) out[path] = content;
  for (const s of sheets) out[s.path] = s.xml;
  const n = sheets.length;
  out['xl/workbook.xml'] = files['xl/workbook.xml']
    .replace(/activeTab="\d+"/, 'activeTab="0"')
    .replace(/<sheets>[\s\S]*?<\/sheets>/, `<sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`)
    .replace(/<calcPr[^>]*\/>/, '<calcPr calcId="125725" fullCalcOnLoad="1"/>');
  out['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId${n + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  out['[Content_Types].xml'] = files['[Content_Types].xml']
    .replace(/<Override PartName="\/xl\/worksheets\/[^"]+"[^>]*\/>/g, '')
    .replace(/<Override PartName="\/xl\/calcChain.xml"[^>]*\/>/, '')
    .replace('</Types>', sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>');
  out['docProps/app.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Werkbladen</vt:lpstr></vt:variant><vt:variant><vt:i4>${n}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${n}" baseType="lpstr">${sheets.map(s => `<vt:lpstr>${xmlEsc(s.name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts><Company>Dojo Kuro</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>12.0000</AppVersion></Properties>`;

  // Vaste volgorde: [Content_Types].xml eerst, zoals Excel verwacht.
  const order = ['[Content_Types].xml', '_rels/.rels', ...Object.keys(out).filter(p => p !== '[Content_Types].xml' && p !== '_rels/.rels').sort()];
  const blob = zipStore(order.map(p => ({ name: p, data: new TextEncoder().encode(out[p]) })),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return { blob, fileName: `${slug(ev.info.name) || 'kuro-cup'}_poule-formulieren.xlsx`, sheets: sheets.map((s, i) => ({ name: s.name, pool: ok[i].pool, size: ok[i].size })), skipped };
}

// ---- Minimale zip-schrijver (methode "stored", zonder compressie) ----
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

export function zipStore(entries, type) {
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const name = new TextEncoder().encode(e.name);
    const crc = crc32(e.data), size = e.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, e.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
    ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((t, p) => t + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type });
}
