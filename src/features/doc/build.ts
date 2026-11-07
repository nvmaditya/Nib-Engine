// Documents built from text: an import written out, and a new document (spec §1, §3). Pure: each builder
// works on what it is given and returns what it made, and leaves the engine on the open document.
import { geom, snapY, use } from '@/engine/core.js';
import { DEFAULT_NAMES, HEADER_FIELDS, headerText, uid } from '@/engine/doc.js';
import type { Box, EngineDoc, Geom, HeaderFields, Layout, Seg, Settings } from '@/engine/types';
import { newBlockName, nextColor } from '@/features/doc/blocks';
import { fieldValue, layoutFor } from '@/features/doc/model';
import { lookPatch } from '@/features/style/looks';
import type { SavedLook } from '@/features/style/prefs';
import { useEditor } from '@/store/editor';

/** Where an import goes, the look it brings (`null` keeps the document's) and the Header it asks for (`null` for none). */
export interface ImportPlace { where: 'replace' | 'append'; look: SavedLook | null; header: HeaderFields | null }

/** An import written out: the settings and document to put in place, the block the text went into and the page it starts on. */
export interface Imported { S: Settings; doc: EngineDoc; target: Box; firstPage: number; joined: boolean }

const emptyDoc = (): EngineDoc => ({ pageCount: 1, boxes: [], fileName: '' });

/** Point the engine back at the open document. */
function useStore(): void {
  const s = useEditor.getState();
  use(s.S, s.doc);
}

/** The page geometry these settings give (the paper decides the left margin). */
export function geomFor(S: Settings): Geom {
  use(S, emptyDoc());
  const g = geom();
  useStore();
  return g;
}

/** A look applied to the whole document, as Style applies one, paper included. The same settings when there is none. */
export const withLook = (S: Settings, look: SavedLook | null): Settings => (look ? { ...S, ...lookPatch(look, false) } : S);

/** Each field's value as the header keeps it (as typing into the field writes it). */
function oneLine(fields: HeaderFields): HeaderFields {
  const f: HeaderFields = {};
  for (const [k] of HEADER_FIELDS) {
    const v = fields[k];
    if (typeof v === 'string') f[k] = fieldValue(v);
  }
  return f;
}

/** A Header block at the top right of page 1 (not added to `doc`). */
export function headerBlock(doc: EngineDoc, S: Settings, fields: HeaderFields): Box {
  const g = geomFor(S), f = oneLine(fields);
  return {
    id: uid(), kind: 'header', name: DEFAULT_NAMES.header, color: nextColor(doc),
    page: 0, x: 446, y: g.top - g.gap, w: 320, fields: f, text: headerText(f), style: {}, shuffle: 0, frames: {},
  };
}

/** The line after a block's last line of text. */
const lineUnder = (b: Box, gap: number): number => b.y + b.text.split('\n').length * gap;

/** A full-width text block on page 1 (not added to `doc`): on the line after `below`'s last when that is on page 1, else on the top line. */
export function mainBlock(doc: EngineDoc, S: Settings, text: string, below: Box | null): Box {
  const g = geomFor(S);
  const y = below?.page === 0 ? lineUnder(below, g.gap) : snapY(g.top - g.gap, g);
  return {
    id: uid(), kind: 'text', name: newBlockName(doc, 'text'), color: nextColor(doc),
    page: 0, x: g.left, y, w: g.right - g.left, text, style: {}, shuffle: 0, frames: {},
  };
}

/** A one-page document: the Header (if asked for), then the text as its Main text. */
export function newDocument(S: Settings, text: string, header: HeaderFields | null): EngineDoc {
  const doc = emptyDoc();
  if (header) doc.boxes.push(headerBlock(doc, S, header));
  doc.boxes.push(mainBlock(doc, S, text, doc.boxes[0] ?? null));
  return doc;
}

/** Of the text blocks whose last part is on the last page, the one whose last part ends lowest. */
export function endingBlock(L: Layout, doc: EngineDoc): Box | null {
  const last = new Map<string, Seg>();
  for (const s of L.segs) last.set(s.box.id, s); // parts come in order, so the last one stays
  let best: { box: Box; end: Seg } | null = null;
  for (const box of doc.boxes) {
    const end = last.get(box.id);
    if (box.kind !== 'text' || !end || end.page !== L.pages - 1) continue;
    if (!best || end.bottom > best.end.bottom) best = { box, end };
  }
  return best?.box ?? null;
}

const NEWPAGE = /^\\newpage[ \t]*$/;
/** The text without its trailing blank lines and `\newpage` lines. */
function trimEnd(text: string): string {
  const ls = text.split('\n');
  while (ls.length && (!ls[ls.length - 1].trim() || NEWPAGE.test(ls[ls.length - 1]))) ls.pop();
  return ls.join('\n');
}

/** The document becomes the Header (only if asked for; the one it has keeps its place) and one Main text. */
function replaced(S: Settings, doc: EngineDoc, text: string, header: HeaderFields | null): Imported {
  const out: EngineDoc = { pageCount: 1, boxes: [], fileName: doc.fileName };
  const had = doc.boxes.find(b => b.kind === 'header');
  if (header) {
    const f = oneLine(header);
    out.boxes.push(had ? { ...had, fields: f, text: headerText(f) } : headerBlock(out, S, header));
  }
  const target = mainBlock(out, S, text, out.boxes[0] ?? null);
  out.boxes.push(target);
  return { S, doc: out, target, firstPage: 0, joined: false };
}

/** Where a part's writing ends: its last ruled line. */
const lastLine = (s: Seg, gap: number): number => (s.rows.length ? s.rows[s.rows.length - 1].ruleY : s.top + gap);

/**
 * The line an empty text block can take the text from, where it is, without pushing anything on its
 * page: its own line, or the line under a Header block that starts level with it or above it. Null
 * when anything else on its page is beside or below it, or it isn't shown on the page it is kept on.
 */
function inPlace(S: Settings, L: Layout, e: Box): number | null {
  const at = L.segs.find(s => s.box === e && s.idx === 0);
  if (!at || at.page !== e.page) return null;
  let y = e.y;
  for (const s of L.segs) {
    if (s.box === e || s.page !== at.page || lastLine(s, S.gap) <= e.y) continue; // wholly above its line
    if (s.box.kind !== 'header' || s.idx > 0 || s.box.page !== at.page || s.storedTop > e.y) return null;
    y = Math.max(y, lineUnder(s.box, S.gap));
  }
  return y;
}

/**
 * The text carries on the text block that ends the document, from the top of the page after the last,
 * or takes the place of that block's text when it has none and nothing on its page would be pushed.
 * The block's blank end is trimmed first. That can leave another block ending the document, so it is
 * looked for again; only the block the text goes into stays trimmed. When none ends on the last page,
 * the text is a new block on that page if nothing is on it, else on a new page after it.
 */
function appended(S: Settings, doc: EngineDoc, text: string): Imported {
  const untrimmed = new Map<Box, string>();
  let e = endingBlock(layoutFor(S, doc), doc);
  while (e && trimEnd(e.text) !== e.text) {
    if (!untrimmed.has(e)) untrimmed.set(e, e.text);
    e.text = trimEnd(e.text);
    e = endingBlock(layoutFor(S, doc), doc);
  }
  const putBack = (keep: Box | null) => { for (const [b, t] of untrimmed) if (b !== keep) b.text = t; };
  putBack(e);
  let L = layoutFor(S, doc);
  if (e) {
    const parts = L.segs.filter(s => s.box === e), y = e.text ? e.y : inPlace(S, L, e);
    // Still the end of the document once the other blocks have their blank ends back.
    if (y !== null && parts[parts.length - 1].page === L.pages - 1) {
      // The new text starts a part of its own: no place kept for a part that is gone applies to it.
      e.frames = Object.fromEntries(Object.entries(e.frames).filter(([k]) => +k < parts.length));
      if (!e.text) { e.y = y; e.text = text; return { S, doc, target: e, firstPage: parts[0].page, joined: true }; }
      e.text += '\n\\newpage\n' + text;
      return { S, doc, target: e, firstPage: L.pages, joined: true };
    }
    if (untrimmed.has(e)) { putBack(null); L = layoutFor(S, doc); }
  }
  const last = L.pages - 1, page = L.segs.some(s => s.page === last) ? L.pages : last;
  const target: Box = { ...mainBlock(doc, S, text, null), page };
  doc.boxes.push(target);
  doc.pageCount = Math.max(doc.pageCount, page + 1);
  return { S, doc, target, firstPage: page, joined: false };
}

/**
 * Write an import out (Design decision 3) on a copy of the document, with the look applied. The
 * arguments are left as they are, and the engine is put back on the open document; the caller's
 * `update` lays out what it puts in place.
 */
export function importInto(S: Settings, doc: EngineDoc, text: string, place: ImportPlace): Imported {
  const S2 = withLook(S, place.look), copy = structuredClone(doc);
  try {
    return place.where === 'replace' ? replaced(S2, copy, text, place.header) : appended(S2, copy, text);
  } finally {
    useStore();
  }
}
