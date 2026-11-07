// Node: reads public/ from the repo root.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NIB_MANIFEST, PWA_WORKBOX } from './pwaManifest';

// (Not `new URL('../..', import.meta.url)`: Vite rewrites that pattern as an asset URL on the jsdom page.)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pngSize = (file: string): [number, number] => {
  const b = readFileSync(join(ROOT, 'public', file));
  expect(b.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
test('the manifest names Nib, in its own colours, and installs where the page is', () =>
  expect(NIB_MANIFEST).toMatchObject({ id: './', name: 'Nib', short_name: 'Nib', start_url: './', scope: './', display: 'standalone', lang: 'en',
    background_color: '#F7F7F8', theme_color: '#FFFFFF', description: 'Turn typed text into realistic handwritten pages, then download them as a PDF or images.' }));
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
  expect(PWA_WORKBOX).toMatchObject({ globIgnores: ['fonts/licenses/**', 'icons/social.png'], navigateFallback: 'index.html', cleanupOutdatedCaches: true,
    clientsClaim: true, skipWaiting: false, maximumFileSizeToCacheInBytes: 3 * 1024 * 1024 });
});
test('Google’s copies of the hands are kept once fetched, so a reload offline finds them', () =>
  expect(PWA_WORKBOX.runtimeCaching!.map(r => [String(r.urlPattern), r.handler, r.options?.cacheName])).toEqual([
    [String(/^https:\/\/fonts\.googleapis\.com\//), 'StaleWhileRevalidate', 'nib-google-fonts-css'],
    [String(/^https:\/\/fonts\.gstatic\.com\//), 'CacheFirst', 'nib-google-fonts']]));
