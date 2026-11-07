// One sheet of paper: the paper canvas, a canvas per block part, the exact scan preview and the block
// frames. It draws only while it is near the visible part of an active stage, and lets its canvases go
// otherwise, so long documents and hidden stages cost no canvas memory.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { PAGE_H, PAGE_W } from '@/engine/config.js';
import { inkKey, paintPaper, paperKey, renderSegment, segBounds, segId } from '@/engine/core.js';
import type { Seg } from '@/engine/types';
import { addTextBlockAt, select } from '@/features/doc/actions';
import { useEditor } from '@/store/editor';
import { BoxFrame } from './BoxFrame';
import { drag } from './drag';
import { useNearViewport } from './useNearViewport';

export type PageMode = 'write' | 'style' | 'export';

/** Lets a sheet that has just been drawn ask its page column for the exact scan preview again. */
export const ScanContext = createContext<() => void>(() => {});

/** Canvas pixels per CSS pixel for the pages (capped, so very dense screens don't cost too much memory). */
export const dprNow = (): number => Math.min(window.devicePixelRatio || 1, 2.5);
const release = (c: HTMLCanvasElement | null) => { if (c) { c.width = 0; c.height = 0; delete c.dataset.k; } };

function PaperCanvas({ i, pages, pxW, near }: { i: number; pages: number; pxW: number; near: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (!near) { release(c); return; }
    const k = paperKey(i, pxW);
    if (c.dataset.k !== k) { paintPaper(c, i, pxW); c.dataset.k = k; }
  });
  return <canvas className="paper-bg" ref={ref} role="img" aria-label={`Handwritten page ${i + 1} of ${pages}`} />;
}

function InkCanvas({ sg, s, px }: { sg: Seg; s: number; px: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const bb = segBounds(sg);
  useLayoutEffect(() => { if (!drag.active && ref.current) ref.current.style.transform = ''; });
  useEffect(() => {
    const c = ref.current, k = inkKey(sg, px);
    if (c && c.dataset.k !== k) { renderSegment(c, sg, px); c.dataset.k = k; }
  });
  useEffect(() => { const c = ref.current; return () => release(c); }, []);
  return <canvas ref={ref} data-id={segId(sg)} style={{ left: bb.ox * s, top: bb.oy * s, width: bb.w * s, height: bb.h * s }} />;
}

export interface SheetProps {
  i: number;
  pages: number;
  segs: Seg[];        // this page's block parts
  allSegs: Seg[];     // every page's
  cssW: number;
  mode: PageMode;
  tagMenu?: (sg: Seg) => ReactNode;
  onWordClick?: (sg: Seg) => void;
  /** Under the page; `Page {i} of {n}` when left out, nothing when null. */
  caption?: ReactNode | null;
}

export function Sheet({ i, pages, segs, allSegs, cssW, mode, tagMenu, onWordClick, caption }: SheetProps) {
  const figRef = useRef<HTMLElement>(null), paperRef = useRef<HTMLDivElement>(null);
  // The sheet a part is dragged from stays drawn, even if auto-scroll carries it far away: its ink follows the pointer.
  const near = useNearViewport(figRef) || (drag.active && !!figRef.current?.classList.contains('dragging'));
  const gap = useEditor(s => s.S.gap);
  const selectedId = useEditor(s => s.selectedId);
  const rescan = useContext(ScanContext);
  const s = cssW / PAGE_W, dpr = dprNow();

  // Out of view the exact scan goes too; back in view, the page column makes it again.
  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) return;
    if (near) { rescan(); return; }
    release(paper.querySelector<HTMLCanvasElement>('.scan'));
    paper.classList.remove('scanned');
    delete paper.dataset.scanKey;
  }, [near, rescan]);

  const parts = (sg: Seg) => allSegs.filter(o => o.box === sg.box).length;
  const shown = caption === undefined ? (pages > 1 ? `Page ${i + 1} of ${pages}` : 'Page 1') : caption;
  return (
    <figure ref={figRef} className="sheet" data-i={i}>
      <div ref={paperRef} className="paper" data-paper={i} style={{ width: cssW, height: Math.round(cssW * PAGE_H / PAGE_W) }}>
        <PaperCanvas i={i} pages={pages} pxW={cssW * dpr} near={near} />
        <div className="ink-layer">{near && segs.map(sg => <InkCanvas key={segId(sg)} sg={sg} s={s} px={s * dpr} />)}</div>
        <canvas className="scan" aria-hidden="true" />
        {mode !== 'export' && (
          <div className="ui"
            onPointerDown={e => { if (e.target === e.currentTarget) select(null); }}
            onDoubleClick={e => {
              if (mode !== 'write' || e.target !== e.currentTarget) return;
              const r = e.currentTarget.getBoundingClientRect();
              addTextBlockAt(i, (e.clientX - r.left) / s, (e.clientY - r.top) / s);
            }}>
            {segs.map(sg => (
              <BoxFrame key={segId(sg)} sg={sg} s={s} gap={gap} parts={parts(sg)} selected={sg.box.id === selectedId}
                mode={mode} tagMenu={tagMenu} onWordClick={onWordClick} />
            ))}
          </div>
        )}
      </div>
      {shown !== null && <figcaption className="mt-2.5 flex min-h-8 items-center gap-2 text-[13px] text-muted">{shown}</figcaption>}
    </figure>
  );
}
