// A window whose width a test changes, as when a tablet is turned or a window resized. Its `matchMedia`
// answers `(min-width: …)` and `(max-width: …)` from the width now, as setup.ts's stub does (every other
// query doesn't match), and on a resize each `change` listener whose answer changed hears it, as in a browser.

const px = (v: string, unit: string) => parseFloat(v) * (unit === 'rem' || unit === 'em' ? 16 : 1);
/** Whether `query` matches a window `width` px wide: `(min-width: …)` and `(max-width: …)` in px, rem or em; anything else doesn't. */
export function answer(query: string, width: number): boolean {
  const m = /^\(\s*(min|max)-width:\s*([\d.]+)(px|rem|em)\s*\)$/.exec(query.trim());
  return !!m && (m[1] === 'min' ? width >= px(m[2], m[3]) : width <= px(m[2], m[3]));
}

type Listener = (e: MediaQueryListEvent) => void;

/** The window is `width` px wide until `resize`; `restore()` puts back the window and the `matchMedia` it had. */
export function resizableWindow(width: number): { resize(width: number): void; restore(): void } {
  const before = window.matchMedia, innerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  const heard = new Set<{ query: string; list: MediaQueryList; fn: Listener }>();
  let now = width;
  const setWidth = (w: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w });

  window.matchMedia = (query: string) => {
    const find = (fn: Listener) => [...heard].find(h => h.list === list && h.fn === fn);
    const add = (fn: Listener) => { if (!find(fn)) heard.add({ query, list, fn }); };
    const remove = (fn: Listener) => { const h = find(fn); if (h) heard.delete(h); };
    const list = {
      media: query, onchange: null,
      get matches() { return answer(query, now); },
      addEventListener: (type: string, fn: Listener) => { if (type === 'change') add(fn); },
      removeEventListener: (type: string, fn: Listener) => { if (type === 'change') remove(fn); },
      addListener: add, removeListener: remove, dispatchEvent: () => false,
    } as unknown as MediaQueryList;
    return list;
  };
  setWidth(width);

  return {
    resize(w: number) {
      const was = now;
      now = w;
      setWidth(w);
      for (const h of [...heard]) {
        const matches = answer(h.query, w);
        if (matches !== answer(h.query, was)) h.fn.call(h.list, { matches, media: h.query } as MediaQueryListEvent);
      }
      window.dispatchEvent(new Event('resize'));
    },
    restore() {
      window.matchMedia = before;
      if (innerWidth) Object.defineProperty(window, 'innerWidth', innerWidth);
      else delete (window as { innerWidth?: number }).innerWidth;
      heard.clear();
    },
  };
}
