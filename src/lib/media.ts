import { useSyncExternalStore } from 'react';

/** Whether a media query matches; false where the browser (or the test DOM) can't tell. */
export function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

/** The `wide:` breakpoint (app.css `--breakpoint-wide`, 860 px). */
export const WIDE = '(min-width: 53.75rem)';

function onWideChange(fn: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(WIDE);
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
}
const wideNow = () => matches(WIDE);

/** Whether the window is at least 860 px wide (`wide:`), following changes; false where it can't tell. */
export function useWide(): boolean {
  return useSyncExternalStore(onWideChange, wideNow, () => false);
}
