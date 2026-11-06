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
