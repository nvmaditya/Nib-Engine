// Engine markup ⇄ editor content (TipTap JSON), one markup line per leaf block.
// "Lossless": canonical markup (everything toMarkup writes) round-trips byte for byte, any markup
// round-trips to markup that lays out the same, and any editor content round-trips with every
// non-space character keeping its marks. The one exception: an underline that starts or ends inside
// a word, on a line that also has bold, widens to the whole word.
import type { JSONContent } from '@tiptap/core';
import { parseInline, parseLine, type InlinePiece } from '@/engine/core.js';

export type MarkName = 'bold' | 'underline' | 'strike' | 'highlight';
export interface Run { text: string; marks: MarkName[] }
type ListAttrs = { kind: '1' | 'a'; delim: '.' | ')'; start: number };

const MARKS: MarkName[] = ['bold', 'underline', 'strike', 'highlight'];
const BIT: Record<MarkName, number> = { bold: 1, underline: 2, strike: 4, highlight: 8 };
// Marks that open at the same place and reach equally far nest in this order, innermost first
// (so `==**x**==`, and underline sits inside the others).
const TIE: MarkName[] = ['underline', 'bold', 'strike', 'highlight'];
const FROM_ENGINE: Record<string, MarkName> = { bold: 'bold', ul: 'underline', strike: 'strike', hl: 'highlight' };
const DELIM: Record<Exclude<MarkName, 'underline'>, string> = { bold: '**', strike: '~~', highlight: '==' };

const isWs = (ch: string) => /\s/.test(ch);
const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

/* ---------- Inline content ---------- */

interface Ch { ch: string; m: number }

// One entry per character, with its mark set. Tabs are four spaces; line breaks can't be in a line.
function chars(runs: Run[]): Ch[] {
  const cs: Ch[] = [];
  for (const r of runs) {
    let m = 0;
    for (const k of r.marks) m |= BIT[k] ?? 0;
    for (const ch of r.text.replace(/\t/g, '    ').replace(/[\r\n\u2028\u2029]/g, ' ')) cs.push({ ch, m });
  }
  return cs;
}

const esc = (ch: string) => (/[\\*_~=`[]/.test(ch) ? '\\' + ch : ch);

// Whether a `_` next to visible character i sits at a word boundary: nothing is there, or it is not
// a letter or digit (escaped characters never count as one).
const outside = (cs: Ch[], i: number) => i < 0 || i >= cs.length || !/[A-Za-z0-9]/.test(cs[i].ch);

// Walk runs of equal marks. Close the open marks the run lacks, and every mark opened after them. Open
// the run's new marks longest-reaching first; the run's leading whitespace goes before the delimiters it
// opens. Underline is `*` ('star'), or in 'edge' `_` when both its ends sit at a word boundary.
function nest(cs: Ch[], ul: 'star' | 'edge'): string {
  type Tok = { t: 'text'; ch: string } | { t: 'mark'; span: Span };
  interface Span { mark: MarkName; start: number; end: number }
  const toks: Tok[] = [], stack: Span[] = [];
  const close = (to: number, at: number) => { while (stack.length > to) { const s = stack.pop()!; s.end = at; toks.push({ t: 'mark', span: s }); } };
  const reach = (from: number, bit: number) => { let j = from; while (j < cs.length && cs[j].m & bit) j++; return j - from; };
  let s = 0;
  while (s < cs.length) {
    let e = s;
    while (e < cs.length && cs[e].m === cs[s].m) e++;
    const m = cs[s].m, lacks = stack.findIndex(o => !(m & BIT[o.mark]));
    if (lacks >= 0) close(lacks, s);
    const fresh = MARKS.filter(k => m & BIT[k] && !stack.some(o => o.mark === k));
    let i = s;
    if (fresh.length) {
      while (i < e && isWs(cs[i].ch)) toks.push({ t: 'text', ch: cs[i++].ch });
      fresh.sort((a, b) => reach(i, BIT[b]) - reach(i, BIT[a]) || TIE.indexOf(b) - TIE.indexOf(a));
      for (const k of fresh) { const span = { mark: k, start: i, end: cs.length }; stack.push(span); toks.push({ t: 'mark', span }); }
    }
    for (; i < e; i++) toks.push({ t: 'text', ch: cs[i].ch });
    s = e;
  }
  close(0, cs.length);
  const delim = (sp: Span) => sp.mark !== 'underline' ? DELIM[sp.mark]
    : ul === 'edge' && outside(cs, sp.start - 1) && outside(cs, sp.end) ? '_' : '*';
  return toks.map(t => (t.t === 'text' ? esc(t.ch) : delim(t.span))).join('');
}

// Whitespace as it is; each word written on its own, so no mark spans a space.
function perWord(cs: Ch[]): string {
  let out = '', i = 0;
  while (i < cs.length) {
    let j = i;
    const ws = isWs(cs[i].ch);
    while (j < cs.length && isWs(cs[j].ch) === ws) j++;
    out += ws ? cs.slice(i, j).map(c => c.ch).join('') : nest(cs.slice(i, j), 'edge');
    i = j;
  }
  return out;
}

// An underline that starts or ends inside a word grows to cover the whole word.
function widenUnderline(cs: Ch[]): Ch[] {
  const out = cs.map(c => ({ ...c }));
  let i = 0;
  while (i < out.length) {
    if (isWs(out[i].ch)) { i++; continue; }
    let j = i;
    while (j < out.length && !isWs(out[j].ch)) j++;
    if (out.slice(i, j).some(c => c.m & BIT.underline)) for (let k = i; k < j; k++) out[k].m |= BIT.underline;
    i = j;
  }
  return out;
}

const maskOf = (style: InlinePiece['style']) => Object.keys(style).reduce((m, k) => m | (FROM_ENGINE[k] ? BIT[FROM_ENGINE[k]] : 0), 0);

// Same text, and every non-whitespace character carries the same marks.
function sameWords(got: InlinePiece[], cs: Ch[]): boolean {
  const back = got.flatMap(p => Array.from(p.text, ch => ({ ch, m: maskOf(p.style) })));
  return back.length === cs.length && cs.every((c, i) => c.ch === back[i].ch && (isWs(c.ch) || c.m === back[i].m));
}

// Whitespace carries no marks of its own: each space takes the marks shared by the nearest non-space
// characters on both sides (none at either end of the line). The marks of the words alone then decide
// what is written, so markup read back writes the same bytes again.
function settle(cs: Ch[]): Ch[] {
  const out = cs.map(c => ({ ...c }));
  for (let i = 0; i < out.length; i++) {
    if (!isWs(out[i].ch)) continue;
    let a = i - 1, b = i + 1;
    while (a >= 0 && isWs(cs[a].ch)) a--;
    while (b < cs.length && isWs(cs[b].ch)) b++;
    out[i].m = a >= 0 && b < cs.length ? cs[a].m & cs[b].m : 0;
  }
  return out;
}

// The first way of writing these characters that the engine parses back the same, if any.
function chain(cs: Ch[]): string | null {
  for (const write of [() => nest(cs, 'star'), () => nest(cs, 'edge'), () => perWord(cs)]) {
    const md = write();
    if (sameWords(parseInline(md), cs)) return md;
  }
  return null;
}

/** Inline markup for these runs: the first way of writing them that the engine parses back the same. */
export function inlineToMarkup(runs: Run[]): string {
  const cs = settle(chars(runs)), wide = settle(widenUnderline(cs));
  return chain(cs) ?? chain(wide) ?? perWord(wide);
}

/* ---------- Lists ---------- */

const letter = (n: number) => String.fromCharCode(97 + ((((n - 1) % 26) + 26) % 26));

/** The marker of each item of an ordered list: one counter per indent, reset by a shallower item, the first indent counting from `start`. */
export function listMarkers(list: ListAttrs, indents: number[]): string[] {
  const first = indents[0] ?? 0, count: (number | undefined)[] = [];
  return indents.map(d => {
    for (let k = d + 1; k < count.length; k++) count[k] = undefined;
    const n = (count[d] = count[d] === undefined ? (d === first ? list.start : 1) : count[d]! + 1);
    return (list.kind === 'a' ? letter(n) : String(n)) + list.delim;
  });
}

const markerNumber = (marker: string) => (/^\d/.test(marker) ? parseInt(marker, 10) : marker.charCodeAt(0) - 96);

/* ---------- Markup → editor ---------- */

function inlineContent(md: string): JSONContent[] {
  const out: JSONContent[] = [];
  for (const p of parseInline(md)) {
    if (!p.text) continue;
    const marks = MARKS.filter(k => maskOf(p.style) & BIT[k]), last = out[out.length - 1];
    if (last && (last.marks ?? []).map(m => m.type).join() === marks.join()) { last.text += p.text; continue; }
    out.push(marks.length ? { type: 'text', text: p.text, marks: marks.map(type => ({ type })) } : { type: 'text', text: p.text });
  }
  return out;
}

function textblock(type: string, md: string, attrs?: Record<string, unknown>): JSONContent {
  const content = inlineContent(md);
  return { type, ...(attrs ? { attrs } : {}), ...(content.length ? { content } : {}) };
}

const listItem = (indent: number, md: string): JSONContent => ({ type: 'listItem', attrs: { indent }, content: [textblock('paragraph', md)] });

/** Editor content for markup: each markup line becomes exactly one leaf block, in order. */
export function fromMarkup(text: string): JSONContent {
  const content: JSONContent[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const L = parseLine(raw), last = content[content.length - 1];
    switch (L.kind) {
      case 'newpage': content.push({ type: 'pageBreak' }); break;
      case 'hr': content.push({ type: 'horizontalRule' }); break;
      case 'blank': content.push({ type: 'paragraph' }); break;
      case 'heading': content.push(textblock('heading', L.content, { level: L.level })); break;
      case 'bullet': {
        const item = listItem(L.depth, L.content);
        if (last?.type === 'bulletList') last.content!.push(item); else content.push({ type: 'bulletList', content: [item] });
        break;
      }
      case 'number': {
        const kind = /^\d/.test(L.marker) ? '1' : 'a', delim = L.marker.endsWith(')') ? ')' : '.', item = listItem(L.depth, L.content);
        const a = last?.attrs as ListAttrs | undefined;
        if (last?.type === 'orderedList' && a && a.kind === kind && a.delim === delim
          && listMarkers(a, [...last.content!.map(it => it.attrs!.indent as number), L.depth]).at(-1) === L.marker) last.content!.push(item);
        else content.push({ type: 'orderedList', attrs: { start: markerNumber(L.marker), kind, delim }, content: [item] });
        break;
      }
      case 'quote': {
        const p = textblock('paragraph', L.content);
        if (last?.type === 'blockquote') last.content!.push(p); else content.push({ type: 'blockquote', content: [p] });
        break;
      }
      default: content.push(textblock('paragraph', L.content));
    }
  }
  return { type: 'doc', content };
}

/* ---------- Editor → markup ---------- */

function inlineOf(n: JSONContent | undefined): string {
  const runs: Run[] = [];
  for (const c of n?.content ?? []) {
    if (c.type !== 'text' || !c.text) continue;
    runs.push({ text: c.text, marks: (c.marks ?? []).map(m => m.type as MarkName).filter(k => k in BIT) });
  }
  return inlineToMarkup(runs);
}

// A paragraph must not read as a heading, list item, note, rule or page break. (One of only
// whitespace reads as a blank line, so it is written as one.)
function escapeLineStart(md: string): string {
  const sp = /^\s*/.exec(md)![0].length, rest = md.slice(sp);
  if (!rest) return '';
  if (sp === 0 && rest[0] === '#') return '\\' + md;
  if ('-+>'.includes(rest[0])) return md.slice(0, sp) + '\\' + rest;
  const num = /^(\d{1,3}[.)]|[a-z]\))\s/.exec(rest);
  if (num) { const k = sp + num[1].length - 1; return md.slice(0, k) + '\\' + md.slice(k); }
  return md;
}

// After a heading or list marker the engine skips all whitespace, so none is written there.
const afterMarker = (n: JSONContent) => inlineOf(n).replace(/^\s+/, '');
const indentOf = (item: JSONContent) => clampInt(item.attrs?.indent, 0, 3, 0);
const leavesIn = (n: JSONContent): JSONContent[] => (n.content ?? []).length ? n.content! : [{ type: 'paragraph' }];

function writeBlock(n: JSONContent, out: string[]): void {
  switch (n.type) {
    case 'paragraph': out.push(escapeLineStart(inlineOf(n))); return;
    case 'heading': out.push('#'.repeat(clampInt(n.attrs?.level, 1, 3, 1)) + ' ' + afterMarker(n)); return;
    case 'horizontalRule': out.push('---'); return;
    case 'pageBreak': out.push('\\newpage'); return;
    case 'bulletList':
      for (const it of n.content ?? []) for (const p of leavesIn(it)) {
        const pre = '  '.repeat(indentOf(it)) + '- ', md = afterMarker(p);
        // `- --` would read as a rule
        out.push(parseLine(pre + md).kind === 'bullet' ? pre + md : pre + md.replace(/^(\s*)-/, '$1\\-'));
      }
      return;
    case 'orderedList': {
      const kind = n.attrs?.kind === 'a' ? 'a' : '1', delim = kind === 'a' || n.attrs?.delim === ')' ? ')' : '.';
      const start = kind === 'a' ? clampInt(n.attrs?.start, 1, 26, 1) : clampInt(n.attrs?.start, 0, 999, 1);
      const items = n.content ?? [], markers = listMarkers({ kind, delim, start }, items.map(indentOf));
      items.forEach((it, i) => { for (const p of leavesIn(it)) out.push('  '.repeat(indentOf(it)) + markers[i] + ' ' + afterMarker(p)); });
      return;
    }
    case 'blockquote':
      for (const p of leavesIn(n)) { const md = inlineOf(p); out.push(md ? '> ' + md : '>'); }
      return;
    default:
      if (n.content?.some(c => c.type === 'text')) out.push(escapeLineStart(inlineOf(n)));
      else for (const c of n.content ?? []) writeBlock(c, out);
  }
}

/** Markup for editor content: one line per leaf block. */
export function toMarkup(doc: JSONContent): string {
  const out: string[] = [];
  for (const n of doc.type === 'doc' ? doc.content ?? [] : [doc]) writeBlock(n, out);
  return out.join('\n');
}

/** The words of some markup, with the markup removed and whitespace collapsed. */
export function plainText(markup: string): string {
  return markup.split('\n').map(l => parseInline(parseLine(l).content).map(p => p.text).join('')).join(' ').replace(/\s+/g, ' ').trim();
}
