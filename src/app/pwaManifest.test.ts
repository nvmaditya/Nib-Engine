// Node: reads public/ from the repo root.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KICK_PAGE, NIB_MANIFEST, PWA_WORKBOX } from './pwaManifest';

// (Not `new URL('../..', import.meta.url)`: Vite rewrites that pattern as an asset URL on the jsdom page.)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pngSize = (file: string): [number, number] => {
  const b = readFileSync(join(ROOT, 'public', file));
  expect(b.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
test('the manifest names Nib, in its own colours, and installs where the page is', () => {
  expect(NIB_MANIFEST).toMatchObject({ name: 'Nib', short_name: 'Nib', start_url: './', scope: './', display: 'standalone', lang: 'en',
    background_color: '#F7F7F8', theme_color: '#FFFFFF', description: 'Turn typed text into realistic handwritten pages, then download them as a PDF or images.' });
  // No `id`: it would resolve against the origin (https://nvmaditya.github.io/), not the page. Without one, the app's
  // identity is its start_url, …/nib-engine/.
  expect(NIB_MANIFEST).not.toHaveProperty('id');
});
test('every icon is a PNG of the size it says, with one to mask', () => {
  expect(NIB_MANIFEST.icons!.map(i => [i.src, i.sizes, i.purpose])).toEqual([
    ['icons/icon-192.png', '192x192', 'any'], ['icons/icon-512.png', '512x512', 'any'], ['icons/maskable-512.png', '512x512', 'maskable']]);
  for (const i of NIB_MANIFEST.icons!) expect(pngSize(i.src).join('x')).toBe(i.sizes);
  expect(pngSize('icons/apple-touch-icon.png')).toEqual([180, 180]);
  expect(pngSize('icons/social.png')).toEqual([1200, 630]);
});
test('the service worker keeps every hand, the paper photo and the app, and leaves the licences out', () => {
  const exts = /\{(.+)\}/.exec(PWA_WORKBOX.globPatterns![0])![1].split(',');
  const files = [...readdirSync(join(ROOT, 'public/fonts')).filter(f => f.endsWith('.woff')), 'paper/photo.webp', 'favicon.svg'];
  for (const f of files) expect(exts).toContain(f.split('.').pop());
  expect(exts).toEqual(expect.arrayContaining(['js', 'css', 'html', 'woff2', 'png', 'webmanifest']));
  expect(PWA_WORKBOX).toMatchObject({ globIgnores: ['fonts/licenses/**', 'icons/social.png', KICK_PAGE], navigateFallback: 'index.html', cleanupOutdatedCaches: true,
    clientsClaim: true, skipWaiting: false, maximumFileSizeToCacheInBytes: 3 * 1024 * 1024 });
});
test('a link to a licence or the social image opens that file, not the app', () => {
  const deny = PWA_WORKBOX.navigateFallbackDenylist!;
  expect(deny.map(String)).toEqual([String(/\/fonts\/licenses\//), String(/\/icons\/social\.png$/), String(/\/sw-kick\.html$/)]);
  // What Workbox's NavigationRoute tests: the path and search of a navigation.
  const fallsBack = (path: string) => !deny.some(r => r.test(path));
  for (const path of ['/nib-engine/', '/nib-engine/index.html', '/nib-engine/?utm_source=x']) expect(fallsBack(path)).toBe(true);
  for (const path of ['/nib-engine/fonts/licenses/zeyada.txt', '/nib-engine/icons/social.png', `/nib-engine/${KICK_PAGE}`]) expect(fallsBack(path)).toBe(false);
});
test('the page Reload loads unseen to wake a waiting version is an empty file of its own: never the app, never precached', () => {
  // (src/app/updates.ts) Loaded as the app, it would start a second copy of Nib on the same storage.
  const html = readFileSync(join(ROOT, 'public', KICK_PAGE), 'utf8');
  expect(html.length).toBeLessThan(200);
  expect(html).toMatch(/^<!doctype html>/i);
  expect(html).not.toMatch(/<(script|link|img|iframe|object|embed|meta http-equiv)/i);
  expect(PWA_WORKBOX.globIgnores).toContain(KICK_PAGE); // (every .html is precached otherwise)
  expect(PWA_WORKBOX.navigateFallbackDenylist!.some(r => r.test(`/nib-engine/${KICK_PAGE}`))).toBe(true);
});
test('Google’s copies of the hands are kept once fetched, so a reload offline finds them', () =>
  expect(PWA_WORKBOX.runtimeCaching!.map(r => [String(r.urlPattern), r.handler, r.options?.cacheName])).toEqual([
    [String(/^https:\/\/fonts\.googleapis\.com\//), 'StaleWhileRevalidate', 'nib-google-fonts-css'],
    [String(/^https:\/\/fonts\.gstatic\.com\//), 'CacheFirst', 'nib-google-fonts']]));
