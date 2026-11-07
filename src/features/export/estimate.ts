// The download size estimate: one real page, drawn at Standard size and encoded three ways, measured
// after a pause while the Export stage is shown, and kept by the settings and blocks it came from.
import { useEffect, useState } from 'react';
import { fontReady, fontsInUse } from '@/engine/core.js';
import { useStageActive } from '@/features/doc/StageHost';
import { useEditor } from '@/store/editor';
import { QUALITY, type Sample } from './plan';
import { encodeCanvas, freeze, renderPage, type Frozen } from './render';

export const ESTIMATE_DELAY = 600;
const KEEP = 12;
const cache = new Map<string, Sample>();
const inFlight = new Set<string>(); // keys being measured now, so an edit during a measurement doesn't start a second

/** Forget everything measured (for tests). */
export function clearSizeCache(): void { cache.clear(); inFlight.clear(); }

/** Page `i` of the frozen copy at Standard size, as a PNG and as a JPG at Standard's and Print's quality: the byte counts. */
export async function measurePage(f: Frozen, i: number): Promise<Sample> {
  const c = renderPage(f, i, QUALITY.standard.pxW);
  try {
    const png = await encodeCanvas(c, 'image/png');
    const jpg = await encodeCanvas(c, 'image/jpeg', QUALITY.standard.jpeg);
    const jpgPrint = await encodeCanvas(c, 'image/jpeg', QUALITY.print.jpeg);
    return { png: png.length, jpg: jpg.length, jpgPrint: jpgPrint.length };
  } finally {
    c.width = c.height = 0; // let the canvas's memory go at once
  }
}

function remember(key: string, s: Sample): void {
  cache.delete(key); cache.set(key, s);
  while (cache.size > KEEP) cache.delete(cache.keys().next().value as string);
}

/** The measured sizes of the first chosen page, or null until measured (or if it can't be). */
export function useSizeEstimate(firstPage: number | null): Sample | null {
  const active = useStageActive();
  const version = useEditor(s => (active ? s.version : -1)); // watch changes only while the stage is shown
  const [, setDone] = useState(0);
  const key = active ? JSON.stringify([useEditor.getState().S, useEditor.getState().doc.boxes, useEditor.getState().doc.pageCount, firstPage]) : '';
  const hit = active ? cache.get(key) ?? null : null;
  useEffect(() => {
    if (!active || firstPage === null || cache.has(key)) return;
    let live = true;
    const t = setTimeout(() => {
      if (!fontsInUse().every(fontReady)) return; // a font arriving bumps `version`, which starts the wait again
      if (inFlight.has(key)) return;
      inFlight.add(key);
      measurePage(freeze(), firstPage).then(
        s => { inFlight.delete(key); remember(key, s); if (live) setDone(n => n + 1); },
        () => { inFlight.delete(key); },
      );
    }, ESTIMATE_DELAY);
    return () => { live = false; clearTimeout(t); };
  }, [active, firstPage, key, version]);
  return hit;
}
