// The handwritten pages, in a scrolling column, with the page tools above them.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FilePlus2, Plus } from 'lucide-react';
import { PAGE_H, PAGE_W } from '@/engine/config.js';
import { applyLook, frameShot, geom } from '@/engine/core.js';
import type { Layout, Look } from '@/engine/types';
import { Button } from '@/components/ui/button';
import { addBoxAt, addPage, pagesApi } from '@/features/doc/actions';
import { matches } from '@/lib/media';
import { cn } from '@/lib/utils';
import { update, useEditor } from '@/store/editor';
import { drag } from './drag';
import { Sheet } from './Sheet';

export type PageLayout = Layout & { tick: string };

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

let scanSeq = 0, scanTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleScanPreview(sheetsEl: HTMLElement, pagesEl: HTMLElement, look: Look, tilt: boolean, dpr: number): void {
  clearTimeout(scanTimer); const seq = ++scanSeq;
  const keyOf = (p: HTMLElement) => look + '|' + tilt + '|' + screenKey(p);
  for (const p of sheetsEl.querySelectorAll<HTMLElement>('.paper.scanned')) if (look === 'none' || p.dataset.scanKey !== keyOf(p)) p.classList.remove('scanned');
  if (look === 'none') return;
  scanTimer = setTimeout(async () => {
    const box = pagesEl.getBoundingClientRect(), mid = (Math.max(box.top, 0) + Math.min(box.bottom, innerHeight)) / 2;
    const figs = [...sheetsEl.children].map(f => { const r = f.getBoundingClientRect(); return { f, d: Math.abs((r.top + r.bottom) / 2 - mid) }; }).sort((a, b) => a.d - b.d);
    for (const { f } of figs) {
      if (seq !== scanSeq || drag.active) return;
      const paper = f.querySelector<HTMLElement>('.paper');
      if (!paper) continue;
      const key = keyOf(paper), i = Number((f as HTMLElement).dataset.i);
      if (paper.dataset.scanKey !== key) {
        try {
          const out = applyLook(frameShot(composeFromScreen(paper, dpr), i), i);
          if (seq !== scanSeq) return;
          const sc = paper.querySelector<HTMLCanvasElement>('.scan')!;
          sc.width = out.width; sc.height = out.height; sc.getContext('2d')!.drawImage(out, 0, 0);
          paper.dataset.scanKey = key;
        } catch { continue; }
      }
      paper.classList.add('scanned');
      await new Promise(r => setTimeout(r, 0));
    }
  }, 450);
}

/**
 * The pages. `readOnly` (Export) hides the block tools and page tools, turns off dragging and shows
 * the pages with the download look applied.
 */
export function PageView({ layout, readOnly = false, className }: { layout: PageLayout | null; readOnly?: boolean; className?: string }) {
  const S = useEditor(s => s.S);
  const pageCount = useEditor(s => s.doc.pageCount);
  const selectedId = useEditor(s => s.selectedId);
  const touchedId = useEditor(s => s.touchedId);
  const scrollToPage = useEditor(s => s.scrollToPage);
  useEditor(s => s.version); // the engine objects change in place; redraw on every change
  const pagesRef = useRef<HTMLDivElement>(null), sheetsRef = useRef<HTMLDivElement>(null);
  const [cssW, setCssW] = useState(0);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const look: Look = readOnly ? S.look : 'none';

  useLayoutEffect(() => {
    const el = pagesRef.current;
    if (!el) return;
    const measure = () => { const avail = el.clientWidth - 32; if (avail >= 80) setCssW(Math.floor(Math.min(avail, 680))); };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cssH = Math.round(cssW * PAGE_H / PAGE_W);
  const s = cssW / PAGE_W;

  // Add a block where the reader is looking, on a free line.
  useEffect(() => {
    pagesApi.addBox = () => {
      const pagesEl = pagesRef.current, sheetsEl = sheetsRef.current;
      if (!layout || !pagesEl || !sheetsEl || !s) return;
      const cr = pagesEl.getBoundingClientRect();
      let best = { page: 0, y: geom().top, area: -1 };
      [...sheetsEl.querySelectorAll('.paper')].forEach((p, i) => {
        const r = p.getBoundingClientRect();
        const t = Math.max(r.top, cr.top + 56, 0), b = Math.min(r.bottom, cr.bottom, innerHeight), a = b - t;
        if (a > best.area) best = { page: i, area: a, y: ((t - r.top) + Math.max(0, a) * 0.3) / s };
      });
      addBoxAt({ page: best.page, x: 0, y: best.y }, layout.segs, true);
    };
    return () => { pagesApi.addBox = null; };
  }, [layout, s]);

  useEffect(() => {
    if (sheetsRef.current && pagesRef.current && layout) scheduleScanPreview(sheetsRef.current, pagesRef.current, look, S.tilt, dpr);
  });
  useEffect(() => { // after an import, show its first page
    if (scrollToPage == null || !sheetsRef.current) return;
    const f = sheetsRef.current.children[scrollToPage];
    if (f) { f.scrollIntoView?.({ block: 'start' }); update(st => { st.scrollToPage = null; }, { save: false, layout: false }); }
  });

  const hint = matches('(hover: none)')
    ? 'Tap a block, then use Move to drag it.'
    : 'Drag blocks to move them. Pull the right edge to resize. Double-click the paper for a new block.';
  return (
    <main ref={pagesRef} data-pages aria-label="Pages" className={cn('relative bg-desk', className)}>
      {!readOnly && (
        <div role="toolbar" aria-label="Page tools" className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-line bg-desk/95 px-4 py-2.5 backdrop-blur-sm">
          <Button variant="outline" size="sm" onClick={() => pagesApi.addBox?.()}><Plus />Add block</Button>
          <Button variant="outline" size="sm" onClick={() => layout && addPage(layout.pages)}><FilePlus2 />Add page</Button>
          <span className="ml-1 hidden text-[13px] text-muted md:inline">{hint}</span>
        </div>
      )}
      {(!layout || !cssW) && <p className="my-10 text-center text-muted">Loading handwriting…</p>}
      <div ref={sheetsRef} data-sheets data-look={look} className="flex flex-col items-center gap-8 px-4 pt-6">
        {layout && cssW > 0 && Array.from({ length: layout.pages }, (_, i) => {
          const segs = layout.segs.filter(sg => sg.page === i);
          return <Sheet key={i} i={i} pages={layout.pages} segs={segs} allSegs={layout.segs} cssW={cssW} cssH={cssH} dpr={dpr}
            gap={S.gap} selectedId={selectedId} touchedId={touchedId} tick={layout.tick} readOnly={readOnly}
            removable={layout.pages > 1 && i < pageCount && !segs.length} />;
        })}
      </div>
      <div className="h-14" />
    </main>
  );
}
