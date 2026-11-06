// Things people do to the document, ported from the handlers in Nib's earlier version, Longhand. The engine's boxes are called blocks in the interface.
import { navigate, parseHash, type Stage } from '@/app/route';
import { BOX_KEYS, uid } from '@/engine/doc.js';
import { boxSettings, clearMeasureCache, frameRange, framesOf, geom, snapX, snapY, splitAtFrame, textWithoutFrame } from '@/engine/core.js';
import type { Box, Seg, Settings } from '@/engine/types';
import { continuedName, newBlockName, nextColor } from '@/features/doc/blocks';
import { docAction, selectedBox, snapshot, toast, undoTo, update, useEditor, type ToastAction } from '@/store/editor';

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

export function deleteBox(id: string): void {
  const snap = snapshot();
  update(s => {
    s.doc.boxes = s.doc.boxes.filter(b => b.id !== id);
    if (s.selectedId === id) { s.selectedId = null; if (s.scope === 'box') s.scope = 'all'; }
  }, { history: step('delete') });
  toast('Block deleted.', undoTo(snap, id));
}

// Delete one page's part: only that page's text goes, and what follows moves up.
export function deleteFrame(sg: Seg): void {
  const box = sg.box;
  if (framesOf(box).length < 2) { deleteBox(box.id); return; }
  const snap = snapshot();
  update(s => {
    box.text = textWithoutFrame(box, sg.idx);
    if (!box.text.trim()) { s.doc.boxes = s.doc.boxes.filter(b => b !== box); s.selectedId = null; }
  }, { history: step('delete-part') });
  toast(`Text on page ${sg.page + 1} deleted; what follows moves up.`, undoTo(snap, box.id));
}

// From this page's part on, the text becomes a block of its own.
export function separateFrame(sg: Seg): void {
  if (!sg.idx) return;
  const snap = snapshot(), box = sg.box;
  update(s => {
    const nb: Box = { ...splitAtFrame(box, sg, uid()), kind: 'text', name: continuedName(box.name), color: nextColor(s.doc), from: box.id };
    s.doc.boxes.splice(s.doc.boxes.indexOf(box) + 1, 0, nb);
    s.selectedId = nb.id;
  }, { history: step('separate') });
  toast(`Page ${sg.page + 1} is now its own block.`, undoTo(snap, box.id));
}

/**
 * A new, empty block at a point on a page. With `findFree`, it starts at the left margin and looks for
 * a free line near that point so it doesn't land on writing.
 */
export function addBoxAt(at: { page: number; x: number; y: number }, segs: Seg[], findFree = false): void {
  const g = geom();
  const w = Math.min(420, g.right - g.left);
  const page = at.page;
  const nx = snapX(findFree ? g.left : at.x, g, w);
  let ny = snapY(at.y - get().S.gap * 0.6, g);
  if (findFree) {
    const busy = (yy: number) => segs.some(sg => sg.page === page && sg.x < nx + w && sg.x + sg.w > nx && sg.top < yy + g.gap * 1.3 && sg.bottom > yy + g.gap * 0.2);
    for (let d = 0; d < 40; d++) {
      const down = snapY(ny + d * g.gap, g), up = snapY(ny - d * g.gap, g);
      if (!busy(down)) { ny = down; break; }
      if (!busy(up)) { ny = up; break; }
    }
  }
  const doc = get().doc;
  const box: Box = { id: uid(), page, x: nx, y: ny, w, text: '', style: {}, shuffle: 0, frames: {}, kind: 'text', name: newBlockName(doc, 'text'), color: nextColor(doc) };
  update(s => { s.doc.boxes.push(box); s.doc.pageCount = Math.max(s.doc.pageCount, page + 1); }, { history: step('add-block') });
  editBox(box.id);
}

export function addPage(pages: number): void {
  update(s => { s.doc.pageCount = pages + 1; }, { history: step('add-page') });
}

export function removePage(i: number, segs: Seg[]): void {
  if (segs.some(sg => sg.page === i)) return;
  update(s => {
    for (const b of s.doc.boxes) if (b.page > i) b.page--;
    s.doc.pageCount = Math.max(1, s.doc.pageCount - 1);
  }, { history: step('remove-page') });
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
