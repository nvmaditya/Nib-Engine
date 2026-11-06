export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'nib.theme';
const QUERY = '(prefers-color-scheme: dark)';

function systemDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(p: ThemePref, isSystemDark: boolean): void {
  const dark = p === 'dark' || (p === 'system' && isSystemDark);
  document.documentElement.classList.toggle('dark', dark);
}

export function setThemePref(p: ThemePref): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* storage unavailable: still apply for this session */
  }
  applyTheme(p, systemDark());
}

/** Applies the stored preference now and follows OS changes while it is 'system'. Returns an unsubscribe. */
export function initTheme(): () => void {
  applyTheme(getThemePref(), systemDark());
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(QUERY);
  const onChange = () => {
    if (getThemePref() === 'system') applyTheme('system', mq.matches);
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
