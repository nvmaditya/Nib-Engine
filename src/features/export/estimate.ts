// The download size estimate: one real page, the chosen page with the most writing, drawn at Standard
// size (at Print size for a Print scan) and encoded three ways, measured after a pause while the Export
// stage is shown, and kept by the settings, blocks and size it came from.
import { useEffect, useMemo, useState } from 'react';
import { fontReady, fontsInUse } from '@/engine/core.js';
import { layoutFor } from '@/features/doc/model';
import { useStageActive } from '@/features/doc/StageHost';
import { useEditor } from '@/store/editor';
import { QUALITY, SCAN_LOOKS, fullestPage, type Quality, type Sample } from './plan';
import { encodeCanvas, freeze, renderPage, type Frozen } from './render';

export const ESTIMATE_DELAY = 600;
const KEEP = 12;
const cache = new Map<string, Sample>();
const inFlight = new Set<string>(); // keys being measured now, so an edit during a measurement doesn't start a second

/** Forget everything measured (for tests). */
export function clearSizeCache(): void { cache.clear(); inFlight.clear(); }

/** Page `i` of the frozen copy at the size `at`, as a PNG and as a JPG at Standard's and Print's quality: the byte counts. */
export async function measurePage(f: Frozen, i: number, at: Quality = 'standard'): Promise<Sample> {
  const c = renderPage(f, i, QUALITY[at].pxW);
  try {
    const png = await encodeCanvas(c, 'image/png');
    const jpg = await encodeCanvas(c, 'image/jpeg', QUALITY.standard.jpeg);
    const jpgPrint = await encodeCanvas(c, 'image/jpeg', QUALITY.print.jpeg);
    return { png: png.length, jpg: jpg.length, jpgPrint: jpgPrint.length, at };
  } finally {
    c.width = c.height = 0; // let the canvas's memory go at once
  }
}

function remember(key: string, s: Sample): void {
  cache.delete(key); cache.set(key, s);
  while (cache.size > KEEP) cache.delete(cache.keys().next().value as string);
}

/**
 * The measured sizes of the `chosen` page with the most writing (see `fullestPage`), or null until
 * measured (or if it can't be, or with no page chosen). It is measured at Standard size, which stands
 * for a Print page by its pixel count, except a Print scan: the scan looks soften by the pixel, so their
 * Print pages are measured at Print size.
 */
export function useSizeEstimate(chosen: readonly number[], quality: Quality): Sample | null {
  const active = useStageActive();
  const version = useEditor(s => (active ? s.version : -1)); // watch changes only while the stage is shown
  const layoutTick = useEditor(s => s.layoutTick), fontTick = useEditor(s => s.fontTick);
  const at: Quality = quality === 'print' && SCAN_LOOKS.includes(useEditor.getState().S.look) ? 'print' : 'standard';
  const [, setDone] = useState(0);
  const want = chosen.join(',');
  // Which page has the most writing changes only when the pages are laid out again, so it is looked for
  // then, as the pages shown are laid out, and not on every render: a run re-renders the panel each page.
  const page = useMemo(() => {
    if (!active || !chosen.length) return null;
    const s = useEditor.getState();
    return fullestPage(layoutFor(s.S, s.doc).segs, chosen);
  // `chosen` is read through `want` (it is a new array each render).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, layoutTick, fontTick, want]);
  const key = active ? JSON.stringify([useEditor.getState().S, useEditor.getState().doc.boxes, useEditor.getState().doc.pageCount, page, at]) : '';
  const hit = active ? cache.get(key) ?? null : null;
  useEffect(() => {
    if (!active || page === null || cache.has(key)) return;
    let live = true;
    const t = setTimeout(() => {
      if (!fontsInUse().every(fontReady)) return; // a font arriving bumps `version`, which starts the wait again
      if (inFlight.has(key)) return;
      inFlight.add(key);
      measurePage(freeze(), page, at).then(
        s => { inFlight.delete(key); remember(key, s); if (live) setDone(n => n + 1); },
        () => { inFlight.delete(key); },
      );
    }, ESTIMATE_DELAY);
    return () => { live = false; clearTimeout(t); };
  }, [active, page, key, version, at]);
  return hit;
}
