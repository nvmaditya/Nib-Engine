import { useSyncExternalStore } from 'react';

export type Stage = 'write' | 'outline' | 'style' | 'export';
export type Route = { name: 'home' } | { name: 'doc'; id: string; stage: Stage };

/** The id of the in-memory document used when this device can't store anything. */
export const MEMORY_ID = 'memory';

const STAGES: readonly Stage[] = ['write', 'outline', 'style', 'export'];

export function parseHash(hash: string): Route {
  const m = /^#\/d\/([^/]+)(?:\/([^/]*))?\/?$/.exec(hash);
  if (!m) return { name: 'home' };
  const stage = STAGES.find(s => s === m[2]) ?? 'write';
  try { return { name: 'doc', id: decodeURIComponent(m[1]), stage }; } catch { return { name: 'home' }; }
}

export function formatRoute(r: Route): string {
  return r.name === 'home' ? '#/' : `#/d/${encodeURIComponent(r.id)}/${r.stage}`;
}

export function navigate(r: Route): void {
  const h = formatRoute(r);
  if (location.hash !== h) location.hash = h;
}

const before: (() => void)[] = [];
/** Run `fn` whenever the address changes, before the app hears of it (so a store can catch up first). */
export function beforeRouteChange(fn: () => void): void { before.push(fn); }

const subscribe = (cb: () => void) => {
  const changed = () => { for (const fn of before) fn(); cb(); };
  window.addEventListener('hashchange', changed);
  return () => window.removeEventListener('hashchange', changed);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  return parseHash(hash);
}
