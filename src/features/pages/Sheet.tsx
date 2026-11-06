// One sheet of paper: the paper canvas, a canvas per block part, the exact scan preview and the block frames.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { PAGE_W } from '@/engine/config.js';
import { inkKey, paintPaper, paperKey, renderSegment, segBounds, segId } from '@/engine/core.js';
import type { Seg } from '@/engine/types';
import { Button } from '@/components/ui/button';
import { addTextBlockAt, deletePageAt, select } from '@/features/doc/actions';
import { BoxFrame } from './BoxFrame';
import { drag } from './drag';

function PaperCanvas({ i, pages, pxW, tick }: { i: number; pages: number; pxW: number; tick: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current, k = paperKey(i, pxW);
    if (c && c.dataset.k !== k) { paintPaper(c, i, pxW); c.dataset.k = k; }
  });
  return <canvas className="paper-bg" ref={ref} role="img" aria-label={`Handwritten page ${i + 1} of ${pages}`} data-tick={tick} />;
}

function InkCanvas({ sg, s, px }: { sg: Seg; s: number; px: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const bb = segBounds(sg);
  useLayoutEffect(() => { if (!drag.active && ref.current) ref.current.style.transform = ''; });
  useEffect(() => {
    const c = ref.current, k = inkKey(sg, px);
    if (c && c.dataset.k !== k) { renderSegment(c, sg, px); c.dataset.k = k; }
  });
  return <canvas ref={ref} data-id={segId(sg)} style={{ left: bb.ox * s, top: bb.oy * s, width: bb.w * s, height: bb.h * s }} />;
}

export interface SheetProps {
  i: number;
  pages: number;
  segs: Seg[];        // this page's block parts
  allSegs: Seg[];     // every page's
  cssW: number;
  cssH: number;
  dpr: number;
  gap: number;
  selectedId: string | null;
  touchedId: string | null;
  tick: string;
  removable: boolean;
  readOnly: boolean;
}

export function Sheet({ i, pages, segs, allSegs, cssW, cssH, dpr, gap, selectedId, touchedId, tick, removable, readOnly }: SheetProps) {
  const s = cssW / PAGE_W;
  return (
    <figure className="sheet" data-i={i}>
      <div className="paper" style={{ width: cssW, height: cssH }}>
        <PaperCanvas i={i} pages={pages} pxW={cssW * dpr} tick={tick} />
        <div className="ink-layer">{segs.map(sg => <InkCanvas key={segId(sg)} sg={sg} s={s} px={s * dpr} />)}</div>
        <canvas className="scan" aria-hidden="true" />
        {!readOnly && (
          <div className="ui"
            onPointerDown={e => { if (e.target === e.currentTarget) select(null); }}
            onDoubleClick={e => {
              if (e.target !== e.currentTarget) return;
              const r = e.currentTarget.getBoundingClientRect();
              addTextBlockAt(i, (e.clientX - r.left) / s, (e.clientY - r.top) / s);
            }}>
            {segs.map(sg => (
              <BoxFrame key={segId(sg)} sg={sg} s={s} gap={gap}
                selected={sg.box.id === selectedId} touched={touchedId === segId(sg)}
                multi={allSegs.some(o => o.box === sg.box && o !== sg)} />
            ))}
          </div>
        )}
      </div>
      <figcaption className="mt-2.5 flex min-h-8 items-center justify-between gap-2 text-[13px] text-muted">
        <span>{pages > 1 ? `Page ${i + 1} of ${pages}` : 'Page 1'}</span>
        {!readOnly && removable && (
          <Button variant="outline" size="sm" onClick={() => deletePageAt(i)}>Remove page</Button>
        )}
      </figcaption>
    </figure>
  );
}
