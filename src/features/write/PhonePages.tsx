// Write's Pages view on a phone (below 860 px): one page at a time, across the full width. A pager steps
// between pages, a flip turns the page between its typed copy (edited in place) and its handwriting, and a
// sideways swipe on the page turns to the next or previous page. The face is kept on this device.
import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_W } from '@/engine/config.js';
import type { Box, EngineDoc, Seg } from '@/engine/types';
import { Button } from '@/components/ui/button';
import { useStageActive } from '@/features/doc/StageHost';
import { lineOf } from '@/features/editor/positions';
import { partRanges } from '@/features/editor/slices';
import { drag } from '@/features/pages/drag';
import type { PageLayout } from '@/features/pages/PageView';
import { update, useEditor } from '@/store/editor';
import { PageMenu } from './PageMenu';
import { HandSheet } from './PageRow';
import { PartMenu, TypedPage } from './TypedPage';
import { SegButton, Segmented, WriteBar } from './WriteBar';

type Face = 'typed' | 'hand';
const FACE_KEY = 'nib.phoneFace';

function readFace(): Face {
  try { return localStorage.getItem(FACE_KEY) === 'hand' ? 'hand' : 'typed'; } catch { return 'typed'; }
}

/**
 * Whether nothing is written in the document yet (a new document): it opens with its typed page showing, where
 * Add and typing start, whatever this device remembers for other documents (which stays as it is).
 */
export const nothingWritten = (doc: EngineDoc): boolean => doc.boxes.every(b => !b.text.trim());
function keepFace(f: Face): void {
  try { localStorage.setItem(FACE_KEY, f); } catch { /* storage blocked: it lasts until the page is closed */ }
}

/** A swipe turns the page once it has gone this far sideways (px), and mostly sideways. */
const SWIPE = 60, SIDEWAYS = 1.5;
/** Where a swipe doesn't start: the editor and fields (they select text), and controls and grips (they have their own gestures). */
const NO_SWIPE = '.ProseMirror, input, textarea, select, [contenteditable="true"], button, a, .grip, .rz, .touch-none';

/**
 * The page (0-based) of the part whose typed lines hold `offset` of the block's text: the page whose editor
 * takes a caret request there (the last part also takes the end of the text). Null while it isn't laid out.
 */
function pageOfOffset(box: Box, segs: Seg[], offset: number): number | null {
  const parts = segs.filter(sg => sg.box.id === box.id).sort((a, b) => a.idx - b.idx);
  if (!parts.length) return null;
  const { li } = lineOf(box.text, offset), k = partRanges(box, segs).findIndex(r => r.first <= li && li < r.end);
  return parts[k < 0 ? parts.length - 1 : k].page;
}

const tagMenu = (sg: Seg) => <PartMenu sg={sg} />;

export function PhonePages({ layout }: { layout: PageLayout | null }) {
  const active = useStageActive();
  const caret = useEditor(s => s.caret);
  const scrollToPage = useEditor(s => s.scrollToPage);
  const [face, setFaceState] = useState<Face>(() => (nothingWritten(useEditor.getState().doc) ? 'typed' : readFace()));
  const [want, setWant] = useState(0);
  const [width, setWidth] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  const heading = useId();
  const pages = layout?.pages ?? 0;
  const cur = Math.max(0, Math.min(want, pages - 1));
  if (pages > 0 && want !== cur) setWant(cur); // a page deleted under you: stay on the one before it

  const setFace = (f: Face) => { setFaceState(f); keepFace(f); };
  /** Turn to page `i`, from its top. */
  const go = (i: number) => {
    const to = Math.max(0, Math.min(i, pages - 1));
    if (to === cur) return;
    setWant(to);
    if (mainRef.current) mainRef.current.scrollTop = 0;
  };

  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const measure = () => { const w = el.clientWidth; if (w > 0) setWidth(w); }; // 0: the stage is hidden, so keep the last width
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A caret request (a word tapped on the handwriting, an undo, Edit from another stage) for a part on another
  // page, or while the handwriting shows, turns to that page's typed copy, whose editor then takes it.
  const handled = useRef(0);
  useLayoutEffect(() => {
    if (!active || !layout || !caret || caret.n === handled.current) return;
    const box = useEditor.getState().doc.boxes.find(b => b.id === caret.boxId);
    const page = box ? pageOfOffset(box, layout.segs, caret.offset) : null;
    if (page === null) return; // not laid out yet
    handled.current = caret.n;
    if (face !== 'typed') setFace('typed');
    if (page !== cur) setWant(page);
  }, [active, layout, caret]); // not on the face or page: a request is acted on once

  // After an import, show its first page (in the stage on screen).
  useEffect(() => {
    if (!active || scrollToPage == null || scrollToPage >= pages) return;
    setWant(scrollToPage);
    if (mainRef.current) mainRef.current.scrollTop = 0;
    update(st => { st.scrollToPage = null; }, { save: false, layout: false });
  }, [active, scrollToPage, pages]);

  // A sideways swipe on the page: left for the next page, right for the one before.
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.pointerType === 'mouse') { swipe.current = null; return; } // a second finger is a pinch, a mouse drags: not a swipe
    const t = e.target as Element;
    swipe.current = drag.active || t.closest(NO_SWIPE) ? null : { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent) => {
    const st = swipe.current;
    swipe.current = null;
    if (!st || st.id !== e.pointerId || drag.active) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > SIDEWAYS * Math.abs(dy)) go(cur + (dx < 0 ? 1 : -1));
  };
  const onPointerCancel = () => { swipe.current = null; };

  const cssW = Math.floor(width - 32); // 16 px each side
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WriteBar view="write" page={cur} />
      <main ref={mainRef} data-pages aria-label="Pages" className="min-h-0 flex-1 overflow-y-auto bg-desk">
        {layout && cssW >= 80 ? (
          <div data-sheets className="px-4 pt-2 pb-14">
            <div role="group" aria-labelledby={heading} data-drop-page={cur} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <div className="flex items-center">
                  <Button variant="ghost" size="icon" aria-label="Previous page" title="Previous page" disabled={cur === 0} onClick={() => go(cur - 1)}>
                    <ChevronLeft />
                  </Button>
                  <h2 id={heading} tabIndex={-1} data-page-heading aria-live="polite"
                    className="m-0 rounded-sm px-0.5 text-[13px] font-semibold whitespace-nowrap tabular-nums focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
                    {`Page ${cur + 1} of ${pages}`}
                  </h2>
                  <Button variant="ghost" size="icon" aria-label="Next page" title="Next page" disabled={cur >= pages - 1} onClick={() => go(cur + 1)}>
                    <ChevronRight />
                  </Button>
                  <PageMenu page={cur} pages={pages} onMoved={setWant} />
                </div>
                <div className="ml-auto">
                  <Segmented label="Show">
                    <SegButton pressed={face === 'typed'} onClick={() => setFace('typed')}>Typed</SegButton>
                    <SegButton pressed={face === 'hand'} onClick={() => setFace('hand')}>Handwritten</SegButton>
                  </Segmented>
                </div>
              </div>
              <div data-phone-page className="flex touch-pan-y touch-pinch-zoom justify-center"
                onPointerDownCapture={onPointerDown} onPointerUpCapture={onPointerUp} onPointerCancelCapture={onPointerCancel}>
                {face === 'typed'
                  ? <TypedPage page={cur} segs={layout.segs} s={cssW / PAGE_W} />
                  : <HandSheet i={cur} pages={pages} segs={layout.segs.filter(sg => sg.page === cur)} allSegs={layout.segs}
                    cssW={cssW} tagMenu={tagMenu} caption={null} />}
              </div>
            </div>
          </div>
        ) : <p className="my-10 text-center text-muted">Loading handwriting…</p>}
      </main>
    </div>
  );
}
