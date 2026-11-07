// One page in the Pages view: its header (grip, name, how many blocks, ⋯), then its typed copy and its
// handwritten copy side by side. The row is where a dragged page drops.
import { memo, useId, useRef, type PointerEvent, type ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { PAGE_W } from '@/engine/config.js';
import type { Seg } from '@/engine/types';
import { movePageTo } from '@/features/doc/actions';
import { useStageActive } from '@/features/doc/StageHost';
import { Sheet, type SheetProps } from '@/features/pages/Sheet';
import { cn } from '@/lib/utils';
import { useEditor } from '@/store/editor';
import { dropClass, gripClass, pageDropIndex, startDrag } from './dnd';
import { PageMenu } from './PageMenu';
import { TypedPage, useFocusRescue } from './TypedPage';
import type { WriteMode } from './WriteBar';

interface Props {
  /** The page (0-based) and how many there are. */
  i: number;
  pages: number;
  /** Every page's parts (the layout's). */
  segs: Seg[];
  /** Each copy's width in CSS pixels. */
  cssW: number;
  mode: WriteMode;
  tagMenu?: (sg: Seg) => ReactNode;
  onWordClick?: (sg: Seg) => void;
}

export const PageRow = memo(function PageRow({ i, pages, segs, cssW, mode, tagMenu, onWordClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const heading = useId();
  const here = segs.filter(sg => sg.page === i), n = here.length;
  useFocusRescue(ref, () => ({ page: i, top: null }));

  const ghost = () => {
    const g = document.createElement('div');
    g.className = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-fg shadow-lg';
    g.textContent = `Page ${i + 1}`;
    return g;
  };
  const dragPage = (e: PointerEvent) => startDrag(e, {
    kind: 'grip', ghost,
    onDrop: t => { if (!t) return; const to = pageDropIndex(i, t.page, t.after); if (to !== i) movePageTo(i, to); },
  });

  return (
    <div ref={ref} role="group" aria-labelledby={heading} data-drop-page={i}
      className={cn('flex w-full max-w-[1060px] flex-col gap-2 rounded-xl p-1.5', dropClass)}>
      <div className="flex items-center gap-1.5 px-0.5 text-[13px]">
        {/* Keyboard users move pages from ⋯ (Move up, Move down). */}
        <button type="button" tabIndex={-1} aria-label={`Drag to move page ${i + 1}`} title="Drag to move this page" onPointerDown={dragPage}
          className={cn(gripClass, 'grid size-[26px] flex-none place-items-center rounded-[7px] text-muted hover:bg-surface hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none [&_svg]:size-4')}>
          <GripVertical aria-hidden />
        </button>
        <h2 id={heading} tabIndex={-1} data-page-heading className="m-0 rounded-sm text-[13px] font-semibold focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
          {`Page ${i + 1}`}
        </h2>
        <span className="text-[12.5px] text-muted">{`· ${n} ${n === 1 ? 'block' : 'blocks'}`}</span>
        <span className="flex-1" />
        <PageMenu page={i} pages={pages} />
      </div>
      <div className="flex items-start justify-center gap-[18px]">
        {mode !== 'hand' && (
          <figure key="typed" className="m-0">
            <TypedPage page={i} segs={segs} s={cssW / PAGE_W} />
            <figcaption className="mt-2.5 flex min-h-8 items-center text-[13px] text-muted">Typed · edit here</figcaption>
          </figure>
        )}
        {mode !== 'typed' && <HandSheet key="hand" i={i} pages={pages} segs={here} allSegs={segs} cssW={cssW} tagMenu={tagMenu} onWordClick={onWordClick} />}
      </div>
    </div>
  );
});

/** The handwritten copy, drawn again on every change while the stage is shown (the engine's objects change in place). */
function HandSheet(props: Omit<SheetProps, 'mode' | 'caption'>) {
  const active = useStageActive();
  useEditor(s => (active ? s.version : -1));
  return <Sheet {...props} mode="write" caption="Handwritten" />;
}
