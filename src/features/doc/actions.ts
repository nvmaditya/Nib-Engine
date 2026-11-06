// Things people do to the document, ported from the handlers in Nib's earlier version, Longhand. The engine's boxes are called blocks in the interface.
import { navigate, parseHash, type Stage } from '@/app/route';
import { BOX_KEYS, uid } from '@/engine/doc.js';
import { boxSettings, clearMeasureCache, frameRange, framesOf, geom, snapY } from '@/engine/core.js';
import type { BlockKind, Box, HeaderKey, Seg, Settings } from '@/engine/types';
import { newBlockName, nextColor } from '@/features/doc/blocks';
import {
  appendToBlock, deletePage, insertPage, joinable, joinBack, layoutFor, mergeIntoPrevious, moveBlockToPage, movePage,
  newBlock, newTextBlockAt, pageRefusal, removeBlock, removeBlockPart, setHeaderField, showHeaderField, splitBlock, type Refused,
} from '@/features/doc/model';
import { docAction, selectedBox, snapshot, toast, undoTo, update, useEditor, type EditorState, type ToastAction } from '@/store/editor';

const get = useEditor.getState;
const UI = { save: false, layout: false } as const;

// Each discrete action is its own undo step; continuous ones (typing, dragging a slider) pass a stable key.
let steps = 0;
export const step = (kind: string): string => `${kind}:${++steps}`;

/** Show a stage of the open document (editing a block from Style goes back to Write). */
function show(stage: Stage, onlyFrom?: Stage[]): void {
  const r = parseHash(location.hash);
  if (r.name !== 'doc' || r.stage === stage) return;
  if (onlyFrom && !onlyFrom.includes(r.stage)) return;
  navigate({ ...r, stage });
}

export function select(id: string | null): void {
  update(s => { s.selectedId = id; if (!id && s.scope === 'box') s.scope = 'all'; }, UI);
}

export function editBox(id: string): void {
  update(s => { s.selectedId = id; s.focusEditor++; }, UI);
  show('write', ['style', 'export']);
}

// Edit one page's part: open the editor with just that page's text selected.
export function editFrame(sg: Seg): void {
  const box = sg.box;
  const range = framesOf(box).length > 1 ? frameRange(box, sg.idx) : null;
  update(s => { s.selectedId = box.id; s.focusEditor++; s.pendingSelect = range; }, UI);
  show('write', ['style', 'export']);
}

export function styleBox(id: string): void {
  update(s => { s.selectedId = id; s.scope = 'box'; }, UI);
  show('style');
}

export function shuffleBox(id: string): void {
  update(s => { const b = s.doc.boxes.find(x => x.id === id); if (b) b.shuffle = 1 + Math.floor(Math.random() * 1e9); }, { history: step('variation') });
}

/** New random shapes: for the whole document, or only the selected block when the Style panel is set to it. */
export function newVariation(): void {
  const b = get().scope === 'box' ? selectedBox() : null;
  if (b) shuffleBox(b.id);
  else update(s => { s.S.seed = Math.floor(Math.random() * 1e9); }, { history: step('variation') });
}

/* ---------- Restructuring (spec §4): one undo step each, and a message whose Undo puts it back ---------- */

const rule4 = (r: Refused): string => `Part ${r.part} of ${r.name} always follows the part before it. Split it off first to move it on its own.`;
const layoutNow = () => { const s = get(); return layoutFor(s.S, s.doc); };
const boxById = (id: string): Box | undefined => get().doc.boxes.find(b => b.id === id);
const partAt = (boxId: string, idx: number): Seg | undefined => layoutNow().segs.find(sg => sg.box.id === boxId && sg.idx === idx);

/** A selection on a block that is gone is cleared. */
function keepSelection(s: EditorState): void {
  if (!s.selectedId || s.doc.boxes.some(b => b.id === s.selectedId)) return;
  s.selectedId = null;
  if (s.scope === 'box') s.scope = 'all';
}

/**
 * One undo step: `run` changes the document and returns what to say about it. The message's Undo goes
 * back to the document and selection from before. Callers check first that `run` will change something,
 * so a refusal or a no-op never becomes a step.
 */
function restructure(kind: string, run: (s: EditorState) => string): void {
  const snap = snapshot(), sel = get().selectedId;
  let msg = '';
  update(s => { msg = run(s); keepSelection(s); }, { history: step(kind) });
  toast(msg, undoTo(snap, sel));
}

/** From part `idx` on, the block becomes a block of its own. On the first part ("Split from the rest") it splits where part 2 begins. */
export function splitAt(boxId: string, idx: number): void {
  const at = Math.max(1, idx), sg = partAt(boxId, at);
  if (!sg || sg.box.kind === 'header') return;
  const name = sg.box.name, p = sg.page + 1;
  restructure('split', s => {
    const nb = splitBlock(s.S, s.doc, boxId, at);
    if (nb) s.selectedId = nb.id;
    return `Split “${name}”: from page ${p} on, it’s a block of its own.`;
  });
}

export function joinBackBlock(boxId: string): void {
  const b = boxById(boxId), t = b?.from ? boxById(b.from) : undefined;
  if (!joinable(b) || !joinable(t) || b === t) return;
  restructure('join', s => {
    joinBack(s.S, s.doc, boxId);
    s.selectedId = t.id;
    return `Joined “${b.name}” back into “${t.name}”.`;
  });
}

export function addToEndOf(boxId: string, targetId: string): void {
  const b = boxById(boxId), t = boxById(targetId);
  if (!joinable(b) || !joinable(t) || b === t) return;
  restructure('add-to-end', s => {
    appendToBlock(s.S, s.doc, boxId, targetId);
    s.selectedId = t.id;
    return `Added “${b.name}” to the end of “${t.name}”.`;
  });
}

/** Remove only the text part `idx` shows; the text after it moves up. A block's only part takes the block with it. */
export function removePart(boxId: string, idx: number): void {
  const L = layoutNow(), sg = L.segs.find(x => x.box.id === boxId && x.idx === idx);
  if (!sg) return;
  if (sg.box.kind === 'header' && L.segs.some(x => x.box === sg.box && x !== sg)) return;
  const name = sg.box.name, p = sg.page + 1;
  restructure('remove-part', s => removeBlockPart(s.S, s.doc, boxId, idx) === 'part'
    ? `Removed the page ${p} part of “${name}”. The text after it moves up.`
    : `Deleted “${name}”.`);
}

export function deleteBlock(boxId: string): void {
  const b = boxById(boxId);
  if (!b) return;
  restructure('delete-block', s => { removeBlock(s.doc, boxId); return `Deleted “${b.name}”.`; });
}

/** Move page `from` to position `to` (0-based); a page that only holds continuations is refused (rule 4). */
export function movePageTo(from: number, to: number): void {
  const L = layoutNow();
  if (from === to || from < 0 || to < 0 || from >= L.pages || to >= L.pages) return;
  const no = pageRefusal(L, get().doc, from);
  if (no) { toast(rule4(no)); return; }
  restructure('move-page', s => {
    const r = movePage(s.S, s.doc, from, to), f = r.ok ? r.followed : null;
    return `Moved page ${from + 1} to position ${to + 1}.`
      + (f ? ` The rest of “${f.name}” followed it onto ${f.added ? 'a new page' : 'page'} ${f.page}.` : '');
  });
}

/** Move a block's first part to another page, keeping its place there; a later part is refused (rule 4). */
export function moveBlockTo(boxId: string, idx: number, page: number): void {
  const b = boxById(boxId);
  if (!b) return;
  if (idx > 0) { toast(rule4({ ok: false, part: idx + 1, name: b.name })); return; }
  if (!Number.isInteger(page) || page < 0 || page === b.page || page >= layoutNow().pages) return;
  restructure('move-block', s => { moveBlockToPage(s.S, s.doc, boxId, idx, page); return `Moved “${b.name}” to page ${page + 1}.`; });
}

export function mergeIntoPreviousPage(i: number): void {
  if (i < 1 || i >= layoutNow().pages) return;
  restructure('merge-page', s => {
    const r = mergeIntoPrevious(s.S, s.doc, i);
    return `Merged page ${i + 1} into page ${i}.` + (r?.ranOn ? ' Text that runs on from it still continues on the next page.' : '');
  });
}

export function deletePageAt(i: number): void {
  if (i < 0 || i >= layoutNow().pages) return;
  restructure('delete-page', s => { deletePage(s.S, s.doc, i); return `Deleted page ${i + 1} and everything on it.`; });
}

/** A blank page at position `at` (0-based), or after the last page. */
export function addPageAt(at?: number): void {
  const pages = layoutNow().pages;
  const where = at === undefined ? pages : Math.max(0, Math.min(pages, Math.floor(at)));
  restructure('add-page', s => { insertPage(s.S, s.doc, where); return 'Added a blank page.'; });
}

const ADDED: Record<BlockKind, string> = { text: 'Added a text block.', note: 'Added a margin note.', header: 'Added a header block.' };

/** A new block, selected and ready to type in (a header is filled in through its fields). */
export function addBlock(kind: BlockKind, page: number): void {
  if (kind === 'header' && get().doc.boxes.some(b => b.kind === 'header')) { toast('This document already has a header block.'); return; }
  restructure('add-block', s => {
    const b = newBlock(s.S, s.doc, kind, page);
    if (b !== 'header-exists') { s.selectedId = b.id; if (kind !== 'header') s.focusEditor++; }
    return ADDED[kind];
  });
  show('write', ['style', 'export']);
}

/** A new text block where the paper was double-clicked (page units). */
export function addTextBlockAt(page: number, x: number, y: number): void {
  restructure('add-block', s => {
    const b = newTextBlockAt(s.S, s.doc, page, x, y);
    s.selectedId = b.id; s.focusEditor++;
    return ADDED.text;
  });
  show('write', ['style', 'export']);
}

/** Rename a block; an empty name keeps the old one. */
export function renameBlock(boxId: string, name: string): void {
  const b = boxById(boxId), n = name.trim().slice(0, 60).trim();
  if (!b || !n || n === b.name) return;
  update(() => { b.name = n; }, { history: step('rename'), layout: false });
}

/** Type into a header field: one undo step per burst of typing in that field. */
export function setField(boxId: string, key: HeaderKey, value: string): void {
  const b = boxById(boxId);
  if (b?.kind !== 'header' || b.fields?.[key] === value) return;
  update(() => setHeaderField(b, key, value), { history: 'field:' + boxId + ':' + key, layout: 'soon' });
}

/** Add or remove a header's Subject or Roll no. */
export function showField(boxId: string, key: 'subject' | 'roll', on: boolean): void {
  const b = boxById(boxId);
  if (b?.kind !== 'header' || (typeof b.fields?.[key] === 'string') === on) return;
  update(() => showHeaderField(b, key, on), { history: step('field') });
}

// What the Style panel shows and edits: the selected block's own settings, or the document's.
export const scopeBox = (): Box | null => (get().scope === 'box' ? selectedBox() : null);
export const view = (): Settings => { const b = scopeBox(); return b ? boxSettings(b) : get().S; };

/** Change handwriting settings (for the selected block only when the panel is set to it). */
export function setV(obj: Partial<Settings>, history: string = step('style')): void {
  update(s => {
    const b = s.scope === 'box' ? s.doc.boxes.find(x => x.id === s.selectedId) : null;
    for (const [k, v] of Object.entries(obj)) {
      if (b && BOX_KEYS.includes(k)) b.style = { ...b.style, [k]: v };
      else (s.S as unknown as Record<string, unknown>)[k] = v;
    }
    clearMeasureCache();
  }, { history });
}

/** Change a setting every page shares (paper, effects, the download look). */
export function setS<K extends keyof Settings>(k: K, v: Settings[K], opts: { layout?: 'now' | false; history?: string } = {}): void {
  update(s => { s.S[k] = v; }, { layout: opts.layout ?? 'now', history: opts.history ?? step('setting') });
}

export function resetBoxStyle(): void {
  const b = selectedBox();
  if (!b) return;
  const id = b.id, before = { style: b.style, shuffle: b.shuffle };
  update(() => { b.style = {}; b.shuffle = 0; clearMeasureCache(); }, { history: step('match') });
  const undoMatch = docAction('Undo', () => update(s => {
    const box = s.doc.boxes.find(x => x.id === id);
    if (box) Object.assign(box, before);
    clearMeasureCache();
  }, { history: step('match-undo') }));
  toast('This block matches the document again.', undoMatch);
}

// An imported document becomes one block that flows over as many pages as it needs.
export function writeOut(text: string, where: 'replace' | 'append', name: string | undefined, pages: number): { box: Box; undo: ToastAction } {
  const g = geom();
  const doc = get().doc;
  const box: Box = {
    id: uid(), page: 0, x: g.left, y: snapY(g.top - g.gap, g), w: g.right - g.left, text, style: {}, shuffle: 0, frames: {},
    kind: 'text', name: where === 'replace' ? 'Main text' : newBlockName(doc, 'text'), color: where === 'replace' ? 0 : nextColor(doc),
  };
  const snap = snapshot();
  update(s => {
    if (where === 'append') { box.page = pages; s.doc.boxes.push(box); s.doc.pageCount = pages + 1; }
    else s.doc = { pageCount: 1, boxes: [box], fileName: name || '' };
    s.selectedId = box.id; s.scope = 'all'; s.scrollToPage = box.page;
  }, { history: step('import') });
  return { box, undo: undoTo(snap, null) };
}

export function openImport(file: File | null = null): void {
  update(s => { s.importOpen = true; s.importFile = file; }, UI);
}

export function closeImport(): void {
  update(s => { s.importOpen = false; s.importFile = null; }, UI);
}

// The pages view registers how to add a block where the reader is looking.
export const pagesApi: { addBox: (() => void) | null } = { addBox: null };
