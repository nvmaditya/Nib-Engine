/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// A relative base keeps every asset path working wherever the site is served from,
// including a GitHub Pages project URL like https://<user>.github.io/longhand/.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
  test: { environment: 'jsdom', setupFiles: ['src/test/setup.ts'], globals: true },
});
