// Pages drawn for download. A download works from a copy of the document frozen when it starts, so
// nothing typed, undone or loaded meanwhile gets into its pages. Each page is the engine's own finished
// page (paper and ink, then the camera tilt, then the scan look) drawn at the size asked: nothing is
// left out, and nothing is scaled up afterwards.
import { applyLook, composePage, computeLayout, frameShot, use } from '@/engine/core.js';
import type { EngineDoc, Settings } from '@/engine/types';
import { layoutFor } from '@/features/doc/model';
import { useEditor } from '@/store/editor';

/** The document as it was when a download started. */
export interface Frozen { S: Settings; doc: EngineDoc; title: string; pages: number }

/** A copy of the open document's settings and blocks, its title, and how many pages it has now. */
export function freeze(): Frozen {
  const s = useEditor.getState();
  return { S: structuredClone(s.S), doc: structuredClone(s.doc), title: s.title, pages: layoutFor(s.S, s.doc).pages };
}

/**
 * Page `i` of the frozen copy, `pxW` pixels wide, exactly as the engine finishes a page for download.
 * Afterwards (even if drawing fails) the engine is back on the open document, laid out.
 */
export function renderPage(f: Frozen, i: number, pxW: number): HTMLCanvasElement {
  let a: HTMLCanvasElement | undefined, b: HTMLCanvasElement | undefined;
  try {
    use(f.S, f.doc);
    computeLayout();
    a = composePage(i, pxW); b = frameShot(a, i);
    const c = applyLook(b, i);
    // Let the in-between pages go now: at print size each holds about 35 MB, and phones have little
    // canvas memory. (A step without its effect hands back the canvas it was given, which is kept.)
    if (b !== a) a.width = a.height = 0;
    if (c !== b) b.width = b.height = 0;
    return c;
  } catch (e) {
    // A step that failed (out of canvas memory, most often) returned nothing, so every canvas made so
    // far is an in-between one: let them go, or trying again has to find their memory as well.
    for (const x of [a, b]) if (x) x.width = x.height = 0;
    throw e;
  } finally {
    const s = useEditor.getState();
    use(s.S, s.doc);
    computeLayout();
  }
}

/** The browser's encoding of the canvas as a PNG or a JPEG (at `quality`, 0–1), as bytes. */
export function encodeCanvas(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('encode')); return; }
      blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)), reject);
    }, type, quality);
  });
}
