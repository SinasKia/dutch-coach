// Tiny DOM helpers. All text is inserted as text nodes, so imported pack content can never inject markup.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
export function append(el, ...kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false || k === '') continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const clear = (el) => { el.replaceChildren(); return el; };
/** English help text (meanings, optional explanations). */
export const en = (text, cls = '') => h('span', { class: `en ${cls}`, lang: 'en' }, text);

const ICONS = {
  today: 'M12 3v2m0 14v2m9-9h-2M5 12H3m14.7-5.7-1.4 1.4M7.7 16.3l-1.4 1.4m0-11.4 1.4 1.4m8.6 8.6 1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
  speak: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3m-4 0h8',
  listen: 'M4 14v-2a8 8 0 0116 0v2M4 14a2 2 0 012-2h1v7H6a2 2 0 01-2-2v-3zm16 0a2 2 0 00-2-2h-1v7h1a2 2 0 002-2v-3z',
  vocab: 'M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zm0 13a3 3 0 013-3h11M9 8h6',
  progress: 'M4 20V10m6 10V4m6 16v-8m4 8H2',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  play: 'M7 4l13 8-13 8V4z', stop: 'M6 6h12v12H6z', slow: 'M4 12h10m0 0l-4-4m4 4l-4 4M18 6v12',
  back: 'M15 5l-7 7 7 7', check: 'M5 12l5 5 9-10', x: 'M6 6l12 12M18 6L6 18', save: 'M6 4h12v17l-6-4-6 4V4z',
};
export function icon(name, size = 22) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name] || ''); svg.append(p);
  return svg;
}

export function toast(msg, ms = 2800) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

export function modal(build) {
  const close = () => wrap.remove();
  const box = h('div', { class: 'modal-box', role: 'dialog', 'aria-modal': 'true' });
  const wrap = h('div', { class: 'modal', onclick: (e) => { if (e.target === wrap) close(); } }, box);
  append(box, build(close));
  document.body.append(wrap);
  return close;
}
export function confirmBox(title, body, ok = 'Ja', cancel = 'Annuleren') {
  return new Promise((res) => modal((close) => [
    h('h3', {}, title), typeof body === 'string' ? h('p', {}, body) : body,
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: () => { close(); res(false); } }, cancel),
      h('button', { class: 'btn primary', onclick: () => { close(); res(true); } }, ok)),
  ]));
}

export const btn = (label, onclick, cls = '') => h('button', { class: `btn ${cls}`, onclick }, label);
export const card = (...kids) => h('section', { class: 'card' }, kids);
export const pill = (text, cls = '') => h('span', { class: `pill ${cls}` }, text);
export const mins = (m) => m < 60 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1).replace('.', ',')} uur`;
export const dateNL = (t) => new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

export function bar(value, max, label) {
  const pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  return h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': Math.round(pct), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': label || '' }, h('div', { class: 'bar-fill', style: `width:${pct}%` }));
}
