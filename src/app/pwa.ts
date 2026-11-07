import { registerSW } from 'virtual:pwa-register';

/**
 * Registers the service worker that keeps Nib for offline use (vite.config.ts, src/app/pwaManifest.ts).
 * Only a production build has one; development and tests never register anything.
 * No test imports this file: `virtual:pwa-register` is only real in a build.
 */
export function startPwa(): void {
  if (!(import.meta.env.PROD && 'serviceWorker' in navigator)) return;
  registerSW({});
}
