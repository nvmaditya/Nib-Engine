// Restructuring a document (spec §4): split, join, remove parts, move and merge pages, add blocks.
// Each function works on the given settings and document, changes the document in place, and lays
// it out with the engine whenever it needs to know where the parts are.
//
// A block "starts on" the page its first part is shown on. Pushing (layout rule 2) can show that part
// on a later page than the one the block is stored on (box.page). Moving, merging and deleting pages go by
// what each page shows (see the comment above pageRefusal).
import { headerText, uid } from '@/engine/doc.js';
import { computeLayout, frameRange, geom, snapX, snapY, splitAtFrame, textWithoutFrame, use } from '@/engine/core.js';
import type { BlockKind, Box, EngineDoc, FrameRect, HeaderKey, Layout, Seg, Settings } from '@/engine/types';
import { continuedName, newBlockName, nextColor } from './blocks';

export type Refused = { ok: false; part: number; name: string };

export function layoutFor(S: Settings, doc: EngineDoc): Layout {
  use(S, doc);
  return computeLayout();
}

const find = (doc: EngineDoc, id: string): Box | undefined => doc.boxes.find(b => b.id === id);
const partOf = (L: Layout, box: Box, idx: number): Seg | undefined => L.segs.find(s => s.box === box && s.idx === idx);
/** Only text and margin notes take part in joining; a header's text comes from its fields. */
export const joinable = (b: Box | null | undefined): b is Box => !!b && (b.kind === 'text' || b.kind === 'note');

/** Take a block out. Blocks split from it no longer come from anywhere, or now come from `into`. */
function drop(doc: EngineDoc, gone: Set<Box>, into?: Box): void {
  if (!gone.size) return;
  doc.boxes = doc.boxes.filter(b => !gone.has(b));
  const ids = new Set([...gone].map(b => b.id));
  for (const b of doc.boxes) {
    if (b.from === undefined || !ids.has(b.from)) continue;
    if (into && into !== b) b.from = into.id; // the separator stays: it is still what lies between the two texts
    else { delete b.from; delete b.fromSep; } // it was for the block that went
  }
}

/** From part `idx` on, the block's text becomes a block of its own, placed right after it. */
export function splitBlock(S: Settings, doc: EngineDoc, boxId: string, idx: number): Box | null {
  const box = find(doc, boxId);
  if (!box || idx < 1 || box.kind === 'header') return null;
  const L = layoutFor(S, doc), sg = partOf(L, box, idx), before = partOf(L, box, idx - 1);
  if (!sg) return null;
  const color = nextColor(doc);
  const orig = box.text, [start] = frameRange(box, idx);
  const nb: Box = { ...splitAtFrame(box, sg, uid()), kind: box.kind, name: continuedName(box.name), color, from: box.id };
  // On the page right after the part before, a block above only pushed it down: the new block keeps its own place.
  if (before && sg.page === before.page + 1) nb.y = sg.storedTop;
  // At a line start, remember what the split took out between the halves (blank lines, \newpage lines), so Join back can put it back.
  if ((start === 0 || orig[start - 1] === '\n') && orig.startsWith(box.text) && orig.endsWith(nb.text)) nb.fromSep = orig.slice(box.text.length, orig.length - nb.text.length);
  doc.boxes.splice(doc.boxes.indexOf(box) + 1, 0, nb);
  return nb;
}

/**
 * After `box` was joined back into `target` (its text now starts at offset `at`): the parts after
 * `box`'s first keep their own places, and its first part's own place goes to the part it starts, if it starts one.
 */
function keepPlaces(S: Settings, doc: EngineDoc, target: Box, box: Box, at: number): void {
  layoutFor(S, doc);
  let p = 0;
  while (frameRange(target, p + 1)[0] > 0 && frameRange(target, p + 1)[0] <= at) p++;
  const frames = { ...target.frames };
  for (const [j, f] of Object.entries(box.frames)) frames[p + +j] = f;
  if (p > 0 && frameRange(target, p)[0] === at) {
    const own: FrameRect = {};
    if (box.x !== target.x) own.x = box.x;
    if (box.y !== geom().top) own.y = box.y;
    if (box.w !== target.w) own.w = box.w;
    if (Object.keys(own).length) frames[p] = { ...frames[p], ...own };
  }
  target.frames = frames;
}

/** The block's text goes on a new line at the end of the target's, and the block goes. */
export function appendToBlock(S: Settings, doc: EngineDoc, boxId: string, targetId: string): Box | null {
  const box = find(doc, boxId), target = find(doc, targetId);
  if (!joinable(box) || !joinable(target) || box === target) return null;
  const sep = box.from === target.id && box.fromSep != null ? box.fromSep : '\n';
  const at = target.text.length + sep.length, rejoin = !!target.text && box.from === target.id;
  target.text = target.text ? target.text + sep + box.text : box.text;
  if (rejoin) keepPlaces(S, doc, target, box, at);
  drop(doc, new Set([box]), target);
  return target;
}

/** Join a split block back into the block it came from. */
export function joinBack(S: Settings, doc: EngineDoc, boxId: string): Box | null {
  const box = find(doc, boxId);
  return box?.from ? appendToBlock(S, doc, boxId, box.from) : null;
}

/**
 * The block's text without what part `idx` shows (laid out just before). When that part ran to the end
 * of the text, the line break before it goes too, so no blank part is left on its page.
 */
function cutPart(box: Box, idx: number): string {
  const text = textWithoutFrame(box, idx);
  return frameRange(box, idx)[1] >= box.text.length ? text.replace(/\n$/, '') : text;
}

/** Remove only the text part `idx` shows; what follows moves up. With nothing left, the block goes. */
export function removeBlockPart(S: Settings, doc: EngineDoc, boxId: string, idx: number): 'part' | 'block' | null {
  const box = find(doc, boxId);
  if (!box) return null;
  const L = layoutFor(S, doc);
  if (!partOf(L, box, idx)) return null;
  const parts = L.segs.filter(s => s.box === box).length;
  if (parts > 1 && box.kind === 'header') return null;
  if (parts > 1) box.text = cutPart(box, idx);
  if (parts > 1 && box.text.trim()) return 'part';
  drop(doc, new Set([box]));
  return 'block';
}

export function removeBlock(doc: EngineDoc, boxId: string): Box | null {
  const box = find(doc, boxId);
  if (box) drop(doc, new Set([box]));
  return box ?? null;
}

// Two notions of a block's page. Its stored page (box.page) is where the person put it; layout rule 2
// can push its first part onto a later page without changing that. A page's own blocks are the parts it
// shows: moving, merging and deleting pages go by those, never by what is stored on a page but shown elsewhere.
// - Moving pages: a block keeps its stored place (and y, even if pushed down) when it shows on its stored
//   page, or when its stored and shown pages move alike, so layout pushes it there again. Otherwise it goes
//   with the page it shows on, pinned to where it shows.
// - Merging: the blocks that start on the page go to the page before, pinned to where they show. When the
//   page would still show the same parts (the page before is full), nothing changes.

/** A page that shows something, but no block's first part, can't move on its own: its first continuation always follows its start. */
export function pageRefusal(L: Layout, page: number): Refused | null {
  if (L.segs.some(s => s.page === page && s.idx === 0)) return null;
  const c = L.segs.find(s => s.page === page && s.idx > 0);
  return c ? { ok: false, part: c.idx + 1, name: c.box.name } : null;
}

/** The page a block starts on: where its first part is shown, or its stored page when nothing is shown. */
function startPage(L: Layout, b: Box): { page: number; seg?: Seg } {
  const seg = partOf(L, b, 0);
  return { page: seg ? seg.page : b.page, seg };
}

/** Put the block on `page`; if it was shown on another page than it is stored on, it keeps the place it is shown at. */
function place(b: Box, seg: Seg | undefined, page: number): void {
  if (seg && seg.page !== b.page) b.y = seg.top;
  b.page = page;
}

/** Where page `p` ends up when page `from` moves to position `to`. */
function moved(p: number, from: number, to: number): number {
  if (p === from) return to;
  if (from < to && p > from && p <= to) return p - 1;
  if (to < from && p >= to && p < from) return p + 1;
  return p;
}

/**
 * Move page `from` to position `to` (spec §4 rule 3): the blocks that start on it go with it, and
 * their later parts follow by rule 1. `followed` is where the first such block's next part went.
 */
export function movePage(S: Settings, doc: EngineDoc, from: number, to: number):
  { ok: true; followed: { name: string; page: number; added: boolean } | null } | Refused {
  const L = layoutFor(S, doc);
  const pages = L.pages;
  if (from === to || from < 0 || to < 0 || from >= pages || to >= pages) return { ok: true, followed: null };
  const no = pageRefusal(L, from);
  if (no) return no;
  doc.pageCount = pages;
  const going = doc.boxes.filter(b => startPage(L, b).page === from);
  const to_ = (p: number) => moved(p, from, to);
  for (const b of doc.boxes) {
    const { page: shown, seg } = startPage(L, b); // where its first part shows before the move
    if (shown === b.page || to_(shown) - shown === to_(b.page) - b.page) b.page = to_(b.page); // pushed there again
    else place(b, seg, to_(shown)); // it goes with the page it shows on
  }
  const after = layoutFor(S, doc);
  for (const b of going) {
    const next = partOf(after, b, 1);
    if (next) return { ok: true, followed: { name: b.name, page: next.page + 1, added: next.page >= pages } };
  }
  return { ok: true, followed: null };
}

/** Move a block to another page, keeping its place on the page (spec §4 rule 4: only its first part can move). */
export function moveBlockToPage(_S: Settings, doc: EngineDoc, boxId: string, idx: number, page: number): { ok: true } | Refused {
  const box = find(doc, boxId);
  if (!box) return { ok: true };
  if (idx > 0) return { ok: false, part: idx + 1, name: box.name };
  if (Number.isInteger(page) && page >= 0) box.page = page;
  return { ok: true };
}

/** The blocks that start on page `i` move onto the page before, pinned to where they show. A page left with nothing on it goes. */
function merge(S: Settings, doc: EngineDoc, i: number, L: Layout = layoutFor(S, doc)): void {
  for (const b of doc.boxes) { const st = startPage(L, b); if (st.page === i) place(b, st.seg, i - 1); }
  if (!layoutFor(S, doc).segs.some(s => s.page === i)) {
    for (const b of doc.boxes) if (b.page > i) b.page--;
    doc.pageCount = Math.max(1, L.pages - 1);
  }
}

/** The parts page `i` shows, by block id and part, in a fixed order. */
const shownOn = (L: Layout, i: number): string => JSON.stringify(L.segs.filter(s => s.page === i).map(s => [s.box.id, s.idx]).sort());

/**
 * Merge page `i` into the page before. It is tried on a copy first: when page `i` would still show exactly
 * the parts it shows now (the page before has no room for them), it is 'full' and the document is left as it is.
 */
export function mergeIntoPrevious(S: Settings, doc: EngineDoc, i: number): { ranOn: boolean } | 'full' | null {
  const L = layoutFor(S, doc);
  if (i < 1 || i >= L.pages) return null;
  const ranOn = L.segs.some(s => s.page === i && s.idx > 0), was = shownOn(L, i);
  const trial = structuredClone(doc);
  merge(S, trial, i);
  if (was !== '[]' && shownOn(layoutFor(S, trial), i) === was) { // (an empty page always goes)
    use(S, doc); // the engine lays out the document again, not the copy
    return 'full';
  }
  merge(S, doc, i, L); // (L is still the document's own layout: only the copy changed)
  return { ranOn };
}

/** A block's later parts' own places, once part `idx` and its page are gone. */
function framesWithout(frames: Record<number, FrameRect>, idx: number): Record<number, FrameRect> {
  const out: Record<number, FrameRect> = {};
  for (const [k, f] of Object.entries(frames)) if (+k !== idx) out[+k > idx ? +k - 1 : +k] = f;
  return out;
}

/** Delete page `i` and what it shows: blocks whose first part is on it go, other blocks lose that page's text. */
export function deletePage(S: Settings, doc: EngineDoc, i: number): void {
  const L = layoutFor(S, doc);
  if (i < 0 || i >= L.pages) return;
  const here = L.segs.filter(s => s.page === i);
  const gone = new Set(here.filter(s => s.idx === 0).map(s => s.box));
  const cuts = here.filter(s => s.idx > 0).map(s => ({ box: s.box, idx: s.idx, text: cutPart(s.box, s.idx) }));
  for (const { box, idx, text } of cuts) {
    box.text = text;
    box.frames = framesWithout(box.frames, idx);
    if (!text.trim()) gone.add(box);
  }
  drop(doc, gone);
  for (const b of doc.boxes) if (b.page > i) b.page--;
  doc.pageCount = Math.max(1, L.pages - 1);
}

/** A blank page at position `at`: blocks starting there or later move down a page. */
export function insertPage(S: Settings, doc: EngineDoc, at: number): void {
  const pages = layoutFor(S, doc).pages, where = Math.max(0, Math.min(pages, at));
  for (const b of doc.boxes) if (b.page >= where) b.page++;
  doc.pageCount = pages + 1;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** A date the way a header writes it: 6 November 2026. */
export const today = (now: Date = new Date()): string => `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

/** An empty block of `kind` (not yet in the document), named and coloured for it. */
function blockAt(doc: EngineDoc, kind: BlockKind, page: number, x: number, y: number, w: number): Box {
  return { id: uid(), page, x, y, w, text: '', style: {}, shuffle: 0, frames: {}, kind, name: newBlockName(doc, kind), color: nextColor(doc) };
}

/** The first ruled line from the top of the page where a block at x..x+w doesn't land on writing. */
function freeLine(L: Layout, page: number, x: number, w: number): number {
  const g = geom();
  const busy = (y: number) => L.segs.some(sg => sg.page === page && sg.x < x + w && sg.x + sg.w > x && sg.top < y + g.gap * 1.3 && sg.bottom > y + g.gap * 0.2);
  for (let y = g.top; y + g.gap <= g.maxBase; y += g.gap) if (!busy(y)) return y;
  return g.top;
}

/**
 * A new, empty block. Text blocks start at the left margin and margin notes at the right edge, each on
 * the first free line of `page`; the header goes at the top right of page 1, and a document has one.
 */
export function newBlock(S: Settings, doc: EngineDoc, kind: BlockKind, page: number): Box | 'header-exists' {
  if (kind === 'header') {
    if (doc.boxes.some(b => b.kind === 'header')) return 'header-exists';
    use(S, doc);
    const g = geom();
    const h = blockAt(doc, 'header', 0, 446, g.top - g.gap, 320);
    h.fields = { name: '', class: '', date: today() };
    h.text = headerText(h.fields);
    doc.boxes.push(h);
    return h;
  }
  const L = layoutFor(S, doc), g = geom();
  const w = kind === 'note' ? 220 : Math.min(420, g.right - g.left);
  const x = kind === 'note' ? g.right - w : g.left;
  const b = blockAt(doc, kind, page, x, freeLine(L, page, x, w), w);
  doc.boxes.push(b);
  doc.pageCount = Math.max(doc.pageCount, page + 1);
  return b;
}

/** A new, empty text block where the paper was double-clicked (page units), on the nearest ruled line. */
export function newTextBlockAt(S: Settings, doc: EngineDoc, page: number, x: number, y: number): Box {
  use(S, doc);
  const g = geom(), w = Math.min(420, g.right - g.left);
  const b = blockAt(doc, 'text', page, snapX(x, g, w), snapY(y - S.gap * 0.6, g), w);
  doc.boxes.push(b);
  doc.pageCount = Math.max(doc.pageCount, page + 1);
  return b;
}

/** A header field's value as the header keeps it: one line (typing keeps its spaces), at most 80 characters. */
export const fieldValue = (value: string): string => value.replace(/[\r\n]+/g, ' ').slice(0, 80);

/** Write a header field and the header's text with it. */
export function setHeaderField(box: Box, key: HeaderKey, value: string): void {
  if (box.kind !== 'header') return;
  box.fields = { ...box.fields, [key]: fieldValue(value) };
  box.text = headerText(box.fields);
}

/** Add or remove a header's Subject or Roll no. line. */
export function showHeaderField(box: Box, key: 'subject' | 'roll', on: boolean): void {
  if (box.kind !== 'header') return;
  const f = { ...box.fields };
  if (!on) delete f[key];
  else if (typeof f[key] !== 'string') f[key] = '';
  box.fields = f;
  box.text = headerText(f);
}
