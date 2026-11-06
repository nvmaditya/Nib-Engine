// A block's part on one page: select it, move it, resize it, and its tool bar.
import { useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Move, Shuffle } from 'lucide-react';
import { PAGE_W } from '@/engine/config.js';
import { geom, segId, setFrame, snapX, snapY } from '@/engine/core.js';
import type { Seg } from '@/engine/types';
import { gesture, update } from '@/store/editor';
import { deleteBlock, editFrame, removePart, select, shuffleBox, splitAt, styleBox } from '@/features/doc/actions';
import { cn } from '@/lib/utils';
import { drag } from './drag';

interface Props {
  sg: Seg;
  s: number;          // CSS pixels per page unit
  gap: number;        // line spacing in page units
  selected: boolean;
  touched: boolean;   // the last part tapped (touch shows its tools)
  multi: boolean;     // the block has parts on other pages too
}

/** The nearest ancestor that really scrolls: the pages column on wide screens, the whole stage on phones. */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

export function BoxFrame({ sg, s, gap, selected, touched, multi }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Delete takes only this page's part of a block on several pages, else the block.
  const del = () => (multi ? removePart(sg.box.id, sg.idx) : deleteBlock(sg.box.id));
  const top = sg.top + gap * 0.1;
  useLayoutEffect(() => { if (!drag.active && ref.current) ref.current.style.transform = ''; });

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>, mode: 'move' | 'resize') => {
    const el = ref.current;
    const fig = el?.closest<HTMLElement>('.sheet');
    const paperEl = fig?.querySelector<HTMLElement>('.paper');
    const sheetsEl = fig?.closest<HTMLElement>('[data-sheets]');
    if (!el || !fig || !paperEl || !sheetsEl) return;
    const scroller = scrollerOf(fig);
    const box = sg.box, cont = sg.idx > 0; // a later page's part stays on its own page
    const g = geom();
    const r0 = paperEl.getBoundingClientRect();
    const f0 = { page: sg.page, x: sg.x, y: sg.top, w: sg.w };
    const st = { x: e.clientX, y: e.clientY, w: f0.w, moved: false };
    const grabDX = (e.clientX - r0.left) / s - f0.x, grabDY = (e.clientY - r0.top) / s - f0.y;
    const head = paperEl.querySelector<HTMLElement>(`.ink-layer canvas[data-id="${box.id}:${sg.idx}"]`);
    const edit = gesture(mode);
    let target = { page: f0.page, x: f0.x, y: f0.y }, raf = 0;
    try { el.setPointerCapture(e.pointerId); } catch { /* the pointer may already be gone */ }
    drag.active = mode === 'move';
    fig.classList.add('dragging'); paperEl.classList.remove('scanned');
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - st.x, dy = ev.clientY - st.y;
      if (!st.moved && Math.hypot(dx, dy) < 3) return;
      st.moved = true;
      if (mode === 'resize') {
        const nw = Math.round(Math.max(60, Math.min(PAGE_W - f0.x - 6, f0.w + dx / s)));
        if (nw !== st.w) {
          st.w = nw;
          if (!raf) raf = requestAnimationFrame(() => { raf = 0; edit(() => setFrame(sg, { w: st.w })); });
        }
        return;
      }
      const papers = [...sheetsEl.querySelectorAll<HTMLElement>('.paper')];
      let ti = f0.page, tr = papers[f0.page] ? papers[f0.page].getBoundingClientRect() : r0;
      if (!cont) for (let i = 0; i < papers.length; i++) {
        const r = papers[i].getBoundingClientRect();
        if (ev.clientY >= r.top - 17 && ev.clientY <= r.bottom + 17) { ti = i; tr = r; break; }
      }
      const nx = snapX((ev.clientX - tr.left) / s - grabDX, g, f0.w);
      const ny = snapY((ev.clientY - tr.top) / s - grabDY, g);
      target = { page: ti, x: nx, y: ny };
      const or = paperEl.getBoundingClientRect();
      const tx = (tr.left + nx * s) - (or.left + f0.x * s), ty = (tr.top + ny * s) - (or.top + f0.y * s);
      el.style.transform = `translate(${tx}px,${ty}px)`;
      if (head) head.style.transform = `translate(${tx}px,${ty}px)`;
      // Near the top or bottom edge of what scrolls, scroll it (the window, if nothing inside does).
      const cr = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: innerHeight };
      const by = ev.clientY < cr.top + 60 ? -14 : ev.clientY > cr.bottom - 40 ? 14 : 0;
      if (by) { if (scroller) scroller.scrollTop += by; else scrollBy(0, by); }
    };
    const end = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end);
      fig.classList.remove('dragging'); drag.active = false;
      if (raf) cancelAnimationFrame(raf);
      if (st.moved) edit(() => {
        if (mode === 'move' && ev.type === 'pointerup') setFrame(sg, cont ? { x: target.x, y: target.y } : target);
        if (mode === 'resize') setFrame(sg, { w: st.w });
      });
      else { el.style.transform = ''; if (head) head.style.transform = ''; }
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('.block-tools') && !t.closest('.grip')) return; // a button
    e.stopPropagation();
    update(s => { s.selectedId = sg.box.id; s.touchedId = segId(sg); }, { save: false, layout: false });
    const isRz = !!t.closest('.rz'), isGrip = !!t.closest('.grip');
    if (e.pointerType === 'touch' && !isRz && !isGrip) return; // let touch scroll the page
    e.preventDefault();
    startDrag(e, isRz ? 'resize' : 'move');
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== ref.current) return;
    const g = geom();
    const nudge = (patch: { x?: number; y?: number }) => { e.preventDefault(); update(() => setFrame(sg, patch), { history: 'nudge:' + segId(sg) }); };
    switch (e.key) {
      case 'ArrowUp': return nudge({ y: snapY(sg.top - gap, g) });
      case 'ArrowDown': return nudge({ y: snapY(sg.top + gap, g) });
      case 'ArrowLeft': return nudge({ x: snapX(sg.x - 4, g, sg.w) });
      case 'ArrowRight': return nudge({ x: snapX(sg.x + 4, g, sg.w) });
      case 'Delete': case 'Backspace': e.preventDefault(); return del();
      case 'Enter': e.preventDefault(); return editFrame(sg);
      case 'Escape': select(null); ref.current?.blur(); return undefined;
      default: return undefined;
    }
  };

  const cls = cn('block-frame', selected && 'selected', touched && 'touched', sg.idx > 0 && 'cont',
    !sg.box.text.trim() && 'empty', top * s < 52 && 'tools-below');
  return (
    <div ref={ref} className={cls} data-id={segId(sg)} tabIndex={0} role="group"
      aria-label={sg.idx ? `Block, continued on page ${sg.page + 1}` : 'Block'}
      style={{ left: sg.x * s, top: top * s, width: sg.w * s, height: Math.max(gap * 0.8, sg.bottom - top) * s }}
      onPointerDown={onPointerDown} onKeyDown={onKeyDown}
      onDoubleClick={e => { if (!(e.target as HTMLElement).closest('.block-tools')) editFrame(sg); }}
      onFocus={() => { if (!selected) select(sg.box.id); }}>
      <span className="ph">Empty block</span>
      <span className="rz" title="Drag to change width" />
      <div className="block-tools">
        <button type="button" className="bt grip" aria-label="Move block"><Move aria-hidden />Move</button>
        <button type="button" className="bt" onClick={() => editFrame(sg)}>Edit</button>
        <button type="button" className="bt" onClick={() => styleBox(sg.box.id)}>Style</button>
        <button type="button" className="bt" aria-label="New variation of this block" title="New variation of this block" onClick={() => shuffleBox(sg.box.id)}><Shuffle aria-hidden /></button>
        {sg.idx > 0 && <button type="button" className="bt" title="Make this page’s part its own block" onClick={() => splitAt(sg.box.id, sg.idx)}>Separate</button>}
        <button type="button" className="bt danger" title={multi ? 'Delete the text on this page; the rest moves up' : 'Delete this block'} onClick={del}>Delete</button>
      </div>
    </div>
  );
}
