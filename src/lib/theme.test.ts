import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, renderHook } from '@testing-library/react';
import { THEME_COLOR, applyTheme, getThemePref, initTheme, setThemePref, useDarkTheme, useThemePref } from './theme';

const QUERY = '(prefers-color-scheme: dark)';
const html = document.documentElement;
const bar = () => document.querySelector('meta[name="theme-color"]')!.getAttribute('content');
let stop: (() => void) | undefined;

beforeEach(() => {
  localStorage.clear();
  html.className = '';
  document.head.innerHTML = '<meta name="theme-color" content="#FFFFFF">';
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
});

/** A system whose dark setting the test changes: `set` fires the `change` listeners, as the browser does. */
function systemStub(dark: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches: dark, media: QUERY,
    addEventListener: (_: string, fn: () => void) => { listeners.add(fn); },
    removeEventListener: (_: string, fn: () => void) => { listeners.delete(fn); },
  };
  const other = { matches: false, addEventListener: () => {}, removeEventListener: () => {} };
  vi.stubGlobal('matchMedia', (q: string) => (q === QUERY ? mq : other));
  return {
    set(d: boolean) { mq.matches = d; act(() => listeners.forEach(fn => fn())); },
    listening: () => listeners.size,
  };
}

test('system preference follows the OS', () => {
  applyTheme('system', true);
  expect(html).toHaveClass('dark');
  applyTheme('system', false);
  expect(html).not.toHaveClass('dark');
});

test('explicit choice wins and is stored', () => {
  setThemePref('dark');
  expect(localStorage.getItem('nib.theme')).toBe('dark');
  expect(getThemePref()).toBe('dark');
  expect(html).toHaveClass('dark');
});

test('unknown stored value falls back to system', () => {
  localStorage.setItem('nib.theme', 'pink');
  expect(getThemePref()).toBe('system');
});

test('the browser bar takes the theme’s colour', () => {
  expect(THEME_COLOR).toEqual({ light: '#FFFFFF', dark: '#16161A' });
  setThemePref('dark');
  expect(bar()).toBe('#16161A');
  setThemePref('light');
  expect(bar()).toBe('#FFFFFF');
  applyTheme('system', true);
  expect(bar()).toBe('#16161A');
});

test('a choice made in another tab is followed here', () => {
  systemStub(false);
  stop = initTheme();
  const { result } = renderHook(useThemePref);
  const dark = renderHook(useDarkTheme).result;
  expect([result.current, dark.current]).toEqual(['system', false]);

  localStorage.setItem('nib.theme', 'dark');
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'nib.theme', newValue: 'dark' })); });
  expect(html).toHaveClass('dark');
  expect(bar()).toBe('#16161A');
  expect([result.current, dark.current]).toEqual(['dark', true]);

  // Another tab clearing its storage brings back System.
  localStorage.clear();
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: null })); });
  expect(html).not.toHaveClass('dark');
  expect([result.current, dark.current]).toEqual(['system', false]);

  // Another key changing leaves the theme alone.
  localStorage.setItem('nib.theme', 'dark');
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'nib.phoneFace', newValue: 'pages' })); });
  expect(html).not.toHaveClass('dark');
});

test('useDarkTheme follows the system while the choice is System', () => {
  const system = systemStub(false);
  stop = initTheme();
  const { result } = renderHook(useDarkTheme);
  expect(result.current).toBe(false);
  system.set(true);
  expect(result.current).toBe(true);
  expect(bar()).toBe('#16161A');
  system.set(false);
  expect(result.current).toBe(false);

  // A choice of Light or Dark is kept whatever the system does.
  act(() => setThemePref('dark'));
  expect(result.current).toBe(true);
  system.set(true);
  system.set(false);
  expect(result.current).toBe(true);
});

test('setThemePref tells useThemePref and useDarkTheme', () => {
  systemStub(true);
  const pref = renderHook(useThemePref).result;
  const dark = renderHook(useDarkTheme).result;
  act(() => setThemePref('light'));
  expect([pref.current, dark.current]).toEqual(['light', false]);
  act(() => setThemePref('system'));
  expect([pref.current, dark.current]).toEqual(['system', true]);
});

test('initTheme’s one remover stops following both the system and other tabs', () => {
  const system = systemStub(false);
  initTheme()();
  expect(system.listening()).toBe(0);
  system.set(true);
  localStorage.setItem('nib.theme', 'dark');
  window.dispatchEvent(new StorageEvent('storage', { key: 'nib.theme', newValue: 'dark' }));
  expect(html).not.toHaveClass('dark');
});

test('with storage blocked, a choice still holds on this page', () => {
  const system = systemStub(false);
  const blocked = () => { throw new Error('blocked'); };
  vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
  try {
    stop = initTheme();
    const { result } = renderHook(useThemePref);
    expect(result.current).toBe('system');
    act(() => setThemePref('dark'));
    expect(result.current).toBe('dark');
    system.set(true);
    system.set(false);
    expect(html).toHaveClass('dark');
  } finally {
    vi.unstubAllGlobals();
    act(() => setThemePref('system')); // storage works again, so the page goes back to reading it
  }
});

// The same table as index.html's boot test (src/app/themeBoot.test.ts): what the page shows before the bundle
// runs must be what initTheme shows once it does, or the page would change colour as it starts.
// (Not `new URL(…, import.meta.url)`: Vite turns that into an asset URL.)
const index = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../index.html'), 'utf8');
const boot = /<script data-theme-boot>([\s\S]*?)<\/script>/.exec(index)?.[1] ?? '';
function bootWith(stored: string | null | 'blocked', systemDark: boolean): [boolean, string] {
  html.className = '';
  document.head.innerHTML = '<meta name="theme-color" content="#FFFFFF">';
  vi.stubGlobal('localStorage', { getItem: () => { if (stored === 'blocked') throw new Error('blocked'); return stored; } });
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: systemDark && q === QUERY }));
  new Function(boot)();
  return [html.classList.contains('dark'), bar()!];
}
test.each([
  ['dark', false], ['light', true], ['system', true], ['system', false],
  [null, true], [null, false], ['pink', true], ['blocked', true], ['blocked', false],
] as const)('the boot script and applyTheme agree: stored %s, dark system %s', (stored, sys) => {
  const before = bootWith(stored, sys);
  html.className = '';
  document.head.innerHTML = '<meta name="theme-color" content="#FFFFFF">';
  applyTheme(getThemePref(), sys); // what initTheme does, reading the same storage
  expect([html.classList.contains('dark'), bar()]).toEqual(before);
});
