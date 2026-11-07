// Moving a block's part by hand: dragging it, dropping it on a page, the arrow keys, and clicking a word.
import type { PointerEvent as ReactPointerEvent } from 'react';
import { PAGE_W } from '@/engine/config.js';
import { geom, hitWord, segId, setFrame, snapX, snapY, srcOffset } from '@/engine/core.js';
import type { Seg } from '@/engine/types';
import { rule4 } from '@/features/doc/actions';
import { gesture, placeCaret, toast, update, useEditor, type EditorState } from '@/store/editor';
import { edgeScroll } from '@/features/write/dnd';
import { scrollerOf } from './useNearViewport';

/** While a block is dragged nothing is redrawn and leftover transforms are kept. */
export const drag = { active: false };

/** The part as the store holds it now (the layout's part may come from before the last change). */
const live = (s: EditorState, sg: Seg): Seg | null => {
  const box = s.doc.boxes.find(b => b.id === sg.box.id);
  return box ? { ...sg, box } : null;
};

/**
 * Drop a part at (x, y) page units on `page`. Any part can move on the page it is on, and a block's first
 * part can go to another page with it. A later part over another page stays where it was and says why
 * (spec §4 rule 4). Returns whether anything moved.
 */
export function dropPart(sg: Seg, page: number, x: number, y: number): boolean {
  const g = geom();
  if (page !== sg.page && sg.idx > 0) { toast(rule4({ part: sg.idx + 1, name: sg.box.name })); return false; }
  const nx = snapX(x, g, sg.w), ny = snapY(y, g);
  const box = useEditor.getState().doc.boxes.find(b => b.id === sg.box.id);
  if (!box || !Number.isInteger(page) || page < 0) return false;
  const fr = box.frames[sg.idx]; // a later part without a frame of its own is at the block's x, on the top line
  const same = sg.idx === 0 ? box.page === page && box.x === nx && box.y === ny : (fr?.x ?? box.x) === nx && (fr?.y ?? g.top) === ny;
  if (same) return false;
  gesture('move')(s => {
    const p = live(s, sg);
    if (!p) return;
    if (sg.idx === 0) Object.assign(p.box, { page, x: nx, y: ny });
    else setFrame(p, { x: nx, y: ny });
  });
  return true;
}

/**
 * The arrow keys move a part one ruled line up or down, or 4 units sideways. Up and down move where the
 * person put it (`storedTop`), so a part pushed down by a block above still comes back when that one shrinks.
 * Returns whether the key was one of them.
 */
export function nudge(sg: Seg, key: string): boolean {
  const g = geom();
  let patch: { x: number } | { y: number };
  if (key === 'ArrowUp' || key === 'ArrowDown') patch = { y: snapY(sg.storedTop + (key === 'ArrowUp' ? -g.gap : g.gap), g) };
  else if (key === 'ArrowLeft' || key === 'ArrowRight') {
    // No pull to the margin here, or a part on the margin could never step off it.
    patch = { x: Math.round(Math.max(6, Math.min(Math.max(6, PAGE_W - sg.w - 6), sg.x + (key === 'ArrowLeft' ? -4 : 4)))) };
  } else return false;
  if ('y' in patch ? patch.y === sg.storedTop : patch.x === sg.x) return true;
  update(s => { const p = live(s, sg); if (p) setFrame(p, patch); }, { history: 'nudge:' + segId(sg) });
  return true;
}

/** A click at (x, y) page units on a part: select its block and ask for the caret at the word there. */
export function wordClick(sg: Seg, x: number, y: number): void {
  const at = hitWord(sg, x, y);
  placeCaret(sg.box.id, at ? srcOffset(sg.box.text, at) : 0);
}

/**
 * Drag a part by `frame` (its outline on a page): `move` follows the pointer, snapping to the ruled lines,
 * over any page in the same `[data-sheets]` column, and drops with `dropPart`; `resize` pulls its right
 * edge. One undo step per drag. The pages are `[data-paper]` elements whose value is the page index.
 * `onStart` is called once the pointer has moved far enough (3 px) for this to be a drag, not a click.
 */
export function startBlockDrag(e: ReactPointerEvent, sg: Seg, { s, frame, mode, onStart }:
  { s: number; frame: HTMLElement; mode: 'move' | 'resize'; onStart?: () => void }): void {
  const paperEl = frame.closest<HTMLElement>('[data-paper]');
  if (!paperEl) return;
  const fig = frame.closest<HTMLElement>('.sheet') ?? paperEl;
  const column = paperEl.closest<HTMLElement>('[data-sheets]');
  const scroller = scrollerOf(paperEl, true);
  const g = geom();
  const r0 = paperEl.getBoundingClientRect();
  const f0 = { page: sg.page, x: sg.x, y: sg.top, w: sg.w };
  const st = { x: e.clientX, y: e.clientY, w: f0.w, moved: false };
  const grabDX = (e.clientX - r0.left) / s - f0.x, grabDY = (e.clientY - r0.top) / s - f0.y;
  const head = paperEl.querySelector<HTMLElement>(`.ink-layer canvas[data-id="${segId(sg)}"]`);
  const resize = gesture('resize');
  let target = { page: f0.page, x: f0.x, y: f0.y }, raf = 0, scrollRaf = 0;
  const shift = (t: string) => { frame.style.transform = t; if (head) head.style.transform = t; };
  try { frame.setPointerCapture(e.pointerId); } catch { /* the pointer may already be gone */ }
  drag.active = mode === 'move';
  fig.classList.add('dragging'); paperEl.classList.remove('scanned');

  // The drag's part follows the pointer at (x, y): over the page under it, snapped to the ruled lines.
  const follow = (x: number, y: number) => {
    const papers = column ? [...column.querySelectorAll<HTMLElement>('[data-paper]')] : [paperEl];
    let tp = paperEl, tr = r0, best = Infinity;
    for (const p of papers) {
      const r = p.getBoundingClientRect();
      if (y < r.top - 17 || y > r.bottom + 17) continue;
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (d < best) { best = d; tp = p; tr = r; }
    }
    if (best === Infinity) tr = paperEl.getBoundingClientRect();
    const nx = snapX((x - tr.left) / s - grabDX, g, f0.w);
    const ny = snapY((y - tr.top) / s - grabDY, g);
    target = { page: best === Infinity ? f0.page : Number(tp.dataset.paper), x: nx, y: ny };
    const or = paperEl.getBoundingClientRect();
    shift(`translate(${(tr.left + nx * s) - (or.left + f0.x * s)}px,${(tr.top + ny * s) - (or.top + f0.y * s)}px)`);
  };
  // Near the top or bottom edge of what scrolls (the window, if nothing inside does), keep scrolling a frame
  // at a time while the pointer is held there, and carry the part along.
  const pointer = { x: e.clientX, y: e.clientY };
  const scrolling = () => {
    scrollRaf = requestAnimationFrame(scrolling);
    const sc = scroller ?? document.scrollingElement;
    if (sc instanceof HTMLElement && edgeScroll(sc, pointer.x, pointer.y)) follow(pointer.x, pointer.y);
  };

  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - st.x, dy = ev.clientY - st.y;
    if (!st.moved) {
      if (Math.hypot(dx, dy) < 3) return;
      st.moved = true;
      onStart?.();
      if (mode === 'move') scrollRaf = requestAnimationFrame(scrolling);
    }
    if (mode === 'resize') {
      const nw = Math.round(Math.max(60, Math.min(PAGE_W - f0.x - 6, f0.w + dx / s)));
      if (nw !== st.w) {
        st.w = nw;
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; resize(st2 => { const p = live(st2, sg); if (p) setFrame(p, { w: st.w }); }); });
      }
      return;
    }
    pointer.x = ev.clientX; pointer.y = ev.clientY;
    follow(pointer.x, pointer.y);
    const sc = scroller ?? document.scrollingElement;
    if (sc instanceof HTMLElement && edgeScroll(sc, pointer.x, pointer.y)) follow(pointer.x, pointer.y);
  };
  // Escape cancels a move: nothing is dropped, and nothing else hears the key (it would deselect the block).
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || mode !== 'move') return;
    ev.preventDefault(); ev.stopPropagation();
    end({ type: 'cancel' });
  };
  const end = (ev: { type: string }) => {
    frame.removeEventListener('pointermove', move); frame.removeEventListener('pointerup', end); frame.removeEventListener('pointercancel', end);
    window.removeEventListener('keydown', onKey, true);
    fig.classList.remove('dragging'); drag.active = false;
    if (raf) cancelAnimationFrame(raf);
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    try { if (frame.hasPointerCapture?.(e.pointerId)) frame.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (!st.moved) { shift(''); return; }
    if (mode === 'resize') { resize(st2 => { const p = live(st2, sg); if (p) setFrame(p, { w: st.w }); }); return; }
    // A refused or cancelled drop puts the part back; a drop that moves it is redrawn in its new place.
    // Either way the pages draw again, so a sheet kept drawn for the drag lets go if it is now far from view.
    if (ev.type !== 'pointerup' || !dropPart(sg, target.page, target.x, target.y)) { shift(''); update(null, { save: false, layout: false }); }
  };
  frame.addEventListener('pointermove', move); frame.addEventListener('pointerup', end); frame.addEventListener('pointercancel', end);
  window.addEventListener('keydown', onKey, true);
}
