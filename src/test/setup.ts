import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { encodeCanvas } from './images';
import { answer } from './media';

// jsdom has no canvas. The engine creates a canvas at import time, so give it a 2D context
// whose methods do nothing and whose text measuring is a fixed 8px per character.
const noop = () => {};
function makeContext() {
  const target: Record<string, unknown> = {
    measureText: (text: string) => ({ width: String(text).length * 8 }),
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    // The glyph engine maps each letter's outline through the canvas's current transform.
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k as string] : noop),
    set: (t, k, v) => { t[k as string] = v; return true; },
  });
}
HTMLCanvasElement.prototype.getContext = function () { return makeContext(); } as unknown as HTMLCanvasElement['getContext'];

// jsdom can't encode a canvas (its toBlob answers null). Answer with a clean PNG or JPEG of the canvas's size,
// through queueMicrotask, which fake timers don't hold up. Tests of the metadata scrubbers stub their own with metadata.
HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, cb: BlobCallback, type?: string) {
  queueMicrotask(() => cb(encodeCanvas(this, type)));
};

// jsdom has no Path2D. The glyph engine builds each letter's outline as one, so a real hand's
// letters can be drawn (onto the stub, which draws nothing) when a test loads its font file.
class NoPath2D { moveTo() {} lineTo() {} quadraticCurveTo() {} bezierCurveTo() {} closePath() {} }
if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = NoPath2D as unknown as typeof Path2D;

// jsdom has no ResizeObserver; Radix components and the page view observe sizes with it.
class NoResizeObserver { observe() {} unobserve() {} disconnect() {} }
if (typeof globalThis.ResizeObserver === 'undefined') globalThis.ResizeObserver = NoResizeObserver as unknown as typeof ResizeObserver;

// jsdom does no layout. ProseMirror measures ranges and elements and scrolls the selection into view,
// so where jsdom lacks these, give it empty boxes, a scroll that does nothing and no element at any point.
const emptyRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) }) as DOMRect;
const emptyRects = () => Object.assign([] as DOMRect[], { item: () => null }) as unknown as DOMRectList;
if (typeof Range !== 'undefined') {
  if (!Range.prototype.getClientRects) Range.prototype.getClientRects = emptyRects;
  if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = emptyRect;
}
if (typeof Element !== 'undefined') {
  if (!Element.prototype.getClientRects) Element.prototype.getClientRects = emptyRects;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
}
if (typeof document !== 'undefined' && !document.elementFromPoint) document.elementFromPoint = () => null;

// jsdom has no matchMedia. Tests run in a wide window (jsdom's 1024 px): `(min-width: …)` and
// `(max-width: …)` queries are answered from window.innerWidth, and every other query doesn't match.
// A phone test puts its own in place.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) => ({
    matches: answer(query, window.innerWidth), media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }) as MediaQueryList;
}

// The first-visit tips have been seen, so a test that opens a document sees only the document. Tips.test.tsx
// clears this to show them; a test that clears localStorage itself sets it again.
beforeEach(() => {
  try { localStorage.setItem('nib.tips', 'seen'); } catch { /* a test's own blocked storage */ }
});
