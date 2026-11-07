import { useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

export const THEME_KEY = 'nib.theme';
/** The browser bar (`<meta name="theme-color">`) in each theme: the top bar's surface. index.html's boot script uses the same dark value. */
export const THEME_COLOR = { light: '#FFFFFF', dark: '#16161A' } as const;
const QUERY = '(prefers-color-scheme: dark)';

// index.html's `<script data-theme-boot>` sets html.dark and the bar colour before anything is drawn,
// by the same rule as applyTheme(getThemePref(), system dark). This module takes over once the bundle runs.

/** Whatever shows the theme (the menu, the palette, the messages) listens here, through useThemePref and useDarkTheme. */
const listeners = new Set<() => void>();
function tell(): void {
  for (const fn of [...listeners]) fn();
}
function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** A choice this page couldn't store (storage blocked or full). It holds until the page closes or another tab stores one. */
let unsaved: ThemePref | null = null;

function systemDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

export function getThemePref(): ThemePref {
  if (unsaved) return unsaved;
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Shows `p` (with the system dark or not): html.dark and the browser bar's colour. */
export function applyTheme(p: ThemePref, isSystemDark: boolean): void {
  const dark = p === 'dark' || (p === 'system' && isSystemDark);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light);
  tell();
}

export function setThemePref(p: ThemePref): void {
  try {
    localStorage.setItem(THEME_KEY, p);
    unsaved = null;
  } catch {
    unsaved = p; // storage unavailable: still apply, and remember, for this page
  }
  applyTheme(p, systemDark());
}

/**
 * Applies the stored preference now, follows OS changes while it is 'system', and follows a choice
 * made in another tab (its `storage` event). Returns one remover for both listeners.
 */
export function initTheme(): () => void {
  applyTheme(getThemePref(), systemDark());
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY && e.key !== null) return; // (null: the other tab cleared its storage)
    unsaved = null;
    applyTheme(getThemePref(), systemDark());
  };
  window.addEventListener('storage', onStorage);
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
  const onChange = () => {
    if (mq && getThemePref() === 'system') applyTheme('system', mq.matches);
  };
  mq?.addEventListener('change', onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    mq?.removeEventListener('change', onChange);
  };
}

/** The theme chosen (System, Light or Dark), following changes here and in other tabs. */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, getThemePref);
}

/** Whether the page is dark now (html.dark), following the choice, the system and other tabs. */
export function useDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, () => document.documentElement.classList.contains('dark'));
}
