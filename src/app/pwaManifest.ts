import type { ManifestOptions, VitePWAOptions } from 'vite-plugin-pwa';

// What vite-plugin-pwa writes at build: the web app manifest and the Workbox service worker (vite.config.ts).
// Pure data, so a test can check it without a build.

/**
 * The manifest. Every path is relative, so Nib installs wherever it is served from (as /nib-engine/ on GitHub Pages).
 * It has no `id`: an id resolves against start_url's origin, so `./` would make the site's root the app's permanent
 * identity. Without one, the identity is start_url itself (…/nib-engine/).
 */
export const NIB_MANIFEST: Partial<ManifestOptions> = {
  name: 'Nib',
  short_name: 'Nib',
  description: 'Turn typed text into realistic handwritten pages, then download them as a PDF or images.',
  lang: 'en',
  dir: 'ltr',
  start_url: './',
  scope: './',
  display: 'standalone',
  // The quiet Studio surfaces of the light theme (the top bar and the page behind it); the brand ink is in the icon.
  background_color: '#F7F7F8',
  theme_color: '#FFFFFF',
  categories: ['education', 'productivity'],
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

const YEAR = 60 * 60 * 24 * 365;

/**
 * The service worker precaches everything a document can need, so a hand, a reader or the paper never used on
 * this device still works offline: the app and engine, pdf.js and its worker, mammoth, every hand's font file,
 * the paper photo and the icons. The licences and the social image are left out. Google's web copies of the
 * hands (index.html) are cached the first time they are fetched.
 */
export const PWA_WORKBOX: NonNullable<VitePWAOptions['workbox']> = {
  globPatterns: ['**/*.{js,css,html,svg,png,webp,woff,woff2,webmanifest}'],
  globIgnores: ['fonts/licenses/**', 'icons/social.png'],
  // Above the 1.3 MB app bundle and the 1.09 MB pdf.js worker (Workbox's default is 2 MiB).
  maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
  navigateFallback: 'index.html',
  // Files that are deployed but not precached are opened as themselves, not as the app.
  navigateFallbackDenylist: [/\/fonts\/licenses\//, /\/icons\/social\.png$/],
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  // A new version waits until a tab asks for it (src/app/pwa.ts): it is offered, never forced.
  skipWaiting: false,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'nib-google-fonts-css', expiration: { maxEntries: 4 } },
    },
    {
      urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
      handler: 'CacheFirst',
      options: { cacheName: 'nib-google-fonts', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 60, maxAgeSeconds: YEAR } },
    },
  ],
};
