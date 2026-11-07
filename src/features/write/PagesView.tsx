// Write's Pages view: the Write bar, then a row per page with its typed copy (edited in place) beside its
// handwritten copy, then Add page. What it shows (side by side, typed or handwritten) is kept on this device.
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Seg } from '@/engine/types';
import { Button } from '@/components/ui/button';
import { addPageAt } from '@/features/doc/actions';
import { useStageActive } from '@/features/doc/StageHost';
import type { PageLayout } from '@/features/pages/PageView';
import { update, useEditor } from '@/store/editor';
import { PageRow } from './PageRow';
import { PartMenu } from './TypedPage';
import { WriteBar, type WriteMode } from './WriteBar';

const MODE_KEY = 'nib.writeMode';
const MODES: readonly string[] = ['side', 'typed', 'hand'] satisfies WriteMode[];

function readMode(): WriteMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v !== null && MODES.includes(v) ? (v as WriteMode) : 'side';
  } catch { return 'side'; }
}
function keepMode(m: WriteMode): void {
  try { localStorage.setItem(MODE_KEY, m); } catch { /* storage blocked: it lasts until the page is closed */ }
}

/** Each copy's width for a column `w` px wide: two of at most 500 px side by side, or one. */
function copyWidth(w: number, mode: WriteMode): number {
  const avail = w - 44; // the column's and the row's padding
  return Math.floor(Math.min(500, mode === 'side' ? (avail - 18) / 2 : avail));
}

const tagMenu = (sg: Seg) => <PartMenu sg={sg} />;

export const PagesView = memo(function PagesView({ layout }: { layout: PageLayout | null }) {
  const active = useStageActive();
  const scrollToPage = useEditor(s => s.scrollToPage);
  const [mode, setModeState] = useState<WriteMode>(readMode);
  const [width, setWidth] = useState(0);
  const [inView, setInView] = useState(0);
  const pagesRef = useRef<HTMLElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const setMode = useCallback((m: WriteMode) => { setModeState(m); keepMode(m); }, []);
  // A word clicked on a handwritten page opens its typed copy there, so Handwritten alone turns to Side by side.
  const onWordClick = useCallback(() => { if (modeRef.current === 'hand') setMode('side'); }, [setMode]);

  useLayoutEffect(() => {
    const el = pagesRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The Add menu adds to the page most in view.
  const pages = layout?.pages ?? 0;
  useEffect(() => {
    const el = pagesRef.current;
    if (!el) return;
    const look = () => {
      const r = el.getBoundingClientRect();
      let best = 0, most = -Infinity;
      for (const row of el.querySelectorAll<HTMLElement>('[data-drop-page]')) {
        const b = row.getBoundingClientRect(), seen = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top);
        if (seen > most) { most = seen; best = Number(row.dataset.dropPage); }
      }
      setInView(best);
    };
    look();
    el.addEventListener('scroll', look, { passive: true });
    return () => el.removeEventListener('scroll', look);
  }, [pages, width, mode]);

  // After an import, show its first page (in the stage on screen).
  useEffect(() => {
    if (!active || scrollToPage == null) return;
    const row = pagesRef.current?.querySelector(`[data-drop-page="${scrollToPage}"]`);
    if (!row) return;
    row.scrollIntoView?.({ block: 'start' });
    update(st => { st.scrollToPage = null; }, { save: false, layout: false });
  }, [active, scrollToPage, layout]);

  const cssW = copyWidth(width, mode);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WriteBar view="write" mode={mode} onMode={setMode} page={Math.max(0, Math.min(inView, pages - 1))} />
      <main ref={pagesRef} data-pages aria-label="Pages" className="min-h-0 flex-1 overflow-y-auto bg-desk">
        {layout && cssW >= 80 ? (
          <div data-sheets className="flex flex-col items-center gap-4 px-4 pt-4 pb-14">
            {Array.from({ length: layout.pages }, (_, i) => (
              <PageRow key={i} i={i} pages={layout.pages} segs={layout.segs} cssW={cssW} mode={mode} tagMenu={tagMenu} onWordClick={onWordClick} />
            ))}
            <Button variant="ghost" onClick={() => addPageAt()}><Plus />Add page</Button>
          </div>
        ) : <p className="my-10 text-center text-muted">Loading handwriting…</p>}
      </main>
    </div>
  );
});
