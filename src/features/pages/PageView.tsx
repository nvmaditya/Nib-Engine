// The handwritten pages, in a scrolling column.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { applyLook, frameShot } from '@/engine/core.js';
import type { Layout, Look, Seg } from '@/engine/types';
import { useStageActive } from '@/features/doc/StageHost';
import { cn } from '@/lib/utils';
import { update, useEditor } from '@/store/editor';
import { drag } from './drag';
import { dprNow, ScanContext, Sheet, type PageMode } from './Sheet';

export type PageLayout = Layout & { tick: string };
export type { PageMode };

/* ---------- The exact scan preview ---------- */
// The CSS likeness can't flatten lighting, so once editing pauses each page is put through the
// same processing as the downloads, using the paper and ink already drawn on screen.
const screenKey = (paper: HTMLElement) => [
  paper.querySelector<HTMLCanvasElement>('.paper-bg')?.dataset.k,
  ...[...paper.querySelectorAll<HTMLCanvasElement>('.ink-layer canvas')].map(c => c.dataset.k + '@' + c.style.left + ',' + c.style.top),
].join('\n');

function composeFromScreen(paper: HTMLElement, dpr: number): HTMLCanvasElement {
  const bg = paper.querySelector<HTMLCanvasElement>('.paper-bg')!;
  const out = document.createElement('canvas'); out.width = bg.width; out.height = bg.height;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height); ctx.drawImage(bg, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  for (const c of paper.querySelectorAll<HTMLCanvasElement>('.ink-layer canvas')) {
    ctx.drawImage(c, Math.round(parseFloat(c.style.left) * dpr), Math.round(parseFloat(c.style.top) * dpr),
      Math.round(parseFloat(c.style.width) * dpr), Math.round(parseFloat(c.style.height) * dpr));
  }
  return out;
}

/** One page column's scan previews: a new request cancels the one still waiting. */
function scanner() {
  let seq = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { clearTimeout(timer); seq++; };
  const schedule = (sheetsEl: HTMLElement, pagesEl: HTMLElement, look: Look, tilt: boolean, dpr: number): void => {
    cancel(); const mine = seq;
    const keyOf = (p: HTMLElement) => look + '|' + tilt + '|' + screenKey(p);
    for (const p of sheetsEl.querySelectorAll<HTMLElement>('.paper.scanned')) if (look === 'none' || p.dataset.scanKey !== keyOf(p)) p.classList.remove('scanned');
    if (look === 'none') return;
    timer = setTimeout(async () => {
      const box = pagesEl.getBoundingClientRect(), mid = (Math.max(box.top, 0) + Math.min(box.bottom, innerHeight)) / 2;
      const figs = [...sheetsEl.children].map(f => { const r = f.getBoundingClientRect(); return { f, d: Math.abs((r.top + r.bottom) / 2 - mid) }; }).sort((a, b) => a.d - b.d);
      for (const { f } of figs) {
        if (mine !== seq || drag.active) return;
        const paper = f.querySelector<HTMLElement>('.paper');
        if (!paper?.querySelector<HTMLCanvasElement>('.paper-bg')?.dataset.k) continue; // not drawn: far from view
        const key = keyOf(paper), i = Number((f as HTMLElement).dataset.i);
        if (paper.dataset.scanKey !== key) {
          try {
            const out = applyLook(frameShot(composeFromScreen(paper, dpr), i), i);
            if (mine !== seq) return;
            const sc = paper.querySelector<HTMLCanvasElement>('.scan')!;
            sc.width = out.width; sc.height = out.height; sc.getContext('2d')!.drawImage(out, 0, 0);
            paper.dataset.scanKey = key;
          } catch { continue; }
        }
        paper.classList.add('scanned');
        await new Promise(r => setTimeout(r, 0));
      }
    }, 450);
  };
  return { schedule, cancel };
}

export interface PageViewProps {
  layout: PageLayout | null;
  /** write: drag, resize, double-click for a new text block, click a word, name tags with `tagMenu`.
   *  style: select and drag, name tags without the menu. export: read only, with the download look. */
  mode: PageMode;
  tagMenu?: (sg: Seg) => ReactNode;
  /** Called when a word is clicked, before the caret is asked for there. */
  onWordClick?: (sg: Seg) => void;
  className?: string;
}

export const PageView = memo(function PageView({ layout, mode, tagMenu, onWordClick, className }: PageViewProps) {
  const active = useStageActive();
  const look = useEditor(s => (mode === 'export' ? s.S.look : 'none'));
  const tilt = useEditor(s => s.S.tilt);
  const scrollToPage = useEditor(s => s.scrollToPage);
  useEditor(s => (active ? s.version : -1)); // the engine objects change in place; redraw on every change while shown
  const pagesRef = useRef<HTMLDivElement>(null), sheetsRef = useRef<HTMLDivElement>(null);
  const [cssW, setCssW] = useState(0);
  const dpr = dprNow();

  useLayoutEffect(() => {
    const el = pagesRef.current;
    if (!el) return;
    const measure = () => { const avail = el.clientWidth - 32; if (avail >= 80) setCssW(Math.floor(Math.min(avail, 680))); };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scan = useMemo(scanner, []);
  useEffect(() => scan.cancel, [scan]);
  const latest = useRef(() => {});
  latest.current = () => {
    if (active && sheetsRef.current && pagesRef.current && layout) scan.schedule(sheetsRef.current, pagesRef.current, look, tilt, dpr);
    else scan.cancel();
  };
  const rescan = useCallback(() => latest.current(), []);
  useEffect(() => { latest.current(); });
  useEffect(() => { // after an import, show its first page (in the stage on screen)
    if (!active || scrollToPage == null || !sheetsRef.current) return;
    const f = sheetsRef.current.children[scrollToPage];
    if (f) { f.scrollIntoView?.({ block: 'start' }); update(st => { st.scrollToPage = null; }, { save: false, layout: false }); }
  });

  return (
    <main ref={pagesRef} data-pages aria-label="Pages" className={cn('relative bg-desk', className)}>
      {(!layout || !cssW) && <p className="my-10 text-center text-muted">Loading handwriting…</p>}
      <ScanContext.Provider value={rescan}>
        <div ref={sheetsRef} data-sheets data-look={look} className="flex flex-col items-center gap-8 px-4 pt-6">
          {layout && cssW > 0 && Array.from({ length: layout.pages }, (_, i) => (
            <Sheet key={i} i={i} pages={layout.pages} segs={layout.segs.filter(sg => sg.page === i)} allSegs={layout.segs}
              cssW={cssW} mode={mode} tagMenu={tagMenu} onWordClick={onWordClick} />
          ))}
        </div>
      </ScanContext.Provider>
      <div className="h-14" />
    </main>
  );
});
