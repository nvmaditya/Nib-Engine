/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tests that draw real pixels in the Chromium of the Playwright installed on this machine. Playwright is
// not a project dependency (CI doesn't have it), so `npm test` leaves them out. `npm run test:browser`
// runs them (vitest.browser.config.ts), and `npm run smoke` runs that first.
const BROWSER_TESTS = 'src/**/*.browser.test.ts';

// A relative base keeps every asset path working wherever the site is served from,
// including a GitHub Pages project URL like https://<user>.github.io/longhand/.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
  test: { environment: 'jsdom', setupFiles: ['src/test/setup.ts'], globals: true,
    exclude: [...configDefaults.exclude, '.claude/**', '.superpowers/**', BROWSER_TESTS] },
});
