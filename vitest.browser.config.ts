// `npm run test:browser`: only the tests that draw real pixels in Chromium, the ones vite.config.ts leaves
// out of `npm test`. They run in Node, without jsdom or the test setup, because the page they drive with
// Playwright is the browser.
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.browser.test.ts'], exclude: [...configDefaults.exclude, '.claude/**', '.superpowers/**'], environment: 'node' },
});
