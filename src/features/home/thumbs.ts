// Thumbnails of page 1. Each is the engine's own `composePage(0, px)`, encoded as a JPEG and kept on the
// device in `prefs` under `thumb:<owner>`. It is drawn again only when what page 1 is drawn from changes.
// Drawing is one at a time (phones limit total canvas memory), and the canvas is released at once.
import { FONTS } from '@/engine/config.js';
import { composePage, computeLayout, fontStr, loadFont, photoLoaded, use } from '@/engine/core.js';
import type { EngineDoc, Settings } from '@/engine/types';
import { encodeCanvas } from '@/features/export/render';
import { getDb } from '@/store/db';
import { getPref, setPref } from '@/store/documents';
import { useEditor } from '@/store/editor';

export const THUMB_VERSION = 1;
export const RECENT_PX = 156;
export const TEMPLATE_PX = 360;
export const THUMB_JPEG = 0.82;

export interface Thumb { url: string; pages: number }
interface Stored { sig: string; jpeg: Uint8Array; pages: number }

const keep = new Map<string, { sig: string; thumb: Thumb }>();
export const clearThumbMemory = (): void => { keep.clear(); lastScroll = -Infinity; };

/** FNV-1a (32 bits) of what page 1 is drawn from, as 8 hex digits. A rename doesn't change it. */
export function thumbSig(S: Settings, doc: EngineDoc, px: number): string {
  const s = JSON.stringify([THUMB_VERSION, px, S, doc]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** The document's hands: its own, then each block's own, once each, those the app has. */
export function handsOf(S: Settings, doc: EngineDoc): string[] {
  const out: string[] = [];
  for (const id of [S.font, ...doc.boxes.map(b => b.style?.font)]) {
    if (id && !out.includes(id) && FONTS.some(f => f.id === id)) out.push(id);
  }
  return out;
}

/** Bytes as a `data:` URL, base64 through `btoa` in chunks. */
export function dataUrl(bytes: Uint8Array, type: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return `data:${type};base64,${btoa(bin)}`;
}

/**
 * Page 1 of the document, `px` wide, drawn by the engine, and how many pages it has. Afterwards (even if
 * drawing fails) the engine is back on the open document, laid out again only while one is open.
 */
export function drawThumb(S: Settings, doc: EngineDoc, px: number): { canvas: HTMLCanvasElement; pages: number } {
  try {
    use(S, doc);
    const pages = computeLayout().pages;
    return { canvas: composePage(0, px), pages };
  } finally {
    const s = useEditor.getState();
    use(s.S, s.doc);
    if (s.docId !== null) computeLayout();
  }
}

export function peekThumb(owner: string, sig: string): Thumb | null {
  const k = keep.get(owner);
  return k && k.sig === sig ? k.thumb : null;
}

export async function forgetThumb(owner: string): Promise<void> {
  keep.delete(owner);
  try { await (await getDb()).delete('prefs', 'thumb:' + owner); } catch { /* nothing to forget, or storage is unavailable */ }
}

const isStored = (v: unknown): v is Stored => {
  const r = v as Stored | undefined;
  return !!r && typeof r.sig === 'string' && typeof r.pages === 'number' && ArrayBuffer.isView(r.jpeg);
};

const READY_MS = 10000;

/** Waits for every hand and the engine's own photographed paper, for at most 10 s. False when one can't be had. */
function ready(S: Settings, doc: EngineDoc): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>(r => { timer = setTimeout(() => r(false), READY_MS); });
  return Promise.race([wait(S, doc), timeout]).finally(() => clearTimeout(timer));
}

async function wait(S: Settings, doc: EngineDoc): Promise<boolean> {
  try {
    for (const id of handsOf(S, doc)) {
      if (!(await loadFont(id))) return false;
      const cfg = FONTS.find(f => f.id === id)!;
      await document.fonts?.load(fontStr(cfg, 40));
    }
    if (S.paper === 'photo' && !(await photoLoaded())) return false;
    return true;
  } catch { return false; }
}

/** How long the page must have gone without scrolling before a thumbnail is drawn (ms). */
export const SCROLL_QUIET = 150;

// When the page, or any box in it, last scrolled (heard on the way down, since a box's scroll doesn't bubble).
// Listened to from the first thumbnail on, so a scroll that has just stopped is known when the next one's turn comes.
let lastScroll = -Infinity, hearing = false;
const heard = (): void => { lastScroll = performance.now(); };

/**
 * Waits for a moment to draw a thumbnail in: idle time (at most 500 ms away), then until nothing has scrolled for
 * SCROLL_QUIET ms. A drawing takes 50 to 100 ms on the main thread, which would stall a scroll that is going on.
 */
export async function drawSlot(): Promise<void> {
  if (!hearing) { hearing = true; window.addEventListener('scroll', heard, { capture: true, passive: true }); }
  await new Promise<void>(r => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => r(), { timeout: 500 });
    else setTimeout(r, 0);
  });
  for (let left; (left = lastScroll + SCROLL_QUIET - performance.now()) > 0;) await new Promise<void>(r => setTimeout(r, left));
}

let queue: Promise<unknown> = Promise.resolve();

async function job(owner: string, S: Settings, doc: EngineDoc, px: number, sig: string, wants: () => boolean): Promise<Thumb | null> {
  if (!wants()) return null; // a tile scrolled past doesn't hold up the ones after it
  await drawSlot();
  if (!wants()) return null;
  if (!(await ready(S, doc))) return null;
  await drawSlot(); // a hand still on its way can arrive once a scroll has begun
  if (!wants()) return null;
  const { canvas, pages } = drawThumb(S, doc, px);
  let jpeg: Uint8Array;
  try { jpeg = await encodeCanvas(canvas, 'image/jpeg', THUMB_JPEG); }
  finally { canvas.width = canvas.height = 0; }
  const thumb: Thumb = { url: dataUrl(jpeg, 'image/jpeg'), pages };
  keep.set(owner, { sig, thumb });
  try { await setPref('thumb:' + owner, { sig, jpeg, pages } satisfies Stored); } catch { /* shown for this session only */ }
  return thumb;
}

/**
 * The thumbnail for `owner` (`doc:<id>` or `tpl:<id>`): from memory, then from the device, else drawn.
 * Never rejects; null when it can't be drawn now. `wants` is asked just before drawing.
 */
export async function thumbFor(owner: string, S: Settings, doc: EngineDoc, px: number, wants: () => boolean = () => true): Promise<Thumb | null> {
  try {
    const sig = thumbSig(S, doc, px), hit = peekThumb(owner, sig);
    if (hit) return hit;
    try {
      const stored = await getPref<unknown>('thumb:' + owner);
      if (isStored(stored) && stored.sig === sig) {
        const bytes = new Uint8Array(stored.jpeg.buffer, stored.jpeg.byteOffset, stored.jpeg.byteLength);
        const thumb: Thumb = { url: dataUrl(bytes, 'image/jpeg'), pages: stored.pages };
        keep.set(owner, { sig, thumb });
        return thumb;
      }
    } catch { /* storage unavailable: draw it */ }
    const run = queue.then(() => job(owner, S, doc, px, sig, wants));
    queue = run.catch(() => undefined);
    return await run;
  } catch { return null; }
}
