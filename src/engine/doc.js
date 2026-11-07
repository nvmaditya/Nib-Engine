// The document (text boxes on pages) and the settings: loading, checking and saving them.
import { DEFAULTS, LIMITS, TOGGLES, FONTS, INKS, PENS, PAPERS, PAGE_W, KEY, OLD_KEY, SAMPLE_HEAD, SAMPLE_BODY } from './config.js';
import { geom, use } from './core.js';

export const uid = () => 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
const num = (v, d) => Number.isFinite(Number(v)) ? Number(v) : d;
const clampTo = (k, v) => Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], v));

// Handwriting settings a text box can have of its own. Paper, line spacing and the scan look stay shared.
export const BOX_KEYS = ['font', 'ink', 'customInk', 'tip', 'weight', 'size', 'mess', 'wobble', 'variety', 'flow', 'track', 'words', 'mistakes'];

export function cleanStyle(st) {
  const o = {};
  if (!st || typeof st !== 'object') return o;
  for (const k of BOX_KEYS) if (k in st) o[k] = st[k];
  if ('font' in o && !FONTS.some(f => f.id === o.font)) delete o.font; // an uploaded font is gone after a reload
  if ('ink' in o && o.ink !== 'custom' && !INKS.some(i => i.id === o.ink)) delete o.ink;
  if ('customInk' in o && !/^#[0-9a-f]{6}$/i.test(String(o.customInk))) delete o.customInk;
  if ('tip' in o && !PENS.some(p => p.id === o.tip)) delete o.tip;
  for (const k in LIMITS) if (k in o) { const v = Number(o[k]); if (Number.isFinite(v)) o[k] = clampTo(k, v); else delete o[k]; }
  delete o.gap;
  return o;
}
// Where each later page's part of a box sits, if it has been moved or resized: { pageIndex: {x, y, w} }.
function cleanFrames(fr) {
  const o = {};
  if (!fr || typeof fr !== 'object') return o;
  for (const k of Object.keys(fr)) {
    const i = Math.floor(Number(k)), v = fr[k];
    if (!(i >= 1) || !v || typeof v !== 'object') continue;
    const f = {};
    for (const key of ['x', 'y', 'w']) if (Number.isFinite(Number(v[key]))) f[key] = Number(v[key]);
    if (f.w != null) f.w = Math.max(60, Math.min(PAGE_W, f.w));
    if (Object.keys(f).length) o[i] = f;
  }
  return o;
}
export const HEADER_FIELDS = [['name', 'Name'], ['class', 'Class'], ['subject', 'Subject'], ['roll', 'Roll no.'], ['date', 'Date']];
export const DEFAULT_NAMES = { text:'Text block', header:'Header', note:'Margin note' };
const KINDS = ['text', 'header', 'note'];
// One line per field present, in the fixed order. An empty value leaves a label to fill in.
// Values are written with markup characters escaped, so they show as typed.
const escapeValue = v => v.replace(/[\\*_~=`\[]/g, '\\$&');
const unescapeValue = v => v.replace(/\\([!-\/:-@\[-`{-~])/g, '$1');
export function headerText(f) {
  return HEADER_FIELDS.filter(([k]) => typeof f[k] === 'string').map(([k, label]) => (f[k] ? `${label}: ${escapeValue(f[k])}` : `${label}:`)).join('\n');
}
function cleanFields(f) {
  const o = {};
  if (f && typeof f === 'object') for (const [k] of HEADER_FIELDS) if (typeof f[k] === 'string') o[k] = f[k].replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
  return Object.keys(o).length ? o : { name:'', class:'', date:'' };
}
const HEADER_LINE = /^(Name|Class|Subject|Roll no\.|Date):[ \t]*(.*)$/;
// Documents saved before blocks had kinds: the block of Name:/Class:/Date: lines is the Header, the longest text block the Main text.
export function migrateDoc(doc, fromSchema) {
  if (fromSchema >= 2) return doc;
  // The first block that looks like a header (lowest page, then highest on it) becomes the Header; a document has one.
  const found = new Map();
  for (const b of doc.boxes) {
    if (b.kind !== 'text') continue;
    const ls = b.text.split('\n').filter(l => l.trim());
    const ms = ls.map(l => HEADER_LINE.exec(l));
    if (ls.length < 2 || ms.some(m => !m || m[2].length > 80 || m[2] !== m[2].trimEnd())) continue;
    if (new Set(ms.map(m => m[1])).size !== ms.length) continue;
    const fields = {};
    for (const m of ms) fields[HEADER_FIELDS.find(([, label]) => label === m[1])[0]] = unescapeValue(m[2]);
    found.set(b, cleanFields(fields));
  }
  let first = null;
  for (const b of found.keys()) if (!first || b.page < first.page || (b.page === first.page && b.y < first.y)) first = b;
  const boxes = doc.boxes.map(b => (b === first ? { ...b, kind:'header', name:DEFAULT_NAMES.header, fields:found.get(b), text:headerText(found.get(b)) } : b));
  let main = null;
  for (const b of boxes) if (b.kind === 'text' && b.name === DEFAULT_NAMES.text && (!main || b.text.length > main.text.length)) main = b;
  return { ...doc, boxes:boxes.map(b => (b === main ? { ...b, name:'Main text' } : b)) };
}
export function cleanDoc(d) {
  if (!d || !Array.isArray(d.boxes)) return null;
  const boxes = d.boxes.filter(b => b && typeof b.text === 'string').map((b, i) => {
    const kind = KINDS.includes(b.kind) ? b.kind : 'text';
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 60).trim() : '';
    const c = Number(b.color);
    const o = {
      id:String(b.id || uid()), page:Math.max(0, Math.floor(num(b.page, 0))),
      x:num(b.x, 112), y:num(b.y, 110), w:Math.max(60, Math.min(PAGE_W, num(b.w, 300))), text:b.text.replace(/\r\n?/g, '\n'),
      style:cleanStyle(b.style), shuffle:Math.max(0, Math.floor(num(b.shuffle, 0))), frames:cleanFrames(b.frames),
      kind, name:name || DEFAULT_NAMES[kind], color:typeof b.color === 'number' && Number.isInteger(c) ? ((c % 6) + 6) % 6 : i % 6,
    };
    if (kind === 'header') { o.fields = cleanFields(b.fields); o.text = headerText(o.fields); }
    if (typeof b.from === 'string') { o.from = b.from; if (typeof b.fromSep === 'string' && /^(?:\\newpage[ \t]*\n|\s)*$/.test(b.fromSep)) o.fromSep = b.fromSep; }
    return o;
  });
  for (const b of boxes) if (b.from !== undefined && (b.from === b.id || !boxes.some(o => o.id === b.from))) { delete b.from; delete b.fromSep; }
  const fileName = typeof d.fileName === 'string' ? d.fileName.slice(0, 120) : '';
  return { pageCount:Math.max(1, Math.floor(num(d.pageCount, 1))), boxes, fileName };
}
// Settings from storage (or anywhere), made safe: unknown values fall back to the defaults.
export function cleanSettings(raw, legacy) {
  const S = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  if (legacy && S.font === 'playpen') S.font = DEFAULTS.font; // move off the old default hand onto a real pen hand
  if (S.ink === 'pencil') { S.ink = 'black'; S.tip = 'pencil'; } // pencil used to be an ink
  delete S.pen;
  if (!FONTS.some(f => f.id === S.font)) S.font = DEFAULTS.font;
  if (S.ink !== 'custom' && !INKS.some(i => i.id === S.ink)) S.ink = DEFAULTS.ink;
  if (!/^#[0-9a-f]{6}$/i.test(String(S.customInk))) S.customInk = DEFAULTS.customInk;
  if (!PENS.some(p => p.id === S.tip)) S.tip = DEFAULTS.tip;
  if (!['none', 'scan', 'gray', 'bw'].includes(S.look)) S.look = 'none';
  if (!PAPERS[S.paper]) S.paper = DEFAULTS.paper;
  for (const k in LIMITS) { const v = Number(S[k]); S[k] = Number.isFinite(v) ? clampTo(k, v) : DEFAULTS[k]; }
  for (const k of TOGGLES) S[k] = !!S[k];
  S.seed = Number.isFinite(Number(S.seed)) ? Number(S.seed) : DEFAULTS.seed;
  return S;
}
export function sampleDoc(S) {
  use(S, { pageCount:1, boxes:[] });
  const g = geom();
  return { pageCount:1, fileName:'', boxes:[
    { id:'b2', kind:'header', name:'Header', color:0, fields:{ name:'Aarav Mehta', class:'8-B', date:'29 October 2026' }, page:0, x:446, y:g.top - g.gap, w:320, text:SAMPLE_HEAD, style:{}, shuffle:0, frames:{} },
    { id:'b1', kind:'text', name:'Main text', color:1, page:0, x:g.left, y:g.top + 2 * g.gap, w:g.right - g.left, text:SAMPLE_BODY, style:{}, shuffle:0, frames:{} },
  ] };
}
// What was saved in this browser last time (the single-page version saved the same way).
export function loadSaved() {
  let rawS = null, rawDoc = null, oldText = null, legacy = false;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && o.s && typeof o.s === 'object') { rawS = o.s; legacy = !('tip' in o.s); }
      if (o && o.doc) rawDoc = o.doc;
    } else {
      const old = localStorage.getItem(OLD_KEY);
      if (old) {
        const o = JSON.parse(old);
        if (o && o.s && typeof o.s === 'object') { rawS = { ...o.s, lighting:true, ghost:true }; legacy = true; }
        if (o && typeof o.text === 'string') oldText = o.text;
      }
    }
  } catch (e) { /* storage unavailable: start fresh */ }
  const S = cleanSettings(rawS, legacy);
  let doc = cleanDoc(rawDoc);
  if (!doc) {
    if (oldText !== null) { use(S, { pageCount:1, boxes:[] }); const g = geom(); doc = { pageCount:1, fileName:'', boxes:[{ id:'b1', page:0, x:g.left, y:g.top, w:g.right - g.left, text:oldText, style:{}, shuffle:0, frames:{} }] }; doc = cleanDoc(doc); }
    else doc = sampleDoc(S);
  }
  doc = migrateDoc(doc, 1); // the oldest save, and the example, go through it too
  return { S, doc };
}
let saveTimer = 0;
export function saveSoon(S, doc) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ doc, s:S })); } catch (e) {} }, 400);
}
