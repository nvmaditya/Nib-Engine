// Dragging pages and blocks between pages with pointer events, for mouse and touch alike (plan, Design
// decision 4). Grips start a drag after 4 px of movement. Items (Outline's blocks) do too with a mouse,
// but with touch they need a still hold, so a quick swipe still scrolls the list. Drop targets are
// `[data-drop-page]` elements (or a header's `[data-drop-field]` rows), found under the pointer; the one
// being aimed at gets `data-drop`.
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface DropTarget {
  /** The page, or the header field row, under the pointer. */
  page: number;
  after: boolean;
}
export type DragKind = 'grip' | 'item';
type Gate = 'wait' | 'go' | 'scroll';

/** How far a mouse, or any pointer on a grip, moves before a drag starts (px). */
const SLOP = 4;
/** Touch on an item: a hold this long (ms) that moves less than HOLD_SLOP px starts a drag; moving more first scrolls. */
const HOLD_MS = 350, HOLD_SLOP = 8;
/** The scroller scrolls while the pointer is this close to its top or bottom edge (px), up to MAX_SPEED px a frame. */
const EDGE = 48, MAX_SPEED = 18;

/**
 * Drop targets: before/after lines for pages and header field rows, a dashed fill for blocks. Grips: no browser panning,
 * so a touch on them drags straight away.
 */
export const dropClass = 'data-[drop=before]:shadow-[inset_0_3px_0_var(--accent)] data-[drop=after]:shadow-[inset_0_-3px_0_var(--accent)] data-[drop=on]:bg-primary-soft data-[drop=on]:outline-dashed data-[drop=on]:outline-2 data-[drop=on]:-outline-offset-2 data-[drop=on]:outline-primary';
export const gripClass = 'touch-none cursor-grab select-none';

/** Whether a press has become a drag yet ('go'), may still become one ('wait'), or has left the list to scroll. */
export function gate(kind: DragKind, pointerType: string): { move(dx: number, dy: number, ms: number): Gate } {
  const hold = kind === 'item' && (pointerType === 'touch' || pointerType === 'pen');
  let state: Gate = 'wait';
  return {
    move(dx, dy, ms) {
      if (state !== 'wait') return state;
      const d = Math.hypot(dx, dy);
      if (!hold) state = d >= SLOP ? 'go' : 'wait';
      else if (d >= HOLD_SLOP) state = 'scroll';
      else if (ms >= HOLD_MS) state = 'go';
      return state;
    },
  };
}

/** What a drag drops on: pages (`[data-drop-page]`), or a header's field rows (`[data-drop-field]`). */
export type DropTargets = 'page' | 'field';

function hit(x: number, y: number, targets: DropTargets): { el: HTMLElement; t: DropTarget } | null {
  const at = document.elementFromPoint(x, y);
  const el = at instanceof Element ? at.closest<HTMLElement>(targets === 'field' ? '[data-drop-field]' : '[data-drop-page]') : null;
  const page = el ? Number(targets === 'field' ? el.dataset.dropField : el.dataset.dropPage) : NaN;
  if (!el || !Number.isInteger(page)) return null;
  const r = el.getBoundingClientRect();
  return { el, t: { page, after: y > r.top + r.height / 2 } };
}

/**
 * The drop target under a point: the closest `[data-drop-page]` (or, for `field`, `[data-drop-field]`), `after`
 * when the point is below its middle.
 */
export const targetAt = (x: number, y: number, targets: DropTargets = 'page'): DropTarget | null => hit(x, y, targets)?.t ?? null;

/** What follows the pointer while dragging: `text`, after a dot of `color` if there is one. */
export function dragGhost(text: string, color?: string): HTMLElement {
  const g = document.createElement('div');
  g.className = 'flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-semibold text-fg shadow-lg';
  if (color) {
    const dot = document.createElement('span');
    dot.className = 'size-[9px] flex-none rounded-[3px]';
    dot.style.background = color;
    g.append(dot);
  }
  g.append(text);
  return g;
}

/** Where page `from` goes (0-based) when dropped before or after page `over`. */
export function pageDropIndex(from: number, over: number, after: boolean): number {
  const to = after ? over + 1 : over;
  return to > from ? to - 1 : to;
}

/** The nearest ancestor that really scrolls, or the page itself. */
function scrollerOf(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

// iOS Safari honours preventDefault only in a touchmove listener that was there before the touch
// began, so this one stays. It stops the page scrolling only while a touch drag is active.
let touchLock = false;
if (typeof window !== 'undefined') {
  window.addEventListener('touchmove', e => { if (touchLock && e.cancelable) e.preventDefault(); }, { passive: false });
}

let busy = false; // one drag at a time

/**
 * Near `scroller`'s top or bottom edge (EDGE px), scroll it a step, faster the closer (`x`, `y` is the pointer;
 * the page's own scroll if `scroller` is the document's). Returns whether it moved. Call it once a frame.
 */
export function edgeScroll(scroller: HTMLElement, x: number, y: number): boolean {
  const root = scroller === document.scrollingElement || scroller === document.documentElement;
  const r = root ? { top: 0, bottom: innerHeight, left: 0, right: innerWidth } : scroller.getBoundingClientRect();
  if (x < r.left || x > r.right) return false;
  const v = y < r.top + EDGE ? -Math.min(1, (r.top + EDGE - y) / EDGE) : y > r.bottom - EDGE ? Math.min(1, (y - r.bottom + EDGE) / EDGE) : 0;
  if (!v) return false;
  const before = scroller.scrollTop;
  scroller.scrollTop += Math.round(v * MAX_SPEED) || Math.sign(v);
  return scroller.scrollTop !== before;
}

export interface DragOptions {
  kind: DragKind;
  /** What it drops on: pages (the default), or a header's field rows. */
  targets?: DropTargets;
  /** What follows the pointer once the drag starts (it is added to the page, and taken away at the end). */
  ghost: () => HTMLElement;
  /** The target under the pointer changed (null: none). */
  onMove?(t: DropTarget | null): void;
  /** Dropped on `t`, or on nothing (null), which is also what Escape and a cancelled pointer give. */
  onDrop(t: DropTarget | null): void;
  /** The drag has started. Returning false refuses it: no ghost, and no drop. */
  onStart?(): void | false;
}

/**
 * Call from a pointerdown handler. Nothing happens until the press becomes a drag (see `gate`); a
 * press that never does stays a click. While dragging, the ghost follows the pointer, the target
 * under it is marked with `data-drop` ("before"/"after" for a grip, "on" for an item), the nearest
 * scroller scrolls near its edges, and `document.body.dataset.dragging` is set.
 */
export function startDrag(e: ReactPointerEvent, opts: DragOptions): void {
  const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
  if (busy || (touch && !e.isPrimary) || (e.pointerType === 'mouse' && e.button !== 0)) return; // one finger, the main button
  busy = true;
  const src = e.currentTarget as HTMLElement, id = e.pointerId, targets = opts.targets ?? 'page';
  const x0 = e.clientX, y0 = e.clientY, t0 = performance.now(), g = gate(opts.kind, e.pointerType);
  const body = document.body, bodyStyle = { userSelect: body.style.userSelect, cursor: body.style.cursor };
  let x = x0, y = y0, active = false, raf = 0;
  let ghost: HTMLElement | null = null, marked: HTMLElement | null = null, target: DropTarget | null = null;
  let scroller: HTMLElement | null = null;

  const place = () => { if (ghost) ghost.style.transform = `translate3d(${x + 12}px, ${y + 12}px, 0)`; };
  const retarget = () => {
    const h = hit(x, y, targets), t = h?.t ?? null;
    const mark = !h ? null : opts.kind === 'item' ? 'on' : h.t.after ? 'after' : 'before';
    if (marked && (marked !== h?.el || marked.dataset.drop !== mark)) delete marked.dataset.drop;
    marked = h?.el ?? null;
    if (marked && mark) marked.dataset.drop = mark;
    if (t?.page !== target?.page || t?.after !== target?.after) { target = t; opts.onMove?.(t); }
  };
  // Near the scroller's top or bottom edge, scroll it (faster the closer), and aim again at what is now under the pointer.
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (scroller && edgeScroll(scroller, x, y)) retarget();
  };

  const activate = () => {
    active = true;
    // Whatever goes wrong while starting, the drag ends, so the next press can still drag.
    try {
      if (opts.onStart?.() === false) { end(); return; }
      touchLock = touch;
      body.dataset.dragging = opts.kind;
      body.style.userSelect = 'none';
      body.style.cursor = 'grabbing';
      try { src.setPointerCapture(id); } catch { /* the pointer may already be gone */ }
      ghost = opts.ghost();
      ghost.setAttribute('aria-hidden', 'true');
      Object.assign(ghost.style, { position: 'fixed', left: '0', top: '0', margin: '0', zIndex: '70', pointerEvents: 'none', willChange: 'transform' });
      place();
      body.append(ghost);
      scroller = scrollerOf(src);
      retarget();
      raf = requestAnimationFrame(tick);
    } catch (err) {
      end();
      throw err;
    }
  };
  const decide = (r: Gate) => { if (r === 'go') activate(); else if (r === 'scroll') end(); };

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    if (ev.pointerType === 'mouse' && ev.buttons === 0) { cancel(); return; } // released where we didn't see it
    x = ev.clientX; y = ev.clientY;
    if (!active) { decide(g.move(x - x0, y - y0, performance.now() - t0)); return; }
    place();
    retarget();
  };
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    const was = active;
    x = ev.clientX; y = ev.clientY;
    const t = was ? targetAt(x, y, targets) : null;
    end();
    if (!was) return;
    swallowClick();
    opts.onDrop(t);
  };
  const cancel = () => { const was = active; end(); if (was) opts.onDrop(null); };
  const onCancel = (ev: PointerEvent) => { if (ev.pointerId === id) cancel(); };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    if (active) { ev.preventDefault(); ev.stopPropagation(); }
    cancel();
  };
  // No text selection from the source while pressing, and no long-press menu once dragging.
  const onSelectStart = (ev: Event) => { if (ev.target instanceof Node && src.contains(ev.target)) ev.preventDefault(); };
  const onContextMenu = (ev: Event) => { if (active) ev.preventDefault(); };

  const listeners: [string, EventListener, boolean][] = [
    ['pointermove', onMove as EventListener, false], ['pointerup', onUp as EventListener, false],
    ['pointercancel', onCancel as EventListener, false], ['keydown', onKey as EventListener, true],
    ['blur', cancel, false], ['selectstart', onSelectStart, false], ['contextmenu', onContextMenu, false],
  ];
  for (const [type, fn, capture] of listeners) window.addEventListener(type, fn, capture);
  // A still hold can start a touch drag without any movement.
  const hold = setTimeout(() => { if (!active) decide(g.move(x - x0, y - y0, Math.max(HOLD_MS, performance.now() - t0))); }, HOLD_MS);

  function end(): void {
    clearTimeout(hold);
    cancelAnimationFrame(raf);
    for (const [type, fn, capture] of listeners) window.removeEventListener(type, fn, capture);
    if (marked) delete marked.dataset.drop;
    ghost?.remove();
    if (active) {
      delete body.dataset.dragging;
      Object.assign(body.style, bodyStyle);
      touchLock = false;
      try { if (src.hasPointerCapture?.(id)) src.releasePointerCapture(id); } catch { /* already released */ }
    }
    active = false;
    marked = ghost = scroller = null;
    busy = false;
  }
}

/** The click that a mouse drag ends with lands on whatever was under it; it isn't one. */
function swallowClick(): void {
  const swallow = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
  window.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', swallow, true), 0);
}
