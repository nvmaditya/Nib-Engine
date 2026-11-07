/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { NIB_MANIFEST, PWA_WORKBOX } from './src/app/pwaManifest';

// Tests that draw real pixels in the Chromium of the Playwright installed on this machine. Playwright is
// not a project dependency (CI doesn't have it), so `npm test` leaves them out. `npm run test:browser`
// runs them (vitest.browser.config.ts), and `npm run smoke` runs that first.
const BROWSER_TESTS = 'src/**/*.browser.test.ts';

// A relative base keeps every asset path working wherever the site is served from,
// including a GitHub Pages project URL like https://<user>.github.io/longhand/.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(),
    // The manifest and a Workbox service worker that keeps the whole app for offline use (src/app/pwaManifest.ts).
    // Only a production build has one: development leaves it off (devOptions), and tests (VITEST) have none at all.
    // src/app/pwa.ts registers it and offers a new version; nothing is injected into index.html.
    VitePWA({ disable: process.env.VITEST !== undefined, registerType: 'prompt', injectRegister: false, manifest: NIB_MANIFEST, workbox: PWA_WORKBOX })],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
  // The default reporter, wherever the tests run: some runners pick a quieter one that hides what a passing test
  // prints, and a test's output should stay clean (no act warnings, no console noise).
  test: { environment: 'jsdom', setupFiles: ['src/test/setup.ts'], globals: true, reporters: ['default'],
    exclude: [...configDefaults.exclude, '.claude/**', '.superpowers/**', BROWSER_TESTS] },
});
