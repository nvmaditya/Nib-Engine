import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A relative base keeps every asset path working wherever the site is served from,
// including a GitHub Pages project URL like https://<user>.github.io/longhand/.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
});
