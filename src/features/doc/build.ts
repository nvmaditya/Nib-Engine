// Documents built from text: an import written out, and a new document (spec §1, §3). Pure: each builder
// works on what it is given and returns what it made, and leaves the engine on the open document.
import { geom, snapY, use } from '@/engine/core.js';
import { DEFAULT_NAMES, HEADER_FIELDS, headerText, uid } from '@/engine/doc.js';
import type { Box, EngineDoc, Geom, HeaderFields, Layout, Seg, Settings } from '@/engine/types';
import { newBlockName, nextColor } from '@/features/doc/blocks';
import { layoutFor } from '@/features/doc/model';
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

/** Each field on one line, as a header writes it, at most 80 characters. */
function oneLine(fields: HeaderFields): HeaderFields {
  const f: HeaderFields = {};
  for (const [k] of HEADER_FIELDS) {
    const v = fields[k];
    if (typeof v === 'string') f[k] = v.replace(/[\r\n]+/g, ' ').slice(0, 80);
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

/** A full-width text block on page 1 (not added to `doc`): on the line after `below`'s last when that is on page 1, else on the top line. */
export function mainBlock(doc: EngineDoc, S: Settings, text: string, below: Box | null): Box {
  const g = geomFor(S);
  const y = below?.page === 0 ? below.y + below.text.split('\n').length * g.gap : snapY(g.top - g.gap, g);
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

/**
 * The text carries on the text block that ends the document, from the top of the page after the last,
 * or takes the place of that block's text when it has none. Trimming a block's blank end can leave
 * another one ending the document, so it is looked for again; when none ends on the last page, the
 * text is a new block on that page if nothing is on it, else on a new page after it.
 */
function appended(S: Settings, doc: EngineDoc, text: string): Imported {
  for (;;) {
    const L = layoutFor(S, doc), e = endingBlock(L, doc);
    if (!e) {
      const last = L.pages - 1, page = L.segs.some(s => s.page === last) ? L.pages : last;
      const target: Box = { ...mainBlock(doc, S, text, null), page };
      doc.boxes.push(target);
      doc.pageCount = Math.max(doc.pageCount, page + 1);
      return { S, doc, target, firstPage: page, joined: false };
    }
    const kept = trimEnd(e.text);
    if (kept !== e.text) { e.text = kept; continue; }
    // The new text starts a part of its own: no place kept for a part that is gone applies to it.
    const parts = L.segs.filter(s => s.box === e);
    e.frames = Object.fromEntries(Object.entries(e.frames).filter(([k]) => +k < parts.length));
    if (!e.text) { e.text = text; return { S, doc, target: e, firstPage: parts[0].page, joined: true }; }
    e.text += '\n\\newpage\n' + text;
    return { S, doc, target: e, firstPage: L.pages, joined: true };
  }
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
