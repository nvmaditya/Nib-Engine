/** Whether a media query matches; false where the browser (or the test DOM) can't tell. */
export function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

