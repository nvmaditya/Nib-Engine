import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

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
  };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k as string] : noop),
    set: (t, k, v) => { t[k as string] = v; return true; },
  });
}
HTMLCanvasElement.prototype.getContext = function () { return makeContext(); } as unknown as HTMLCanvasElement['getContext'];

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
  const px = (v: string, unit: string) => parseFloat(v) * (unit === 'rem' || unit === 'em' ? 16 : 1);
  window.matchMedia = (query: string) => {
    const m = /^\(\s*(min|max)-width:\s*([\d.]+)(px|rem|em)\s*\)$/.exec(query.trim());
    const w = window.innerWidth, matches = !!m && (m[1] === 'min' ? w >= px(m[2], m[3]) : w <= px(m[2], m[3]));
    return {
      matches, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    } as MediaQueryList;
  };
}
