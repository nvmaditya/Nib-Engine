// Nib's drawing engine: real font outlines bent into handwriting, pen and ink, paper,
// page layout with text that flows from page to page, and the scan and camera looks.
// Ported from the single-page version; the React app hands it settings and the document with use().
import opentype from 'opentype.js';
import { PAGE_W, PAGE_H, PAD, FONTS, PENS, INKS, PAPERS, DEFAULTS } from './config.js';

const BASE = import.meta.env.BASE_URL;
// The settings and document being drawn. While one text box is drawn, S briefly holds that box's
// own settings (see withBox), so everything below reads S rather than taking it as an argument.
let S = { ...DEFAULTS };
let doc = { pageCount:1, boxes:[], fileName:'' };
export function use(settings, document) { S = settings; doc = document; ENG = engineFor(fontCfg()); }
let notify = () => {};
export function onAssetReady(fn) { notify = fn; } // a font or the paper photo arrived: draw again

const fontCfg = () => FONTS.find(f => f.id === S.font) || FONTS[0];
const penCfg = () => PENS.find(p => p.id === S.tip) || PENS[1];
const inkColor = () => S.ink === 'custom' ? S.customInk : (INKS.find(i => i.id === S.ink) || INKS[0]).c;
const inkName = () => S.ink === 'custom' ? 'Your colour' : (INKS.find(i => i.id === S.ink) || INKS[0]).name;
// The ink as the chosen pen lays it down.
const inkCfg = () => { const p = penCfg(); return { c:inkColor(), a:p.a, grain:p.grain, halo:p.halo, pen:p }; };
const familyCss = cfg => cfg.local ? `"${cfg.family}", cursive` : `"LH ${cfg.id}", "${cfg.family}", cursive`;
const fontStr = (cfg, size) => `${cfg.weight} ${Math.round(size * 100) / 100}px ${familyCss(cfg)}`;
const allText = () => doc.boxes.map(b => b.text).join('\n');

/* ---------- Utilities & glyph engine ---------- */
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = (...parts) => mulberry32(hashStr(parts.join('|')));

const mCtx = document.createElement('canvas').getContext('2d');
const mCache = new Map();
let mFont = '';
function canvasW(str, font) {
  if (!str) return 0;
  const k = font + '\u0001' + str;
  let v = mCache.get(k);
  if (v === undefined) {
    if (mFont !== font) { mCtx.font = font; mFont = font; }
    v = mCtx.measureText(str).width;
    if (mCache.size > 40000) mCache.clear();
    mCache.set(k, v);
  }
  return v;
}
// Width as Nib will actually write it: glyph advances from the font file,
// averaged over the letter's alternate shapes when variety is on.
function textW(str, f, size) {
  if (!str) return 0;
  const tr = S.track || 0;
  if (!ENG || COMPLEX.test(str)) return canvasW(str, f) + (tr ? tr * graphemes(str).length : 0);
  const avg = S.variety > 0;
  const k = ENG.id + '\u0002' + (avg ? 1 : 0) + '\u0002' + size + '\u0002' + tr + '\u0002' + f + '\u0002' + str;
  let v = mCache.get(k);
  if (v === undefined) {
    v = 0;
    for (const g of graphemes(str)) { const gi = ENG.gi(g); v += (gi ? (avg ? ENG.avgAdv(gi) : ENG.adv(gi)) * size : canvasW(g, f)) + tr; }
    if (mCache.size > 40000) mCache.clear();
    mCache.set(k, v);
  }
  return v;
}
const spaceW = (f, size) => Math.max(ENG ? ENG.spaceAdv * size : canvasW(' ', f), size * 0.26) * Math.max(0.2, 1 + (S.words || 0) / 100);

/* ---------- Glyph engine: real alternates + per-letter reshaping ---------- */
let ENG = null;
const engines = new Map();
const ALT_SKIP = new Set('smcp c2sc case sups subs sinf numr dnom frac onum lnum tnum pnum ordn zero locl liga dlig ccmp mark mkmk kern pcap c2pc unic titl hist hlig swsh init medi fina isol rlig rclt aalt abvs blws pres psts half haln akhn rphf blwf abvf pstf cjct nukt vatu rkrf'.split(' '));
function covGlyphs(cov) {
  if (!cov) return [];
  if (cov.format === 1) return cov.glyphs || [];
  const out = []; for (const r of cov.ranges || []) for (let g = r.start; g <= r.end; g++) out.push(g); return out;
}
// Collect every glyph a letter can turn into through the font's stylistic and
// contextual substitutions (rand, salt, calt, ssXX, cvXX…), i.e. its alternate shapes.
function findAlternates(font) {
  const alts = new Map();
  const gsub = font.tables && font.tables.gsub;
  if (!gsub || !gsub.features || !gsub.lookups) return alts;
  const add = (a, b) => { if (a === b || b == null) return; let s = alts.get(a); if (!s) { s = new Set(); alts.set(a, s); } s.add(b); };
  const seen = new Set();
  const collect = (o, recs) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(x => collect(x, recs)); return; }
    if (o.lookupRecords) recs.push(...o.lookupRecords);
    for (const k of ['ruleSets', 'chainRuleSets', 'classSets', 'chainClassSets']) if (o[k]) collect(o[k], recs);
  };
  const walk = li => {
    if (seen.has(li)) return; seen.add(li);
    const lk = gsub.lookups[li]; if (!lk) return;
    for (let st of lk.subtables || []) {
      let type = lk.lookupType;
      if (type === 7 && st && st.extension) { type = st.lookupType; st = st.extension; }
      if (!st) continue;
      if (type === 1) {
        const gl = covGlyphs(st.coverage);
        if (st.substFormat === 1) gl.forEach(g => add(g, g + st.deltaGlyphId));
        else gl.forEach((g, i) => add(g, st.substitute && st.substitute[i]));
      } else if (type === 3) {
        covGlyphs(st.coverage).forEach((g, i) => ((st.alternateSets && st.alternateSets[i]) || []).forEach(b => add(g, b)));
      } else if (type === 5 || type === 6) {
        const recs = []; collect(st, recs); recs.forEach(r => walk(r.lookupListIndex));
      }
    }
  };
  for (const fr of gsub.features) { if (ALT_SKIP.has(fr.tag)) continue; ((fr.feature && fr.feature.lookupListIndexes) || []).forEach(walk); }
  return alts;
}
function makeEngine(font, id) {
  const upm = font.unitsPerEm || 1000;
  const alts = findAlternates(font);
  const cmdCache = new Map(), formsCache = new Map(), advCache = new Map();
  const cmds = gi => {
    let c = cmdCache.get(gi);
    if (!c) { try { c = font.glyphs.get(gi).getPath(0, 0, 1).commands; } catch (e) { c = []; } cmdCache.set(gi, c); }
    return c;
  };
  const adv = gi => {
    let a = advCache.get(gi);
    if (a === undefined) { const g = font.glyphs.get(gi); a = ((g && g.advanceWidth) || 0) / upm; advCache.set(gi, a); }
    return a;
  };
  const forms = gi => {
    let f = formsCache.get(gi);
    if (!f) {
      const base = adv(gi); f = [gi];
      const s = alts.get(gi);
      if (s) for (const a of [...s].sort((x, y) => x - y)) { const aa = adv(a); if (a !== gi && cmds(a).length && aa > base * 0.6 && aa < base * 1.6) f.push(a); }
      formsCache.set(gi, f);
    }
    return f;
  };
  const avgAdv = gi => { const f = forms(gi); return f.reduce((s, g) => s + adv(g), 0) / f.length; };
  const gi = ch => {
    const cp = ch.codePointAt(0);
    if (ch.length !== (cp > 0xffff ? 2 : 1)) return 0;
    const g = font.charToGlyphIndex(ch);
    return g && cmds(g).length ? g : 0;
  };
  let letterAlts = 0;
  for (const ch of 'abcdefghijklmnopqrstuvwxyz') { const g = font.charToGlyphIndex(ch); if (g) letterAlts += forms(g).length - 1; }
  const sp = font.charToGlyphIndex(' ');
  const bCache = new Map();
  const bounds = g => { // outline box in em units, control points included
    let b = bCache.get(g);
    if (!b) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const pt = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
      for (const c of cmds(g)) { if (c.x !== undefined) pt(c.x, c.y); if (c.x1 !== undefined) pt(c.x1, c.y1); if (c.x2 !== undefined) pt(c.x2, c.y2); }
      b = x0 <= x1 ? [x0, y0, x1, y1] : [0, 0, 0, 0]; bCache.set(g, b);
    }
    return b;
  };
  const eng = { id, gi, forms, adv, avgAdv, cmds, bounds, letterAlts, spaceAdv: (sp ? adv(sp) : 0) || 0.26 };
  eng.ns = nativeStroke(eng);
  return eng;
}
// The font's own stroke width in em, from ink area over edge length of a few letters.
function nativeStroke(eng) {
  try {
    const Z = 160, W = 1400, H = 300; const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); let px = 10;
    for (const ch of 'nmuoeachrsl') {
      const g = eng.gi(ch); if (!g) continue;
      x.save(); x.translate(px, 200); x.scale(Z, Z); tracePath(x, eng.cmds(g), null); x.fill(); x.restore();
      px += Math.max(0.2, eng.adv(g)) * Z + 12; if (px > W - Z) break;
    }
    const d = x.getImageData(0, 0, W, H).data; let A = 0, B = 0;
    const on = i => d[i * 4 + 3] > 127;
    for (let yy = 1; yy < H - 1; yy++) for (let xx = 1; xx < W - 1; xx++) {
      const i = yy * W + xx; if (!on(i)) continue; A++;
      if (!on(i - 1) || !on(i + 1) || !on(i - W) || !on(i + W)) B++;
    }
    const w = B ? (2 * A / B) / Z : 0.06;
    return Math.max(0.012, Math.min(0.2, w));
  } catch (e) { return 0.06; }
}
// Font files are fetched the first time a hand is used, then kept.
const fontBufs = new Map(), fontLoads = new Map();
export function loadFont(id) {
  const cfg = FONTS.find(f => f.id === id);
  if (!cfg || cfg.buf || fontBufs.has(id)) return Promise.resolve(true);
  if (!fontLoads.has(id)) fontLoads.set(id, fetch(`${BASE}fonts/${id}.woff`).then(r => { if (!r.ok) throw new Error('font'); return r.arrayBuffer(); })
    .then(buf => { fontBufs.set(id, buf); return true; }).catch(() => { fontLoads.delete(id); return false; }));
  return fontLoads.get(id);
}
export const fontReady = id => { const cfg = FONTS.find(f => f.id === id); return !cfg || !!cfg.buf || fontBufs.has(id); };
export function engineFor(cfg) {
  if (engines.has(cfg.id)) return engines.get(cfg.id);
  const raw = cfg.buf || fontBufs.get(cfg.id);
  if (!raw) return null; // not fetched yet: don't remember the miss
  let e = null;
  try { e = makeEngine(opentype.parse(raw.slice(0)), cfg.id); } catch (err) { e = null; }
  engines.set(cfg.id, e);
  return e;
}
// A box's settings: the shared ones, with the box's own on top. Its own reshuffle changes only its randomness.
function boxSettings(box) {
  const st = box && box.style, sh = box && box.shuffle;
  if (!(st && Object.keys(st).length) && !sh) return S;
  const o = { ...S, ...st };
  if (sh) o.seed = S.seed + '~' + sh;
  return o;
}
const hasOwnStyle = box => !!(box && ((box.style && Object.keys(box.style).length) || box.shuffle));
function withBox(box, fn) {
  const o = boxSettings(box);
  if (o === S) return fn();
  const saveS = S, saveE = ENG;
  S = o; ENG = engineFor(fontCfg());
  try { return fn(); } finally { S = saveS; ENG = saveE; }
}
const SEG = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter(undefined, { granularity:'grapheme' }) : null;
const graphemes = t => SEG ? Array.from(SEG.segment(t), s => s.segment) : Array.from(t);
// Scripts that need shaping across letters are always written word by word.
const COMPLEX = /[\u0590-\u08FF\u0900-\u0DFF\u0E00-\u0FFF\u1000-\u109F\u1780-\u17FF]/;

/* ---------- Markdown-ish parsing ---------- */
const INL = [
  { re:/\*\*(?=\S)([\s\S]+?)\*\*/, g:1, k:'bold' },
  { re:/~~(?=\S)([\s\S]+?)~~/, g:1, k:'strike' },
  { re:/==(?=\S)([\s\S]+?)==/, g:1, k:'hl' },
  { re:/\*(?=[^\s*])([\s\S]+?)\*/, g:1, k:'ul' },
  { re:/(^|[^\w])_(?=\S)([\s\S]+?)_(?!\w)/, g:2, lead:1, k:'ul' },
  { re:/`([^`]+)`/, g:1, k:null },
  { re:/\[([^\]]+)\]\([^)]*\)/, g:1, k:null },
];
// A backslash before ASCII punctuation makes that character literal: swap it to a private-use character while matching.
const ESC_RE = /\\([!-\/:-@\[-`{-~])/g;
const hideEsc = t => t.replace(ESC_RE, (_, c) => String.fromCharCode(0xE000 + c.charCodeAt(0)));
const showEsc = t => t.replace(/[\uE021-\uE07E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xE000));
export function parseInline(t) {
  return parseInlineRaw(hideEsc(t), {}).map(p => ({ text:showEsc(p.text), style:p.style }));
}
function parseInlineRaw(t, st) {
  const out = []; let rest = t; let guard = 0;
  while (rest && guard++ < 500) {
    let best = null, bi = 0;
    for (const p of INL) {
      const m = p.re.exec(rest);
      if (m) { const idx = m.index + (p.lead ? m[p.lead].length : 0); if (!best || idx < bi) { best = { m, p }; bi = idx; } }
    }
    if (!best) { out.push({ text:rest, style:st }); break; }
    if (bi > 0) out.push({ text:rest.slice(0, bi), style:st });
    const ns = best.p.k ? { ...st, [best.p.k]:true } : st;
    out.push(...parseInlineRaw(best.m[best.p.g], ns));
    rest = rest.slice(best.m.index + best.m[0].length);
  }
  return out;
}
// What kind of line this is, and where its words begin.
export function parseLine(raw) {
  raw = raw.replace(/\t/g, '    ');
  const info = (kind, content = '', x = {}) => ({ kind, level:0, depth:0, marker:'', content, prefix:raw.length - content.length, ...x });
  const plain = kind => ({ kind, level:0, depth:0, marker:'', content:'', prefix:0 });
  if (/^\s*\\newpage\s*$/.test(raw)) return plain('newpage');
  if (!raw.trim()) return plain('blank');
  if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(raw)) return plain('hr');
  let m;
  if ((m = raw.match(/^(#{1,3})\s+(.*)$/))) return info('heading', m[2], { level:m[1].length });
  if ((m = raw.match(/^(\s*)([-*+])\s+(.*)$/))) return info('bullet', m[3], { depth:Math.min(3, Math.floor(m[1].length / 2)), marker:m[2] });
  if ((m = raw.match(/^(\s*)(\d{1,3}[.)]|[a-z]\))\s+(.*)$/))) return info('number', m[3], { depth:Math.min(3, Math.floor(m[1].length / 2)), marker:m[2] });
  if ((m = raw.match(/^\s*>\s?(.*)$/))) return info('quote', m[1]);
  return { kind:'text', level:0, depth:0, marker:'', content:raw, prefix:0 };
}
function tokenize(segs) {
  const toks = []; let cur = null; let pending = 0;
  for (const sg of segs) {
    for (const part of sg.text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { pending += part.length; cur = null; continue; }
      if (!cur) { cur = { pieces:[], spaces:pending }; pending = 0; toks.push(cur); }
      cur.pieces.push({ text:part, style:sg.style });
    }
  }
  return toks;
}
const tokText = t => t.pieces.map(p => p.text).join('');
const tokW = (t, f, size) => t.pieces.reduce((w, p) => w + textW(p.text, f, size), 0);

function splitToken(t, avail, f, size) {
  const flat = [];
  for (const p of t.pieces) for (const ch of graphemes(p.text)) flat.push({ ch, style:p.style });
  const out = []; let cur = []; let w = 0;
  const flush = () => {
    if (!cur.length) return;
    const pieces = [];
    for (const c of cur) { const last = pieces[pieces.length - 1]; if (last && last.style === c.style) last.text += c.ch; else pieces.push({ text:c.ch, style:c.style }); }
    out.push({ pieces, spaces:0, oi:t.oi, part:(t.part || 0) + out.length }); cur = []; w = 0;
  };
  for (const c of flat) { const cw = textW(c.ch, f, size) * 1.05; if (cur.length && w + cw > avail) flush(); cur.push(c); w += cw; }
  flush();
  return out;
}
function wrap(toks, avail, f, size) {
  const sp = spaceW(f, size);
  const rows = []; let items = []; let w = 0;
  const push = () => { rows.push({ items, w }); items = []; w = 0; };
  for (const t of toks) {
    const tw = tokW(t, f, size) * 1.08;
    let n = items.length ? Math.max(1, t.spaces) : (rows.length === 0 ? Math.min(t.spaces, 16) : 0);
    if (items.length && w + n * sp * 1.1 + tw > avail) { push(); n = 0; }
    if (!items.length && tw + n * sp > avail) {
      splitToken(t, avail, f, size).forEach((c, ci) => {
        if (ci > 0) push();
        items.push({ tok:c, spaces:0 }); w = tokW(c, f, size) * 1.05;
      });
      continue;
    }
    items.push({ tok:t, spaces:n }); w += n * sp * 1.1 + tw;
  }
  if (items.length || rows.length === 0) push();
  return rows;
}

/* ---------- Geometry & box layout ---------- */
function geom() {
  const P = PAPERS[S.paper] || PAPERS.ruled;
  const gap = S.gap, top = 110, marginX = 96;
  const left = P.margin ? marginX + 16 : 74;
  const right = PAGE_W - 52;
  return { P, gap, top, marginX, left, right, maxBase:PAGE_H - 46 };
}
function snapY(y, g) {
  const minK = -Math.floor((g.top - 6) / g.gap);
  const maxK = Math.floor((g.maxBase - g.gap - g.top) / g.gap);
  const k = Math.max(minK, Math.min(maxK, Math.round((y - g.top) / g.gap)));
  return g.top + k * g.gap;
}
function snapX(x, g, w) {
  if (Math.abs(x - g.left) < 10) x = g.left;
  const max = Math.max(6, PAGE_W - w - 6);
  return Math.round(Math.max(6, Math.min(max, x)));
}

// A slip of the pen: the kinds of mistake people make writing by hand.
function misspell(w, rnd) {
  const n = w.length, r = rnd(); let out;
  if (r < 0.34) out = w.slice(0, Math.min(n - 2, 2 + Math.floor(rnd() * 3)));               // started, stopped
  else if (r < 0.58) { const i = 1 + Math.floor(rnd() * (n - 2)); out = w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2); } // two letters swapped
  else if (r < 0.78) { const i = 1 + Math.floor(rnd() * (n - 1)); out = w.slice(0, i) + w.slice(i + 1); }                 // a letter left out
  else {
    const vs = [...w].map((c, i) => i > 0 && 'aeiou'.includes(c) ? i : -1).filter(i => i > 0);
    if (vs.length) { const i = vs[Math.floor(rnd() * vs.length)]; const o = 'aeiou'.replace(w[i], ''); out = w.slice(0, i) + o[Math.floor(rnd() * o.length)] + w.slice(i + 1); } // wrong vowel
    else { const i = 1 + Math.floor(rnd() * (n - 1)); out = w.slice(0, i) + w[i] + w.slice(i); }                         // a letter doubled
  }
  return out && out !== w ? out : w.slice(0, Math.max(2, n - 2));
}
// Now and then write a word wrong, cross it out, and write it again.
function addMistakes(toks, key) {
  const rate = (S.mistakes || 0) / 100 * 0.07;
  if (!(rate > 0)) return toks;
  const out = [];
  toks.forEach((t, i) => {
    if (t.pieces.length === 1 && !t.pieces[0].style.strike) {
      const pc = t.pieces[0], m = pc.text.match(/^([A-Za-z]{4,})([^A-Za-z]*)$/);
      if (m) {
        const rnd = rng(key, i, m[1]);
        if (rnd() < rate) { out.push({ pieces:[{ text:misspell(m[1], rnd), style:{ ...pc.style, strike:true, cut:true } }], spaces:t.spaces, oi:t.oi }); out.push({ pieces:t.pieces, spaces:1, oi:t.oi }); return; }
      }
    }
    out.push(t);
  });
  return out;
}

// A margin note's letters, against the document's letter size.
export const NOTE_SCALE = 0.8;
// Lay out one box, a page's part at a time. Rows sit on ruled lines; anything past the bottom of
// a page continues on the page after the one its part before is on. Each part first asks where it
// would go (yield) and is told where it goes: computeLayout may push it down or onto a later page.
function* boxParts(box, g, cfg, out) {
  const base = S.size * cfg.scale * (box.kind === 'note' ? NOTE_SCALE : 1);
  let seg = null, n = 0, gid = 0;
  // Each page's part of a box is a frame. Later frames can be moved and resized on their own page;
  // the text flows from one frame into the next.
  function* newSeg() {
    const idx = n++, fr = idx && box.frames ? box.frames[idx] : null;
    const page = seg ? seg.page + 1 : box.page;
    const x = fr && fr.x != null ? fr.x : box.x, w = fr && fr.w != null ? fr.w : box.w;
    const top = idx === 0 ? box.y : fr && fr.y != null ? fr.y : g.top;
    const at = yield { page, idx, x, w, top };
    seg = { box, page:at.page, idx, x, w, top:at.top, storedTop:top, pushed:at.page !== page || at.top !== top, rows:[] };
    out.push(seg);
  }
  yield* newSeg();
  const full = () => seg.rows.length > 0 && seg.top + (seg.rows.length + 1) * g.gap > g.maxBase;
  function* push(r) {
    if (full()) yield* newSeg();
    r.ruleY = seg.top + (seg.rows.length + 1) * g.gap; r.gid = gid++; seg.rows.push(r);
  }
  // Where a row's text starts in the box's text: line number, and word number within the line.
  const srcOf = (li, items) => {
    const t = items.length ? items[0].tok : null;
    return { li, tok:!t || t.oi == null ? 0 : t.oi + (t.part ? 1 : 0) };
  };
  const src = box.text.replace(/\r\n?/g, '\n').split('\n');
  let li = -1;
  for (let raw of src) {
    li++;
    const L = parseLine(raw);
    if (L.kind === 'newpage') { if (seg.rows.length) yield* newSeg(); continue; }
    if (L.kind === 'blank') { yield* push({ kind:'blank', src:{ li, tok:0 } }); continue; }
    if (L.kind === 'hr') { yield* push({ kind:'hr', src:{ li, tok:0 } }); continue; }
    const b = { size:base, indent:0, align:'left', marker:null, quote:false, headingUL:false, level:0 };
    const content = L.content;
    if (L.kind === 'heading') {
      const l = L.level; b.level = l; b.size = base * [1.4, 1.18, 1.06][l - 1];
      b.headingUL = l <= 2; b.align = l === 1 ? 'center' : 'left';
    } else if (L.kind === 'bullet') {
      b.indent = 30 * (L.depth + 1); b.marker = { type:'dot' };
    } else if (L.kind === 'number') {
      b.indent = 34 * (L.depth + 1) + (L.marker.length > 2 ? 8 : 0);
      b.marker = { type:'text', text:L.marker };
    } else if (L.kind === 'quote') {
      b.quote = true; b.indent = 26;
    }
    let segs2 = parseInline(content);
    if (b.level === 3) segs2 = segs2.map(s => ({ text:s.text, style:{ ...s.style, bold:true } }));
    const f = fontStr(cfg, b.size);
    let toks = tokenize(segs2);
    toks.forEach((t, i) => { t.oi = i; });
    if (b.level !== 1) toks = addMistakes(toks, S.seed + '|M|' + box.id + '|' + li);
    // Wrap to this frame's width; if the paragraph runs on to the next page, the rest is
    // wrapped again to that frame's width.
    let rest = toks, first = true;
    for (;;) {
      if (full()) yield* newSeg();
      const rows = wrap(rest, Math.max(40, seg.w - b.indent), f, b.size);
      let used = 0;
      for (const rw of rows) {
        if (used > 0 && full()) break;
        yield* push({ kind:'text', block:b, items:rw.items, w:rw.w, first:first && used === 0, src:srcOf(li, rw.items) });
        used++;
      }
      first = false;
      if (used >= rows.length) break;
      rest = rows.slice(used).flatMap(r => r.items.map(it => it.tok));
      rest[0] = { ...rest[0], spaces:0 };
    }
  }
}

let SEGS = [], PAGES = 1;
const lastRule = (s, g) => s.rows.length ? s.rows[s.rows.length - 1].ruleY : s.top + g.gap;
// Where every part goes (spec §4, layout rules 1 and 2). Pages fill in order, and each page from
// the top down, in the order of where the parts would go. A part that sits side by side with one
// already on the page starts below that one's last line (it is pushed down); if it no longer fits,
// it goes to the top of the next page. Blocks keep their own place: pushing is never stored.
function computeLayout() {
  const g = geom(), out = [], queue = new Map(), order = new Map(); // queue: page -> parts waiting to go on it
  const wait = (p, c) => { if (!queue.has(p)) queue.set(p, []); queue.get(p).push(c); };
  const resume = (c, at) => withBox(c.box, () => c.gen.next(at));
  doc.boxes.forEach((box, i) => {
    if (!order.has(box)) order.set(box, i);
    const c = { box, order:i, gen:withBox(box, () => boxParts(box, g, fontCfg(), out)) };
    c.req = resume(c).value; wait(c.req.page, c);
  });
  while (queue.size) {
    const p = Math.min(...queue.keys()); // the lowest page still waiting (pages only go up from here)
    const here = queue.get(p).sort((a, b) => a.req.top - b.req.top || (b.req.idx > 0) - (a.req.idx > 0) || a.req.x - b.req.x || a.order - b.order);
    queue.delete(p);
    const placed = [];
    for (const c of here) {
      let top = c.req.top;
      if (p < 1000) for (const s of placed) if (s.x < c.req.x + c.req.w && c.req.x < s.x + s.w) top = Math.max(top, lastRule(s, g));
      if (top > c.req.top && top + g.gap > g.maxBase) { wait(p + 1, { ...c, req:{ ...c.req, top:g.top } }); continue; } // pushed off the page
      const r = resume(c, { page:p, top }), seg = out[out.length - 1]; // this part, now filled
      if (seg.idx > 0 && !seg.rows.length) out.pop(); else placed.push(seg);
      if (!r.done) wait(r.value.page, { ...c, req:r.value });
    }
  }
  out.sort((a, b) => order.get(a.box) - order.get(b.box) || a.idx - b.idx);
  for (const s of out) s.bottom = s.rows.length ? s.rows[s.rows.length - 1].ruleY + g.gap * 0.35 : s.top + g.gap * 1.1;
  SEGS = out;
  let maxP = 0; for (const s of SEGS) maxP = Math.max(maxP, s.page);
  PAGES = Math.max(doc.pageCount, maxP + 1);
  return { segs:SEGS, pages:PAGES };
}

// A margin note is written slightly tilted, between 1° and 3° anticlockwise (radians; 0 for other blocks).
const tiltNow = sg => sg.box.kind === 'note' ? -(1 + 2 * rng(S.seed, 'note', sg.box.id)()) * Math.PI / 180 : 0;
export const segTilt = sg => withBox(sg.box, () => tiltNow(sg));
const segMid = sg => [sg.x + sg.w / 2, (sg.top + sg.bottom) / 2];
// The word under a point on a part (page units), as { li, tok } like a row's src. Words are taken
// where wrap() measured them, without the hand's wobble; the nearest one on the row wins.
export const hitWord = (sg, x, y) => withBox(sg.box, () => hitWordNow(sg, x, y));
function hitWordNow(sg, x, y) {
  if (!sg.rows.length) return null;
  const t = tiltNow(sg);
  if (t) { // undo the note's tilt
    const [cx, cy] = segMid(sg), dx = x - cx, dy = y - cy, c = Math.cos(-t), s = Math.sin(-t);
    x = cx + dx * c - dy * s; y = cy + dx * s + dy * c;
  }
  const g = geom();
  const r = sg.rows.find(rw => rw.ruleY + g.gap * 0.25 >= y) || sg.rows[sg.rows.length - 1];
  if (r.kind !== 'text' || !r.items.length) return { li:r.src.li, tok:0 };
  const b = r.block, f = fontStr(fontCfg(), b.size), sp = spaceW(f, b.size);
  let at = b.align === 'center' ? sg.x + (sg.w - r.w) / 2 : sg.x + b.indent, best = r.items[0], bd = Infinity;
  for (const it of r.items) {
    at += it.spaces * sp * 1.1;
    const end = at + tokW(it.tok, f, b.size) * 1.08;
    const d = x < at ? at - x : x > end ? x - end : 0;
    if (d < bd) { bd = d; best = it; }
    at = end;
  }
  return { li:r.src.li, tok:best.tok.oi != null ? best.tok.oi : 0 };
}

/* ---------- Drawing: ink ---------- */
function handLine(ctx, x1, y1, x2, y2, rnd, w, color, alpha) {
  ctx.save();
  ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const len = Math.hypot(x2 - x1, y2 - y1); const segs = Math.max(1, Math.round(len / 180));
  let px = x1 + (rnd() - .5) * 3, py = y1 + (rnd() - .5) * 1.4;
  ctx.beginPath(); ctx.moveTo(px, py);
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const nx = x1 + (x2 - x1) * t + (i === segs ? (rnd() - .5) * 3 : 0);
    const ny = y1 + (y2 - y1) * t + (rnd() - .5) * 1.6;
    const cx = (px + nx) / 2 + (rnd() - .5) * 4, cy = (py + ny) / 2 + (rnd() - .5) * 2.2;
    ctx.quadraticCurveTo(cx, cy, nx, ny); px = nx; py = ny;
  }
  ctx.stroke(); ctx.restore();
}

function highlighter(ctx, x1, y1, x2, y2, size, rnd) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(255,224,58,0.62)';
  const t = size * 0.74, b = size * 0.2; const j = () => (rnd() - .5) * 2.4;
  ctx.beginPath();
  ctx.moveTo(x1 - 4 + j(), y1 - t + j()); ctx.lineTo(x2 + 4 + j(), y2 - t + j());
  ctx.lineTo(x2 + 3 + j(), y2 + b + j()); ctx.lineTo(x1 - 3 + j(), y1 + b + j());
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function tracePath(ctx, cmds, w) {
  ctx.beginPath();
  let A = 0, f1 = 0, f2 = 0, f3 = 0, f4 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0;
  if (w) [A, f1, f2, f3, f4, p1, p2, p3, p4] = w;
  // A smooth displacement field: bends strokes without breaking curves.
  const X = (x, y) => A ? x + A * (0.7 * Math.sin(f1 * y + p1) + 0.3 * Math.sin(f2 * x + p2)) : x;
  const Y = (x, y) => A ? y + A * (0.7 * Math.sin(f3 * x + p3) + 0.3 * Math.sin(f4 * y + p4)) : y;
  for (const c of cmds) {
    switch (c.type) {
      case 'M': ctx.moveTo(X(c.x, c.y), Y(c.x, c.y)); break;
      case 'L': ctx.lineTo(X(c.x, c.y), Y(c.x, c.y)); break;
      case 'Q': ctx.quadraticCurveTo(X(c.x1, c.y1), Y(c.x1, c.y1), X(c.x, c.y), Y(c.x, c.y)); break;
      case 'C': ctx.bezierCurveTo(X(c.x1, c.y1), Y(c.x1, c.y1), X(c.x2, c.y2), Y(c.x2, c.y2), X(c.x, c.y), Y(c.x, c.y)); break;
      case 'Z': ctx.closePath(); break;
    }
  }
}

// Build a glyph outline as Path2D objects, bent by the displacement field. With split, the
// outline's edges are also sorted into steep ones (the sides of downstrokes) and the rest,
// so each can be pressed harder or lighter, the way a pen does stroke by stroke.
function glyphPaths(cmds, w, split) {
  let A = 0, f1 = 0, f2 = 0, f3 = 0, f4 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0, ox = 0;
  if (w) [A, f1, f2, f3, f4, p1, p2, p3, p4, ox = 0] = w;
  const X = (x, y) => A ? x + A * (0.7 * Math.sin(f1 * y + p1) + 0.3 * Math.sin(f2 * (x + ox) + p2)) : x;
  const Y = (x, y) => A ? y + A * (0.7 * Math.sin(f3 * (x + ox) + p3) + 0.3 * Math.sin(f4 * y + p4)) : y;
  const full = new Path2D(); const v = split ? new Path2D() : null, h = split ? new Path2D() : null;
  let sx = 0, sy = 0, cx = 0, cy = 0, last = null;
  const seg = (nx, ny, draw) => {
    if (split) {
      const steep = Math.abs(ny - cy) > Math.abs(nx - cx) * 1.15;
      const p = steep ? v : h;
      if (last !== p) { p.moveTo(X(cx, cy), Y(cx, cy)); last = p; }
      draw(p);
    }
    cx = nx; cy = ny;
  };
  for (const c of cmds) {
    switch (c.type) {
      case 'M': full.moveTo(X(c.x, c.y), Y(c.x, c.y)); sx = cx = c.x; sy = cy = c.y; last = null; break;
      case 'L': { const a = X(c.x, c.y), b = Y(c.x, c.y); full.lineTo(a, b); seg(c.x, c.y, p => p.lineTo(a, b)); break; }
      case 'Q': { const a1 = X(c.x1, c.y1), b1 = Y(c.x1, c.y1), a = X(c.x, c.y), b = Y(c.x, c.y);
        full.quadraticCurveTo(a1, b1, a, b); seg(c.x, c.y, p => p.quadraticCurveTo(a1, b1, a, b)); break; }
      case 'C': { const a1 = X(c.x1, c.y1), b1 = Y(c.x1, c.y1), a2 = X(c.x2, c.y2), b2 = Y(c.x2, c.y2), a = X(c.x, c.y), b = Y(c.x, c.y);
        full.bezierCurveTo(a1, b1, a2, b2, a, b); seg(c.x, c.y, p => p.bezierCurveTo(a1, b1, a2, b2, a, b)); break; }
      case 'Z': full.closePath(); if (cx !== sx || cy !== sy) { const a = X(sx, sy), b = Y(sx, sy); seg(sx, sy, p => p.lineTo(a, b)); } last = null; break;
    }
  }
  return { full, v, h };
}

const hexRgb = h => { const n = parseInt(String(h).replace('#', ''), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
// Fill an outline, then grow it (stroke) or shrink it (erase along the edge) to a new width.
function weighted(c, P, d, dv, dh) {
  c.fill(P.full);
  if (P.v && (dv !== d || dh !== d)) {
    for (const [p, dd] of [[P.v, dv], [P.h, dh]]) if (dd < -0.0005) { c.globalCompositeOperation = 'destination-out'; c.lineWidth = -dd; c.stroke(p); }
    c.globalCompositeOperation = 'source-over';
    for (const [p, dd] of [[P.v, dv], [P.h, dh]]) if (dd > 0.0005) { c.lineWidth = dd; c.stroke(p); }
  } else if (d < -0.0005) { c.globalCompositeOperation = 'destination-out'; c.lineWidth = -d; c.stroke(P.full); c.globalCompositeOperation = 'source-over'; }
  else if (d > 0.0005) { c.lineWidth = d; c.stroke(P.full); }
}

// Letters of a line are drawn onto three layers in turn, so neighbours never share one:
// thinning a letter's strokes (erasing along its edge) can't bite into the letter beside it.
// Ink is opaque colour mixed toward white; the ink layer is multiplied onto the paper, so
// this looks the same as see-through ink without fill and edge doubling up where they overlap.
const LAYERS = [0, 1, 2].map(() => { const c = document.createElement('canvas'); c.width = c.height = 64; return c; });
const LCTX = LAYERS.map(c => c.getContext('2d'));

// pen: { px: line width in page units, bold: extra width for bold, flow: 0..~1.1, dn: downstroke weight,
//        pAt(x): pressure -1..1, m: page transform, rgb: ink colour }
function prepGlyph(op, ink, pen) {
  const m = pen.m;
  const cs = Math.cos(op.rot || 0), sn = Math.sin(op.rot || 0), z = op.size;
  // page transform x translate x rotate x [sx 0 k sy] x scale(size)
  const ra = cs * op.sx, rb = sn * op.sx, rc = (cs * op.k - sn * op.sy), rd = (sn * op.k + cs * op.sy);
  const A = (m.a * ra + m.c * rb) * z, B = (m.b * ra + m.d * rb) * z, C = (m.a * rc + m.c * rd) * z, D = (m.b * rc + m.d * rd) * z;
  const E = m.a * op.x + m.c * op.y + m.e, F = m.b * op.x + m.d * op.y + m.f;

  const ns = ENG.ns;
  const p = pen.pAt ? pen.pAt(op.x) : 0;           // pressure along the line, -1..1
  const target = Math.max(0.35, (pen.px || ns * z * pen.weight) * (1 + 0.2 * Math.min(1, pen.flow) * p) + (op.bold ? pen.bold : 0));
  const d = Math.max(-0.82 * ns, target / z - ns); // grow (+) or shrink (-) the font's own stroke, in em
  const press = pen.flow * pen.dn;
  const dv = press ? Math.max(-0.85 * ns, d + press * 0.55 * target / z) : d;   // downstrokes: heavier
  const dh = press ? Math.max(-0.85 * ns, d - press * 0.45 * target / z) : d;   // side strokes and joins: lighter
  const grow = Math.max(0, d, dv, dh) / 2 + (ink.halo ? 0.9 / z : 0);

  const [bx0, by0, bx1, by1] = ENG.bounds(op.gi);
  const pad = (op.w ? op.w[0] : 0) + grow + 0.02;
  // Device-space box of the padded outline box (an affine map sends corners to corners).
  const u0 = bx0 - pad, u1 = bx1 + pad, v0 = by0 - pad, v1 = by1 + pad;
  const x0 = E + Math.min(A * u0, A * u1) + Math.min(C * v0, C * v1), x1 = E + Math.max(A * u0, A * u1) + Math.max(C * v0, C * v1);
  const y0 = F + Math.min(B * u0, B * u1) + Math.min(D * v0, D * v1), y1 = F + Math.max(B * u0, B * u1) + Math.max(D * v0, D * v1);
  if (!(x1 > x0) || x1 - x0 > 3000 || y1 - y0 > 3000) return null;
  const a = Math.min(1, op.a * ink.a) * (1 - 0.12 * Math.min(1, pen.flow) * (1 - p) / 2);
  const pr = pen.flow > 0.01 && pen.pAt ? pen.pAt(op.x + (bx1 - bx0) * z) : p;
  return { op, A, B, C, D, E, F, z, d, dv, dh, press, p, pr, a, bx0, bx1, x0, y0, x1, y1 };
}
function drawPrepped(c, g, ox, oy, ink, pen) {
  const rgb = pen.rgb;
  const mix = al => `rgb(${Math.round(255 - al * (255 - rgb[0]))},${Math.round(255 - al * (255 - rgb[1]))},${Math.round(255 - al * (255 - rgb[2]))})`;
  const P = glyphPaths(ENG.cmds(g.op.gi), g.op.w, g.press > 0.02);
  c.setTransform(g.A, g.B, g.C, g.D, g.E - ox, g.F - oy);
  let style = mix(g.a);
  if (pen.flow > 0.01) { // ink thins where the pen lifts a little: shade across the letter toward the lighter side
    const k = 0.3 * Math.min(1, pen.flow);
    style = c.createLinearGradient(g.bx0, 0, g.bx1, 0);
    style.addColorStop(0, mix(g.a * (1 - k * (1 - g.p) / 2))); style.addColorStop(1, mix(g.a * (1 - k * (1 - g.pr) / 2)));
  }
  c.fillStyle = style; c.strokeStyle = style;
  weighted(c, P, g.d, g.dv, g.dh);
  if (ink.halo) { // ink soaking into the fibres around the line
    c.globalCompositeOperation = 'destination-over'; c.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(g.a * ink.halo).toFixed(3)})`;
    c.lineWidth = Math.max(0.4 / g.z, Math.max(g.d, 0) + 1.2 / g.z); c.stroke(P.full);
    c.globalCompositeOperation = 'source-over';
  }
}
function paintRun(ctx, ops, ink, pen) {
  const gs = [];
  let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
  for (const op of ops) {
    if (op.t === 'path' && ENG) {
      const g = prepGlyph(op, ink, pen); if (!g) continue;
      gs.push(g);
      if (g.x0 < ux0) ux0 = g.x0; if (g.y0 < uy0) uy0 = g.y0; if (g.x1 > ux1) ux1 = g.x1; if (g.y1 > uy1) uy1 = g.y1;
    } else paintOp(ctx, op, ink, pen);
  }
  if (!gs.length) return;
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const ox = Math.max(0, Math.floor(ux0) - 2), oy = Math.max(0, Math.floor(uy0) - 2);
  const w = Math.min(cw, Math.ceil(ux1) + 2) - ox, h = Math.min(ch, Math.ceil(uy1) + 2) - oy;
  if (w <= 0 || h <= 0) return;
  const used = Math.min(3, gs.length);
  for (let i = 0; i < used; i++) {
    const L = LAYERS[i], c = LCTX[i];
    if (L.width < w || L.height < h) { L.width = Math.max(L.width, Math.ceil(w / 64) * 64); L.height = Math.max(L.height, Math.ceil(h / 64) * 64); }
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, w, h);
    c.lineJoin = 'round'; c.lineCap = 'round';
  }
  gs.forEach((g, i) => drawPrepped(LCTX[i % 3], g, ox, oy, ink, pen));
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < used; i++) ctx.drawImage(LAYERS[i], 0, 0, w, h, ox, oy, w, h);
  ctx.restore();
}

function paintOp(ctx, op, ink, pen) { // letters the glyph engine can't draw (other scripts, no font file)
  const a = Math.min(1, op.a * ink.a);
  ctx.save();
  ctx.translate(op.x, op.y);
  if (op.rot) ctx.rotate(op.rot);
  ctx.transform(op.sx, 0, op.k, op.sy, 0, 0);
  ctx.globalAlpha = a;
  ctx.fillText(op.ch, 0, 0);
  const lw = op.bold ? pen.bold : 0;
  if (lw > 0.08) { ctx.lineWidth = lw; ctx.strokeText(op.ch, 0, 0); }
  if (ink.halo) { ctx.globalAlpha = a * ink.halo; ctx.lineWidth = lw + 1.1; ctx.strokeText(op.ch, 0, 0); }
  ctx.restore();
}

// Turn a run of text into drawing operations, one per letter.
function emitText(ops, text, x0, f, size, p, rnd) {
  let x = x0; const tr = p.tr || 0;
  if (p.whole) {
    ops.push({ t:'text', ch:text, x, y:p.yAt(x) + p.wDy + (x - p.wordX) * p.wRot, rot:p.wRot + Math.atan(p.dAt(x)), sx:p.wSc, sy:p.wSc, k:p.wK || 0, a:p.wA, bold:p.bold, size });
    return x + canvasW(text, f) * p.wSc + (tr ? tr * graphemes(text).length : 0);
  }
  // Joined-up hands: letters move together so the joins between them stay connected.
  const j = p.conn ? 0.22 : 1, wob = p.wob * j;
  let prev = null, prevIdx = -1;
  for (const ch of graphemes(text)) {
    const gi = ENG ? ENG.gi(ch) : 0;
    const op = {
      x:x + (rnd() - .5) * 1.3 * wob,
      y:p.yAt(x) + p.wDy + (x - p.wordX) * p.wRot + (rnd() - .5) * 2.6 * wob,
      rot:p.wRot + Math.atan(p.dAt(x)) + (rnd() - .5) * 0.12 * wob,
      sx:p.wSc * (1 + (rnd() - .5) * 0.1 * wob), sy:p.wSc * (1 + (rnd() - .5) * 0.13 * wob),
      k:(p.wK || 0) + (rnd() - .5) * 0.14 * wob, a:p.wA * (0.9 + rnd() * 0.1), bold:p.bold, size,
    };
    if (gi) {
      const forms = ENG.forms(gi);
      let idx = 0;
      if (p.variety > 0 && forms.length > 1 && !p.conn) {
        idx = Math.floor(rnd() * forms.length);
        if (ch === prev && idx === prevIdx) idx = (idx + 1) % forms.length; // no identical twins
      }
      op.t = 'path'; op.gi = forms[idx];
      if (p.variety > 0) {
        if (p.conn && p.ww) {
          // One smooth bend across the whole word: each letter sits somewhere different in it,
          // so repeats still differ, and neighbours bend the same way where they join.
          const ww = p.ww; const amp = ww[0] * (0.85 + rnd() * 0.3);
          op.w = [amp, ww[1], ww[2], ww[3], ww[4], ww[5], ww[6], ww[7], ww[8], (x - p.wordX) / size];
        } else {
          const A = 0.085 * p.variety * (0.6 + rnd() * 0.8);
          op.w = [A, 5 + rnd() * 5, 5 + rnd() * 5, 5 + rnd() * 5, 5 + rnd() * 5, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, 0];
        }
      }
      ops.push(op);
      x += ENG.adv(op.gi) * size * p.wSc * (p.wTr || 1) + tr;
      prevIdx = idx;
    } else {
      op.t = 'text'; op.ch = ch; ops.push(op);
      x += canvasW(ch, f) * p.wSc * (p.wTr || 1) + tr;
      prevIdx = -1;
    }
    prev = ch;
  }
  return x;
}

// Smooth 1-D value noise in [-1, 1]: neighbouring lines share a similar drift.
function vnoise(key, t) {
  const i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f);
  const a = rng(key, i)() * 2 - 1, b = rng(key, i + 1)() * 2 - 1;
  return a + (b - a) * s;
}

function drawText(ctx, r, seg, g, cfg, ink) {
  const b = r.block; const f = fontStr(cfg, b.size); const bid = seg.box.id;
  const L = seg.x, R = seg.x + seg.w;
  const rr = rng(S.seed, 'L', bid, r.gid);
  const fat = 1 + 0.35 * Math.min(1, Math.max(0, (r.ruleY - g.top) / (g.maxBase - g.top))); // looser further down
  const mess = (S.mess / 100) * fat, wob = (S.wobble / 100) * fat, variety = S.variety / 100;
  // How the hand moves along this line. Neighbouring lines drift together, the way a
  // real writer's lines slowly climb or sag, and no line is perfectly straight.
  const nk = S.seed + '|' + bid, k = r.gid;
  const slopeBias = (rng(S.seed, 'B', bid)() - .5) * 0.008;
  const slope = mess * (slopeBias + 0.009 * vnoise(nk + 's', k * 0.45) + (rr() - .5) * 0.004);
  const lineDy = mess * (2.6 * vnoise(nk + 'd', k * 0.5 + 3) + (rr() - .5) * 1.6);
  const A1 = mess * (1.0 + rr() * 1.6), w1 = 2 * Math.PI / (260 + rr() * 260), p1 = rr() * 6.283;
  const A2 = mess * (0.35 + rr() * 0.6), w2 = 2 * Math.PI / (90 + rr() * 80), p2 = rr() * 6.283;
  const lineSc = 1 + 0.035 * mess * vnoise(nk + 'z', k * 0.3 + 7);
  const xDrift = mess * (6 * vnoise(nk + 'x', k * 0.3 + 11) + (rr() - .5) * 4);
  let x0 = b.align === 'center' ? L + (R - L - r.w) / 2 + (rr() - .5) * 12 * mess : L + b.indent + xDrift;
  const yAt = x => r.ruleY - g.gap * 0.13 + lineDy + slope * (x - L) + A1 * Math.sin(x * w1 + p1) + A2 * Math.sin(x * w2 + p2);
  const dAt = x => slope + A1 * w1 * Math.cos(x * w1 + p1) + A2 * w2 * Math.cos(x * w2 + p2);

  ctx.font = f; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = ink.c; ctx.strokeStyle = ink.c; ctx.lineJoin = 'round';
  const pc = ink.pen, wt = S.weight / 100;
  const sizeK = Math.pow(b.size / 30, 0.3); // bigger writing, a touch more ink, as with a real pen
  const ns = ENG ? ENG.ns : 0.06;
  const penPx = pc.w ? pc.w * sizeK * wt : ns * b.size * wt;
  const flow = (S.flow / 100) * pc.flow;
  const pk = nk + 'p' + k;
  const pen = {
    px:pc.w ? penPx : 0, weight:wt, bold:Math.max(0.7, penPx * 0.55), flow, dn:pc.dn,
    // Pressure drifts slowly along the line, with a quicker flutter on top.
    pAt:flow > 0 ? (x => Math.max(-1, Math.min(1, 0.75 * vnoise(pk, x / 70) + 0.35 * vnoise(pk + 'f', x / 17)))) : null,
    m:ctx.getTransform(), rgb:hexRgb(ink.c),
  };
  const lw = Math.max(0.9, penPx * 1.05);

  if (b.quote) handLine(ctx, L + 9, r.ruleY - g.gap + 6, L + 9 + (rr() - .5) * 2, r.ruleY - 5, rr, lw, ink.c, 0.85 * ink.a);
  if (r.first && b.marker) {
    if (b.marker.type === 'dot') {
      const cx = x0 - 15 + (rr() - .5) * 2, cy = yAt(cx) - b.size * 0.26 + (rr() - .5) * 1.5;
      ctx.save(); ctx.globalAlpha = 0.92 * ink.a; ctx.beginPath();
      const dr = Math.max(penPx * 0.85, b.size * 0.05);
      ctx.ellipse(cx, cy, dr * (0.9 + rr() * 0.3), dr * 0.87 * (0.9 + rr() * 0.3), rr() * 3, 0, Math.PI * 2);
      ctx.fill(); ctx.restore();
    } else {
      const t = b.marker.text; const mx = x0 - 9 - textW(t, f, b.size);
      const mops = [];
      emitText(mops, t, mx, f, b.size, { yAt, dAt, wDy:(rr() - .5) * 1.5, wordX:mx, wRot:(rr() - .5) * 0.03, wSc:lineSc, wA:0.95, bold:false, wob:wob * 0.6, variety, whole:false, tr:S.track }, rr);
      paintRun(ctx, mops, ink, pen);
    }
  }
  if (!r.items.length) return;

  const sp = spaceW(f, b.size); const conn = !!cfg.conn;
  const ops = [], runs = []; const active = { ul:null, strike:null, hl:null };
  let x = x0, walk = 0;
  r.items.forEach((it, i) => {
    const tt = tokText(it.tok);
    const wr = rng(S.seed, 'W', bid, r.gid, i, tt);
    if (it.spaces) {
      let gf = 1 + (wr() - .5) * 1.0 * Math.min(mess, 1.2);   // gaps are never even
      if (wr() < 0.07 * mess) gf += 0.35 + wr() * 0.5;        // now and then a pause
      x += sp * it.spaces * Math.max(0.45, gf);
    }
    walk = Math.max(-3.5, Math.min(3.5, walk * 0.55 + (wr() - .5) * 2.8 * mess)); // words ride up and down
    const wRot = (wr() - .5) * 0.07 * mess;
    const wDy = walk + (wr() - .5) * 1.0 * mess;
    const wSc = lineSc * (1 + (wr() - .5) * 0.1 * mess);
    const wTr = conn ? 1 : 1 + (wr() - .5) * 0.14 * mess;     // cramped or loose letters (joined hands keep their joins)
    const wK = (wr() - .5) * 0.14 * mess;                     // slant shifts word to word
    const wA = 0.84 + wr() * 0.16;
    const wordX = x;
    const whole = COMPLEX.test(tt) || (!ENG && wob < 0.02);
    const ww = conn && variety > 0 ? [0.07 * variety * (0.6 + wr() * 0.8), 3 + wr() * 3, 2 + wr() * 2.5, 2 + wr() * 2.5, 3 + wr() * 3, wr() * 6.283, wr() * 6.283, wr() * 6.283, wr() * 6.283] : null;
    for (const pc of it.tok.pieces) {
      const st = pc.style; const sx0 = x;
      x = emitText(ops, pc.text, x, f, b.size, { yAt, dAt, wDy, wordX, wRot, wSc, wTr, wK, wA, bold:!!st.bold, wob, variety, whole, conn, ww, tr:S.track }, wr);
      for (const key of ['ul', 'strike', 'hl']) {
        if (st[key]) {
          if (active[key]) active[key].x2 = x;
          else { active[key] = { key, x1:sx0, x2:x, dy:wDy }; runs.push(active[key]); }
        } else active[key] = null;
      }
    }
  });

  for (const run of runs) if (run.key === 'hl') highlighter(ctx, run.x1, yAt(run.x1) + run.dy, run.x2, yAt(run.x2) + run.dy, b.size, rng(S.seed, 'H', bid, r.gid, run.x1 | 0));
  paintRun(ctx, ops, ink, pen);
  for (const run of runs) {
    const lr = rng(S.seed, 'R', bid, r.gid, run.key, run.x1 | 0);
    if (run.key === 'ul') handLine(ctx, run.x1 - 2, yAt(run.x1) + run.dy + b.size * 0.17, run.x2 + 2, yAt(run.x2) + run.dy + b.size * 0.17, lr, lw, ink.c, 0.9 * ink.a);
    if (run.key === 'strike') drawCut(ctx, run.x1, run.x2, x => yAt(x) + run.dy, b.size, lr, lw, ink);
  }
  if (b.headingUL) {
    const lr = rng(S.seed, 'HU', bid, r.gid); const off = b.size * 0.24;
    handLine(ctx, x0 - 4, yAt(x0) + off, x + 4, yAt(x) + off, lr, lw * 1.15, ink.c, 0.9 * ink.a);
    if (b.level === 1) handLine(ctx, x0 + 6, yAt(x0) + off + 5, x - 6, yAt(x) + off + 5, lr, lw * 0.9, ink.c, 0.75 * ink.a);
  }
}

// One pen stroke along a path, filled as a ribbon: thin where the pen lands and lifts,
// a little uneven in between, never a ruler-straight line of even width.
function inkStroke(ctx, pts, w, color, alpha, rnd) {
  const n = pts.length; if (n < 2) return;
  const cum = [0]; let tot = 0;
  for (let i = 1; i < n; i++) { tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(tot); }
  const ph = rnd() * 6.283, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const t = cum[i] / (tot || 1);
    const taper = Math.min(1, 0.3 + t * 7, 0.25 + (1 - t) * 5);               // lands softly, lifts quicker
    const hw = w / 2 * taper * (1 + 0.16 * Math.sin(ph + cum[i] * 0.09));      // pressure drifts along the stroke
    L.push([pts[i][0] - dy * hw, pts[i][1] + dx * hw]); R.push([pts[i][0] + dy * hw, pts[i][1] - dx * hw]);
  }
  ctx.save(); ctx.fillStyle = color; ctx.globalAlpha = alpha; ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath(); ctx.fill(); ctx.restore();
}
// The path of a quick strike through a word: a slight slope and bow, a small shake, runs past
// both ends of the word, and often a little flick where the pen comes off the paper.
function strikePath(xa, xb, base, size, rnd, lift) {
  const len = xb - xa, k = size / 30, pts = [];
  const rise = (rnd() < 0.7 ? -(0.03 + rnd() * 0.1) : 0.02 + rnd() * 0.07) * size, bow = (rnd() - .5) * size * 0.14, p1 = rnd() * 6.283, p2 = rnd() * 6.283;
  const steps = Math.max(8, Math.round(len / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = xa + len * t;
    pts.push([x, base(x) - lift + rise * (t - .5) + bow * 4 * t * (1 - t) + k * (0.5 * Math.sin(p1 + x * 0.21) + 0.28 * Math.sin(p2 + x * 0.57))]);
  }
  if (rnd() < 0.6) { // the pen lifting off
    const [lx, ly] = pts[pts.length - 1], dir = rnd() < 0.5 ? -1 : 1;
    pts.push([lx + 2 * k, ly + dir * 0.8 * k], [lx + 4 * k, ly + dir * 2.4 * k]);
  }
  return rnd() < 0.25 ? pts.reverse() : pts; // now and then struck from right to left
}
// Corner-cutting smoothing: sharp turns become tight bends, never loops.
function chaikin(pts) {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    out.push([ax * 0.78 + bx * 0.22, ay * 0.78 + by * 0.22], [ax * 0.22 + bx * 0.78, ay * 0.22 + by * 0.78]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
// Crossing a word out. People do it one of two ways, and only these two:
// a normal strike (one quick line, never ruler-straight), or a scribble that spoils the whole word:
// a hurried zigzag over it, then one or two long strokes through it that run on past the end.
function drawCut(ctx, x1, x2, base, size, rnd, lw, ink) {
  const col = ink.c, al = 0.86 * ink.a, t = Math.max(0.6, lw * 0.78), k = size / 30;
  if (rnd() < 0.7) { // a normal strike
    inkStroke(ctx, strikePath(x1 - (1 + rnd() * 5) * k, x2 + (2 + rnd() * 7) * k, base, size, rnd, size * (0.24 + rnd() * 0.08)), t, col, al, rnd);
    return;
  }
  // the scribble: up and down across the word, fast enough that the tops lean forward
  const topY = size * (0.58 + rnd() * 0.14), botY = size * rnd() * 0.06;
  const step = size * (0.13 + rnd() * 0.05), lean = step * (0.3 + rnd() * 0.25);
  const pk = []; let x = x1 - (1 + rnd() * 3) * k, up = rnd() < 0.5;
  const xEnd = x2 + (1 + rnd() * 4) * k;
  while (x < xEnd) {
    pk.push([x + (up ? lean : 0) + (rnd() - .5) * step * 0.3, base(x) - (up ? topY * (0.75 + rnd() * 0.35) : botY + rnd() * size * 0.12)]);
    x += step * (0.6 + rnd() * 0.8); up = !up;
  }
  const sm = chaikin(chaikin(pk)), zz = []; // rounded at the turns, never loops
  for (let i = 0; i < sm.length - 1; i++) { // filled in with a little shake
    const [ax, ay] = sm[i], [bx, by] = sm[i + 1], st = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 2.5));
    for (let j = 0; j < st; j++) { const u = j / st; zz.push([ax + (bx - ax) * u, ay + (by - ay) * u + (rnd() - .5) * 0.5 * k]); }
  }
  zz.push(sm[sm.length - 1]);
  inkStroke(ctx, zz, t * 0.95, col, al, rnd);
  const n = rnd() < 0.55 ? 2 : 1; // then struck through, running on past the word
  for (let q = 0; q < n; q++) {
    const lift = size * (0.28 + q * 0.17 + rnd() * 0.08);
    inkStroke(ctx, strikePath(x1 - (2 + rnd() * 6) * k, x2 + (6 + rnd() * 16) * k, base, size, rnd, lift), t, col, al, rnd);
  }
}

function drawHr(ctx, r, seg, g, ink) {
  const rr = rng(S.seed, 'HR', seg.box.id, r.gid); const y = r.ruleY - g.gap * 0.45;
  handLine(ctx, seg.x + 4, y + (rr() - .5) * 2, seg.x + seg.w - 8, y + (rr() - .5) * 3, rr, Math.max(1, (ink.pen.w || S.size * 0.05) * S.weight / 100), ink.c, 0.85 * ink.a);
}

let inkGrainC = null;
function inkGrainTile() {
  if (inkGrainC) return inkGrainC;
  const n = 128; const c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'); const img = x.createImageData(n, n); const d = img.data;
  for (let i = 0; i < n * n; i++) if (Math.random() < 0.22) d[i * 4 + 3] = 70 + Math.floor(Math.random() * 185);
  x.putImageData(img, 0, 0); inkGrainC = c; return c;
}
function segBounds(sg) {
  return { ox:sg.x - PAD.l, oy:sg.top - PAD.t, w:sg.w + PAD.l + PAD.r, h:(sg.bottom - sg.top) + PAD.t + PAD.b };
}
// Draw one box segment onto its own transparent canvas; it is later multiplied onto the paper.
function renderSegment(canvas, sg, scale) { return withBox(sg.box, () => renderSegmentNow(canvas, sg, scale)); }
function renderSegmentNow(canvas, sg, scale) {
  const g = geom(), cfg = fontCfg(), ink = inkCfg(); const bb = segBounds(sg);
  const W = Math.max(1, Math.round(bb.w * scale)), H = Math.max(1, Math.round(bb.h * scale));
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, -bb.ox * scale, -bb.oy * scale);
  const tilt = tiltNow(sg);
  if (tilt) { const [cx, cy] = segMid(sg); ctx.translate(cx, cy); ctx.rotate(tilt); ctx.translate(-cx, -cy); } // a margin note, around its centre
  for (const r of sg.rows) {
    if (r.kind === 'text') drawText(ctx, r, sg, g, cfg, ink);
    else if (r.kind === 'hr') drawHr(ctx, r, sg, g, ink);
  }
  // Ballpoint and pencil never lay down perfectly even ink.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = ink.grain;
  const pat = ctx.createPattern(inkGrainTile(), 'repeat');
  if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  return bb;
}

/* ---------- Drawing: paper ---------- */
let grainC = null;
function grainTile() {
  if (grainC) return grainC;
  const n = 200; const c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'); const img = x.createImageData(n, n); const d = img.data;
  for (let i = 0; i < n * n; i++) {
    const r = Math.random(), o = i * 4;
    if (r < 0.55) { d[o] = 72; d[o + 1] = 62; d[o + 2] = 48; d[o + 3] = Math.floor(Math.random() * Math.random() * 44); }
    else if (r < 0.7) { d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.floor(Math.random() * 70); }
  }
  x.putImageData(img, 0, 0); grainC = c; return c;
}
function printedLine(ctx, x1, y1, x2, y2, color, width, rnd, strength) {
  const len = Math.hypot(x2 - x1, y2 - y1); if (!len) return;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len, nx = -uy, ny = ux;
  ctx.save(); ctx.strokeStyle = color; ctx.lineCap = 'butt';
  ctx.globalAlpha = 0.08 * strength; ctx.lineWidth = width * 2.8;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const p1 = rnd() * 6.28, p2 = rnd() * 6.28, step = 20;
  let px = x1, py = y1;
  ctx.lineWidth = width;
  for (let t = step; t < len + step; t += step) {
    const tt = Math.min(len, t);
    const off = Math.sin(tt * 0.012 + p1) * 0.16 + (rnd() - .5) * 0.07;
    const qx = x1 + ux * tt + nx * off, qy = y1 + uy * tt + ny * off;
    ctx.globalAlpha = Math.max(0.2, Math.min(1, strength * (0.66 + 0.22 * Math.sin(tt * 0.021 + p2) + rnd() * 0.12)));
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
    px = qx; py = qy;
  }
  ctx.restore();
}
function drawFibers(ctx, rnd) {
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 0; i < 240; i++) {
    const x = rnd() * PAGE_W, y = rnd() * PAGE_H, len = 3 + rnd() * 10, a = rnd() * Math.PI, bend = (rnd() - .5) * 4;
    ctx.strokeStyle = rnd() < 0.3 ? 'rgba(255,255,255,0.45)' : `rgba(110,98,78,${(0.04 + rnd() * 0.07).toFixed(3)})`;
    ctx.lineWidth = 0.25 + rnd() * 0.45;
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo((x + ex) / 2 + bend * Math.sin(a), (y + ey) / 2 - bend * Math.cos(a), ex, ey); ctx.stroke();
  }
  ctx.restore();
}
const GHOST = 'eeettaaoinnsshrrdlucmwfgypbvk';
function drawGhost(ctx, g, rnd) {
  const cfg = fontCfg(); const ink = inkCfg(); const size = S.size * cfg.scale; const f = fontStr(cfg, size);
  ctx.save(); ctx.translate(PAGE_W, 0); ctx.scale(-1, 1); // writing on the back, seen through the sheet
  ctx.fillStyle = ink.c; ctx.font = f;
  for (let y = g.top + g.gap; y <= g.maxBase; y += g.gap) {
    if (rnd() < 0.3) continue;
    let x = 112 + rnd() * 14; const end = PAGE_W - 60 - (rnd() < 0.3 ? rnd() * 380 : rnd() * 40);
    const by0 = y - g.gap * 0.13 + (rnd() - .5) * 2.5, gs = (rnd() - .5) * 0.01, x1 = x;
    while (x < end) {
      const by = by0 + gs * (x - x1);
      const n = 2 + Math.floor(rnd() * 7);
      for (let k = 0; k < n && x < end; k++) {
        const ch = GHOST[Math.floor(rnd() * GHOST.length)];
        const gi = ENG ? ENG.gi(ch) : 0;
        ctx.globalAlpha = 0.015 + rnd() * 0.012;
        if (gi) { ctx.save(); ctx.translate(x, by + (rnd() - .5)); ctx.scale(size, size); tracePath(ctx, ENG.cmds(gi), null); ctx.fill(); ctx.restore(); x += ENG.adv(gi) * size; }
        else { ctx.fillText(ch, x, by); x += canvasW(ch, f); }
      }
      x += size * (0.3 + rnd() * 0.25);
    }
  }
  ctx.restore();
}
function drawHoles(ctx) {
  const holes = [0.16, 0.5, 0.84].map(f => [34, PAGE_H * f]);
  ctx.save(); ctx.globalCompositeOperation = 'destination-out';
  for (const [x, y] of holes) { ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.save();
  for (const [x, y] of holes) {
    ctx.strokeStyle = 'rgba(60,50,35,0.28)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, 11.5, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 12.8, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  }
  ctx.restore();
}
function drawSpiralEdge(ctx, rnd) {
  const pts = [];
  ctx.save(); ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.moveTo(0, 0);
  for (let y = 0; y <= PAGE_H; y += 4) {
    const x = 5 + Math.sin(y * 0.26) * 1.2 + (rnd() - .5) * 2.4 + (rnd() < 0.05 ? rnd() * 3 : 0);
    pts.push([x, y]); ctx.lineTo(x, y);
  }
  ctx.lineTo(0, PAGE_H); ctx.closePath(); ctx.fill();
  for (let y = 26; y < PAGE_H - 14; y += 24) { ctx.beginPath(); ctx.ellipse(19, y, 4.6, 6.2, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.save(); ctx.strokeStyle = 'rgba(70,60,45,0.22)'; ctx.lineWidth = 0.9;
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  for (let y = 26; y < PAGE_H - 14; y += 24) { ctx.beginPath(); ctx.ellipse(19, y, 5, 6.6, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}
function drawCrease(ctx, rnd) {
  const y0 = PAGE_H * (0.49 + rnd() * 0.03);
  ctx.save(); ctx.translate(PAGE_W / 2, y0); ctx.rotate((rnd() - .5) * 0.01);
  const gr = ctx.createLinearGradient(0, -24, 0, 24);
  gr.addColorStop(0, 'rgba(60,50,35,0)'); gr.addColorStop(0.42, 'rgba(60,50,35,0.06)'); gr.addColorStop(0.5, 'rgba(60,50,35,0.15)');
  gr.addColorStop(0.53, 'rgba(255,255,255,0.6)'); gr.addColorStop(0.64, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gr; ctx.fillRect(-PAGE_W, -24, PAGE_W * 2, 48);
  ctx.restore();
}
function drawLighting(ctx, rnd) {
  ctx.save(); ctx.globalCompositeOperation = 'multiply';
  const lx = rnd() < 0.5 ? 0 : PAGE_W;
  const lg = ctx.createLinearGradient(lx, 0, PAGE_W - lx, PAGE_H);
  lg.addColorStop(0, 'rgb(255,255,255)'); lg.addColorStop(0.55, 'rgb(250,249,245)'); lg.addColorStop(1, 'rgb(238,234,225)');
  ctx.fillStyle = lg; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  const rg = ctx.createRadialGradient(PAGE_W * (0.35 + rnd() * 0.3), PAGE_H * (0.3 + rnd() * 0.2), PAGE_H * 0.2, PAGE_W * 0.5, PAGE_H * 0.5, PAGE_H * 0.85);
  rg.addColorStop(0, 'rgb(255,255,255)'); rg.addColorStop(1, 'rgb(230,226,217)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.restore();
}
function drawEdges(ctx) {
  const e = 7; ctx.save();
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0,0,e,0, 0,0,e,PAGE_H], [PAGE_W,0,PAGE_W-e,0, PAGE_W-e,0,e,PAGE_H], [0,0,0,e, 0,0,PAGE_W,e], [0,PAGE_H,0,PAGE_H-e, 0,PAGE_H-e,PAGE_W,e]]) {
    const gr = ctx.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(80,70,50,0.1)'); gr.addColorStop(1, 'rgba(80,70,50,0)');
    ctx.fillStyle = gr; ctx.fillRect(rx, ry, rw, rh);
  }
  ctx.restore();
}
function paperKey(i, pxW) {
  return [S.paper, S.paper === 'photo' && photoReady, S.gap, S.lighting, S.ghost, S.crease, S.holes, S.ghost ? [S.font, inkColor(), S.size, ENG ? 1 : 0].join(',') : '', Math.round(pxW), i].join('|');
}
// The photographed sheet: scaled to cover the page, so the sheet fills it with a little cloth
// showing at the edges. The photo brings its own light and texture, so none is added.
const PHOTO = new Image();
let photoReady = false;
export const PHOTO_URL = `${BASE}paper/photo.webp`;
PHOTO.onload = () => { photoReady = true; notify(); }; PHOTO.src = PHOTO_URL;
function paintPhoto(ctx, g, i) {
  if (photoReady) {
    const s = Math.max(PAGE_W / PHOTO.naturalWidth, PAGE_H / PHOTO.naturalHeight);
    const w = PHOTO.naturalWidth * s, h = PHOTO.naturalHeight * s;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(PHOTO, (PAGE_W - w) / 2, (PAGE_H - h) / 2, w, h);
  }
  if (S.ghost) drawGhost(ctx, g, rng('ghost', i, S.seed));
  if (S.crease) drawCrease(ctx, rng('crease', i));
}
function paintPaper(canvas, i, pxW) {
  const g = geom(); const P = g.P;
  const W = Math.round(pxW), H = Math.round(pxW * PAGE_H / PAGE_W);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); const sc = W / PAGE_W;
  ctx.setTransform(sc, 0, 0, sc, 0, 0);
  const rnd = rng('paper', S.paper, i);
  const [br, bgc, bb] = P.bg;
  ctx.fillStyle = `rgb(${br},${bgc},${bb})`; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  if (P.photo) { paintPhoto(ctx, g, i); return; }
  // Soft, uneven tone, like pulp that never dries perfectly flat.
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  for (const [nx, ny, amt] of [[7, 10, 6], [22, 31, 4]]) {
    const m = document.createElement('canvas'); m.width = nx; m.height = ny; const mx = m.getContext('2d');
    for (let yy = 0; yy < ny; yy++) for (let xx = 0; xx < nx; xx++) {
      const d = rnd() * amt; mx.fillStyle = `rgb(${255 - d | 0},${255 - d * 0.95 | 0},${255 - d * 1.25 | 0})`; mx.fillRect(xx, yy, 1, 1);
    }
    ctx.drawImage(m, -PAGE_W * 0.05, -PAGE_H * 0.05, PAGE_W * 1.1, PAGE_H * 1.1);
  }
  ctx.restore();
  if (S.ghost) drawGhost(ctx, g, rng('ghost', i, S.seed));
  const pat = ctx.createPattern(grainTile(), 'repeat');
  if (pat) {
    if (pat.setTransform && typeof DOMMatrix === 'function') pat.setTransform(new DOMMatrix([0.5, 0, 0, 0.5, 0, 0]));
    ctx.fillStyle = pat; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  }
  drawFibers(ctx, rnd);
  if (P.grid) {
    const st = g.gap / 2; let k = 0;
    for (let y = g.top % st; y < PAGE_H; y += st, k++) printedLine(ctx, 0, y, PAGE_W, y, P.grid, 0.6, rnd, Math.abs(y - g.top) % g.gap < 1 ? 0.85 : 0.6);
    for (let x = g.left % st; x < PAGE_W; x += st) printedLine(ctx, x, 0, x, PAGE_H, P.grid, 0.6, rnd, 0.6);
  }
  if (P.rule) for (let y = g.top; y <= g.maxBase + 0.5; y += g.gap) printedLine(ctx, 0, y + 0.5, PAGE_W, y + 0.5, P.rule, 0.95, rnd, 0.95);
  if (P.margin) {
    printedLine(ctx, g.marginX, 0, g.marginX, PAGE_H, P.margin, 1.1, rnd, 0.95);
    if (P.double) printedLine(ctx, g.marginX + 4, 0, g.marginX + 4, PAGE_H, P.margin, 1.1, rnd, 0.95);
  }
  if (S.crease) drawCrease(ctx, rng('crease', i));
  if (S.lighting) drawLighting(ctx, rng('light', i));
  drawEdges(ctx);
  if (P.spiral) drawSpiralEdge(ctx, rnd);
  else if (S.holes && P.holes) drawHoles(ctx);
}

// A full page for export: paper, then every box's ink multiplied on top.
function composePage(i, pxW) {
  const W = Math.round(pxW), H = Math.round(pxW * PAGE_H / PAGE_W), sc = W / PAGE_W;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const p = document.createElement('canvas'); paintPaper(p, i, W); ctx.drawImage(p, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  for (const sg of SEGS) if (sg.page === i) {
    const c = document.createElement('canvas'); const bb = renderSegment(c, sg, sc);
    ctx.drawImage(c, Math.round(bb.ox * sc), Math.round(bb.oy * sc));
  }
  ctx.globalCompositeOperation = 'source-over';
  return out;
}

/* ---------- Camera tilt for downloads ---------- */
// No photo or scan of a page is perfectly square: turn it a fraction of a degree and crop the
// edges a little unevenly. Each page gets its own random angle; Reshuffle picks new ones.
function frameShot(src, i) {
  if (!S.tilt) return src;
  const W = src.width, H = src.height, rnd = rng('tilt', S.seed, i);
  const a = (0.3 + rnd() * 0.6) * (rnd() < 0.5 ? -1 : 1) * Math.PI / 180;
  const c = Math.cos(a), sn = Math.sin(a), ac = Math.abs(sn);
  const cover = Math.max(c + (H / W) * ac, c + (W / H) * ac);   // just enough zoom that no corner shows empty
  const z = cover + 0.004 + rnd() * 0.01;                         // and a little more, so the edges are cut
  let dx = (rnd() * 2 - 1) * (z - cover) * W * 0.5, dy = (rnd() * 2 - 1) * (z - cover) * H * 0.4; // off-centre: each edge cut differently
  const fits = () => [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([px, py]) => {
    const x = px * W / 2 - dx, y = py * H / 2 - dy;               // a frame corner, in the turned page's own terms
    return Math.abs(x * c + y * sn) <= z * W / 2 && Math.abs(-x * sn + y * c) <= z * H / 2;
  });
  for (let t = 0; t < 8 && !fits(); t++) { dx /= 2; dy /= 2; }
  if (!fits()) dx = dy = 0;
  const avg = document.createElement('canvas'); avg.width = avg.height = 1;
  const ac2 = avg.getContext('2d'); ac2.drawImage(src, 0, 0, 1, 1); const px = ac2.getImageData(0, 0, 1, 1).data;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const o = out.getContext('2d');
  o.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`; o.fillRect(0, 0, W, H);
  o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
  o.translate(W / 2 + dx, H / 2 + dy); o.rotate(a); o.scale(z, z);
  o.drawImage(src, -W / 2, -H / 2);
  return out;
}

/* ---------- Scan looks for downloads ---------- */
// Turn a finished page into what a scanner or a scanning app would hand back.
function applyLook(src, i) {
  const look = S.look; if (!['scan', 'gray', 'bw'].includes(look)) return src;
  const W = src.width, H = src.height, k = W / PAGE_W; // device pixels per page unit
  const rnd = rng('scan', S.seed, i, look);
  let seed = (hashStr(S.seed + '|' + i + '|' + look) | 1) >>> 0;
  const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };

  // The glass under the sheet takes the paper's own tone, so flattening turns both white.
  const t = document.createElement('canvas'); t.width = 8; t.height = 11;
  const tc = t.getContext('2d'); tc.drawImage(src, 0, 0, 8, 11);
  const td = tc.getImageData(0, 0, 8, 11).data; let bi = 0, bl = -1;
  for (let p = 0; p < td.length; p += 4) { const l = td[p] * .299 + td[p + 1] * .587 + td[p + 2] * .114; if (l > bl) { bl = l; bi = p; } }

  // 1. The sheet lies a little crooked on the glass, and the scanner's optics soften it slightly.
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const o = out.getContext('2d');
  o.fillStyle = `rgb(${td[bi]},${td[bi + 1]},${td[bi + 2]})`; o.fillRect(0, 0, W, H);
  const ang = S.tilt ? 0 : (rnd() - .5) * 0.011, dx = S.tilt ? 0 : (rnd() - .5) * 6 * k, dy = S.tilt ? 0 : (rnd() - .5) * 5 * k;
  o.save(); o.translate(W / 2 + dx, H / 2 + dy); o.rotate(ang);
  o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
  const canBlur = typeof o.filter === 'string';
  if (canBlur) o.filter = `blur(${(0.32 * k).toFixed(2)}px)`;
  o.drawImage(src, -W / 2, -H / 2);
  if (canBlur) o.filter = 'none';
  if (!S.tilt) { o.strokeStyle = 'rgba(70,70,70,0.32)'; o.lineWidth = 0.8 * k; o.strokeRect(-W / 2, -H / 2, W, H); } // the sheet's edge
  o.restore();

  // 2. Estimate the bare paper under the writing: shrink the page, keep the brightest nearby
  //    patch (thin ink and printed lines drop out), and stretch it back as a smooth light map.
  const mw = Math.max(32, Math.round(W / 5)), mh = Math.max(32, Math.round(H / 5));
  const mid = document.createElement('canvas'); mid.width = mw; mid.height = mh;
  const mc = mid.getContext('2d'); mc.imageSmoothingEnabled = true; mc.imageSmoothingQuality = 'high'; mc.drawImage(out, 0, 0, mw, mh);
  const sw = Math.max(16, Math.round(W / 20)), sh = Math.max(16, Math.round(H / 20));
  const sm = document.createElement('canvas'); sm.width = sw; sm.height = sh;
  const sc = sm.getContext('2d'); sc.imageSmoothingEnabled = true; sc.imageSmoothingQuality = 'high'; sc.drawImage(mid, 0, 0, sw, sh);
  const sdat = sc.getImageData(0, 0, sw, sh); const sd = sdat.data;
  let L = new Float32Array(sw * sh);
  for (let q = 0; q < sw * sh; q++) L[q] = sd[q * 4] * .299 + sd[q * 4 + 1] * .587 + sd[q * 4 + 2] * .114;
  for (let pass = 0; pass < 3; pass++) {
    const N = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      let m = 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(sh - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(sw - 1, x + 1); xx++) { const v = L[yy * sw + xx]; if (v > m) m = v; }
      N[y * sw + x] = m;
    }
    L = N;
  }
  for (let q = 0; q < sw * sh; q++) { const v = Math.round(L[q]); sd[q * 4] = sd[q * 4 + 1] = sd[q * 4 + 2] = v; sd[q * 4 + 3] = 255; }
  sc.putImageData(sdat, 0, 0);
  const bgc = document.createElement('canvas'); bgc.width = W; bgc.height = H;
  const bx = bgc.getContext('2d'); bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = 'high'; bx.drawImage(sm, 0, 0, W, H);
  const bd = bx.getImageData(0, 0, W, H).data;

  // 3. Flatten the light, then the look's own tone curve, plus a little sensor noise.
  //    The paper's tint is balanced out too, the way a scanner's white calibration does.
  const pl = td[bi] * .299 + td[bi + 1] * .587 + td[bi + 2] * .114 || 1;
  const wr = Math.min(1.25, pl / Math.max(1, td[bi])), wg = Math.min(1.25, pl / Math.max(1, td[bi + 1])), wb = Math.min(1.25, pl / Math.max(1, td[bi + 2]));
  const img = o.getImageData(0, 0, W, H); const d = img.data;
  const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  for (let p = 0; p < d.length; p += 4) {
    const f = 250 / Math.max(50, bd[p]);
    let r = d[p] * f, g = d[p + 1] * f, b = d[p + 2] * f;
    if (look === 'scan') {
      r *= wr; g *= wg; b *= wb;
      const l = r * .299 + g * .587 + b * .114;
      r = l + (r - l) * 0.88; g = l + (g - l) * 0.88; b = l + (b - l) * 0.88; // scanners wash colour out a touch
      const n = (rand() - .5) * 5;
      r = 255 * Math.pow(Math.max(0, Math.min(1, (r - 12) / 236)), 1.12) + n;
      g = 255 * Math.pow(Math.max(0, Math.min(1, (g - 12) / 236)), 1.12) + n;
      b = 255 * Math.pow(Math.max(0, Math.min(1, (b - 12) / 236)), 1.12) + n;
    } else {
      let l = (r * .299 + g * .587 + b * .114) / 255;
      if (look === 'gray') l = 255 * Math.pow(Math.max(0, Math.min(1, (l * 255 - 14) / 232)), 1.18) + (rand() - .5) * 5;
      else l = 255 * smooth(0.5, 0.72, l + (rand() - .5) * 0.06); // toner: on or off, softened at the edges
      r = g = b = l;
    }
    d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
  }
  o.putImageData(img, 0, 0);

  // 4. Finishing marks: a soft shadow from the scanner lid, and for copies a few toner specks.
  o.save();
  const sh0 = o.createLinearGradient(0, 0, 0, H * 0.012);
  sh0.addColorStop(0, look === 'bw' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.16)'); sh0.addColorStop(1, 'rgba(0,0,0,0)');
  o.fillStyle = sh0; o.fillRect(0, 0, W, H * 0.012);
  if (look === 'bw') {
    o.fillStyle = '#000';
    const n = Math.round(W * H / 90000);
    for (let s2 = 0; s2 < n; s2++) {
      const edge = rand() < 0.5, x = edge ? (rand() < 0.5 ? rand() * 0.06 : 1 - rand() * 0.06) * W : rand() * W;
      o.globalAlpha = 0.35 + rand() * 0.5;
      o.beginPath(); o.arc(x, rand() * H, (0.25 + rand() * 0.9) * k, 0, Math.PI * 2); o.fill();
    }
  }
  o.restore();
  return out;
}


/* ---------- What a drawing depends on (so unchanged pages aren't redrawn) ---------- */
export const settingsKey = () => [S.font, inkColor(), S.tip, S.weight, S.flow, S.track, S.words, S.mistakes, S.size, S.gap, S.mess, S.wobble, S.variety, S.seed, S.paper, ENG ? ENG.id : '-'].join('|');
export const segId = sg => sg.box.id + ':' + sg.idx;
export const segSig = sg => sg.rows.map(r => r.kind !== 'text' ? r.kind + r.gid + ':' + r.ruleY
  : [r.gid, r.ruleY, r.first ? 1 : 0, JSON.stringify(r.block), r.items.map(it => it.spaces + '\u0001' + it.tok.pieces.map(p => p.text + '\u0002' + JSON.stringify(p.style)).join('\u0003')).join('\u0004')].join('|')).join('\n');
export const inkKey = (sg, px) => [withBox(sg.box, settingsKey), px.toFixed(3), sg.x, sg.w, sg.top, sg.box.id, segSig(sg)].join('|');

/* ---------- A box's parts on each page ---------- */
export const framesOf = box => SEGS.filter(sg => sg.box === box).sort((a, b) => a.idx - b.idx);
// Move or resize one page's part. The first part is the box itself; later parts keep their own place.
export function setFrame(sg, patch) {
  const box = sg.box;
  if (sg.idx === 0) { Object.assign(box, patch); return; }
  box.frames = { ...(box.frames || {}) };
  box.frames[sg.idx] = { ...(box.frames[sg.idx] || {}), ...patch };
}
// Where a line's words begin, after any heading, list or note marker.
// (as an index into the line as typed, where a tab counts as one character)
const contentStart = line => {
  const want = parseLine(line).prefix; let ex = 0, i = 0;
  while (i < line.length && ex < want) { ex += line[i] === '\t' ? 4 : 1; i++; }
  return i;
};
export function srcOffset(text, src) {
  const lines = text.split('\n'); let off = 0;
  if (src.li >= lines.length) return text.length;
  for (let i = 0; i < src.li; i++) off += lines[i].length + 1;
  if (!src.tok) return off;
  const line = lines[src.li], re = /\S+/g; re.lastIndex = contentStart(line);
  let m, n = 0;
  while ((m = re.exec(line))) { if (n === src.tok) return off + m.index; n++; }
  return off + line.length;
}
// The stretch of the box's text that a page's part shows.
export function frameRange(box, idx) {
  const fs = framesOf(box), i = fs.findIndex(sg => sg.idx === idx);
  const at = j => fs[j] && fs[j].rows.length ? srcOffset(box.text, fs[j].rows[0].src) : box.text.length;
  return [i <= 0 ? 0 : at(i), i >= 0 && i + 1 < fs.length ? at(i + 1) : box.text.length];
}
// Markup still open at the end of a piece of a line (so a split can close and reopen it).
function openMarks(s) {
  s = hideEsc(s);
  const open = []; const re = /\*\*|~~|==|\*|_/g; let m;
  while ((m = re.exec(s))) {
    if (m[0] === '_' && /\w/.test(s[m.index - 1] || '') && /\w/.test(s[m.index + 1] || '')) continue;
    const i = open.lastIndexOf(m[0]); if (i >= 0) open.splice(i, 1); else open.push(m[0]);
  }
  return open;
}
// The box's text without what this page's part shows; what follows moves up.
export function textWithoutFrame(box, idx) {
  const t = box.text, [a, b] = frameRange(box, idx);
  const midA = a > 0 && t[a - 1] !== '\n', midB = b < t.length && b > 0 && t[b - 1] !== '\n';
  const join = midA && midB ? (t.slice(a, b).includes('\n') ? '\n' : ' ') : '';
  return t.slice(0, a).replace(/[ \t]+$/, '') + join + t.slice(b).replace(/^[ \t]+/, '');
}
// Cut the box where this page's part begins: from there on it becomes a text box of its own.
// Changes the box in place and returns the new box (not yet added to the document).
export function splitAtFrame(box, sg, newId) {
  const k = sg.idx, text = box.text, [start] = frameRange(box, k);
  let head = text.slice(0, start), tail = text.slice(start);
  if (start > 0 && text[start - 1] !== '\n') { // the page starts mid-paragraph
    const ls = text.lastIndexOf('\n', start - 1) + 1, line = text.slice(ls, start), cs = contentStart(line);
    const marks = openMarks(line.slice(cs));
    head = head.replace(/\s+$/, '') + marks.slice().reverse().join('');
    const keep = /^(#{1,3}\s+|\s*>\s?)/.test(line) ? line.slice(0, cs).trim() + ' ' : ''; // headings and notes carry on; list items continue as plain text
    tail = keep + marks.join('') + tail.replace(/^[ \t]+/, '');
  }
  head = head.replace(/(\n[ \t]*\\newpage[ \t]*)+\s*$/, '').replace(/\s+$/, '');
  tail = tail.replace(/^[ \t]*\\newpage[ \t]*\n/, '');
  const frames = {}, keepFr = {};
  for (const [i, f] of Object.entries(box.frames || {})) { if (+i > k) frames[+i - k] = f; else if (+i < k) keepFr[i] = f; }
  box.text = head; box.frames = keepFr;
  return { id:newId, page:sg.page, x:sg.x, y:sg.top, w:sg.w, text:tail, style:{ ...(box.style || {}) }, shuffle:box.shuffle || 0, frames };
}

/* ---------- Downloads ---------- */
// The name downloads get: the typed file name, or else one made from the page's title.
export function autoName() {
  const m = allText().match(/^#\s+(.+)$/m);
  const t = (m ? m[1] : 'assignment').replace(/[*_~=`\[\]()]/g, '').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return t || 'assignment';
}
// Keep a typed name safe to save on any computer: no slashes or other reserved characters, no extension.
export const cleanName = n => String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/\.(pdf|png|jpe?g)$/i, '').replace(/^\.+|\.+$/g, '').trim().slice(0, 80);
export const fileBase = () => cleanName(doc.fileName) || autoName();
// A finished page as it will be downloaded: drawn at print size, tilted, then the scan look.
export const exportPage = i => applyLook(frameShot(composePage(i, PAGE_W * 2.2), i), i);
// The hands the document uses (the shared one plus any a box has of its own).
export function fontsInUse() {
  const ids = new Set([S.font]);
  for (const b of doc.boxes) if (b.style && b.style.font) ids.add(b.style.font);
  return [...ids].filter(id => FONTS.some(f => f.id === id));
}
export const clearMeasureCache = () => mCache.clear();

export {
  S as settings, fontCfg, penCfg, inkColor, inkName, familyCss, fontStr, boxSettings, hasOwnStyle, withBox,
  computeLayout, renderSegment, segBounds, paintPaper, paperKey, composePage, frameShot, applyLook,
  geom, snapX, snapY, rng,
};
