// UI-hulpmiddelen: iconen, meldingen, dialogen, bandkleur-weergave.
import { esc } from './util.js';
import { BELT_SWATCH, beltFor, displayName } from './model.js';

export const icon = {
  menu: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>',
  close: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  arrow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m11 6-6 6 6 6"/></svg>',
  edit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  print: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8"/><path d="M6 14h12v7H6z"/></svg>',
  download: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/></svg>',
  upload: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M4 3h16"/></svg>',
  flag: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3h2v18H5zM8 4h11l-2.5 4L19 12H8z"/></svg>',
  trophy: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4"/><path d="M12 13v4M8 21h8l-1-4H9z"/></svg>',
  warn: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18v.5"/></svg>',
  play: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>',
  stop: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>',
};

const NOTE_ICON = { warn: icon.warn, error: icon.warn };

export function note(level, text, fix = '', actionHtml = '') {
  return `<div class="note ${level}" role="${level === 'error' ? 'alert' : 'status'}">${NOTE_ICON[level] || ''}<div class="txt"><div>${esc(text)}</div>${fix ? `<div class="fix">${esc(fix)}</div>` : ''}</div>${actionHtml}</div>`;
}

export function beltChip(p) {
  const b = beltFor(p);
  const kyu = p.kyu == null ? 'geen kyu' : p.kyu === 0 ? 'dan' : `${p.kyu}e kyu`;
  return `<span class="belt"><i style="background:${BELT_SWATCH[b] || '#fff'}"></i>${esc(b)} · ${esc(kyu)}</span>`;
}

// "Pietje — rood" tegen "Keesje — blauw": kleur nooit als enige signaal
export function vsLine(red, blue, size = '') {
  return `<div class="row ${size}" style="gap:10px;flex-wrap:nowrap;min-width:0">
    <span class="sq red" aria-hidden="true"></span><span style="font-weight:600;min-width:0">${esc(displayName(red))}</span><span class="tag-red">Rood</span>
    <span class="muted">tegen</span>
    <span class="tag-blue">Blauw</span><span style="font-weight:600;min-width:0">${esc(displayName(blue))}</span><span class="sq blue" aria-hidden="true"></span>
  </div>`;
}

export function emptyState(title, text, actionHtml = '') {
  return `<div class="card" style="align-items:flex-start"><h3>${esc(title)}</h3><p class="big muted">${esc(text)}</p>${actionHtml ? `<div class="row">${actionHtml}</div>` : ''}</div>`;
}

let toastTimer;
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.className = 'toast ' + kind;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

// Eigen bevestigingsdialoog (groot en duidelijk op tablet).
export function confirmDialog({ title, text, ok = 'Bevestigen', cancel = 'Annuleren', danger = false, input = null }) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="scrim" data-x="cancel"></div>
      <div class="modal small" role="dialog" aria-modal="true" aria-labelledby="cd-title">
        <div class="modal-head"><h2 id="cd-title">${esc(title)}</h2></div>
        <div class="modal-body"><p class="big">${esc(text)}</p>${input ? `<label class="field"><span>${esc(input.label)}</span><input class="input" id="cd-input" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}"></label>` : ''}</div>
        <div class="modal-foot"><button class="btn" data-x="cancel">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'dark'} l" data-x="ok">${esc(ok)}</button></div>
      </div>`;
    document.body.appendChild(wrap);
    const inp = wrap.querySelector('#cd-input');
    (inp || wrap.querySelector('[data-x="ok"]')).focus();
    const done = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); if (e.key === 'Enter' && inp) done(inp.value); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', e => {
      const x = e.target.closest('[data-x]');
      if (!x) return;
      if (x.dataset.x === 'ok') done(inp ? inp.value : true); else done(false);
    });
  });
}

export function sexLabel(s) { return s === 'M' ? 'Jongen' : s === 'V' ? 'Meisje' : '?'; }
