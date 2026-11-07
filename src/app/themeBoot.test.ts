import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// index.html's inline script decides the theme before the stylesheets and the bundle load, so the first frame is already right.
// (Not `new URL(…, import.meta.url)`: Vite turns that into an asset URL.)
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../index.html'), 'utf8');
const boot = /<script data-theme-boot>([\s\S]*?)<\/script>/.exec(html)![1];

/** Runs the boot script on a fresh page with `stored` in storage (or storage that throws) and the system dark or not: [html.dark, theme-color]. */
function bootWith(stored: string | null | 'blocked', systemDark: boolean): [boolean, string] {
  document.documentElement.className = '';
  document.head.innerHTML = '<meta name="theme-color" content="#FFFFFF">';
  vi.stubGlobal('localStorage', { getItem: () => { if (stored === 'blocked') throw new Error('blocked'); return stored; } });
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: systemDark && q === '(prefers-color-scheme: dark)' }));
  new Function(boot)();
  return [document.documentElement.classList.contains('dark'), document.querySelector('meta[name="theme-color"]')!.getAttribute('content')!];
}

afterEach(() => vi.unstubAllGlobals());

test.each([
  ['dark', false, true], ['light', true, false], ['system', true, true], ['system', false, false],
  [null, true, true], [null, false, false], ['pink', true, true], ['blocked', true, true], ['blocked', false, false],
] as const)('index.html decides the theme before anything is drawn: stored %s, dark system %s → dark %s', (stored, sys, dark) =>
  expect(bootWith(stored, sys)).toEqual([dark, dark ? '#16161A' : '#FFFFFF']));

test('the boot script comes after the theme-color meta and before every stylesheet and script', () => {
  const at = html.indexOf('<script data-theme-boot>');
  expect(at).toBeGreaterThan(html.indexOf('name="theme-color"'));
  expect(at).toBeLessThan(html.indexOf('rel="stylesheet"'));
  expect(at).toBeLessThan(html.indexOf('<script type="module"'));
});

test('the browser bar starts light, the colour of the light top bar', () => {
  expect(html).toContain('<meta name="theme-color" content="#FFFFFF">');
});
