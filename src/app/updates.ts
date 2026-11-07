// New versions of Nib are offered, never forced (Design decision 2 of the M6 plan). vite-plugin-pwa's registerSW
// (src/app/pwa.ts) tells this tab when a new version is waiting (onNeedRefresh), and when one has taken over
// (onNeedReload), which happens in every open tab as soon as any one of them presses Reload. Only the tab whose Reload
// was pressed reloads, after writing its last change; every other tab keeps its text and caret and says so.
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { flushSave, reloadAction, setReloader, toast } from '@/store/editor';

export const NEW_VERSION = 'A new version is ready.';
export const OFFLINE_READY = 'Nib works offline now.';
/** How often a page that is shown looks for a new version (ms). */
export const CHECK_EVERY = 3_600_000;
/** How long Reload waits for the new version to take over before it reloads anyway (ms). */
export const RELOAD_FALLBACK = 3000;

/** No new version known; one is waiting; one has taken over (this tab still runs the old one). */
export type UpdateState = 'current' | 'waiting' | 'active';

type Register = (o: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>;

let state: UpdateState = 'current';
let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null; // asks the waiting version to take over
let reload = (): void => location.reload();
let asked = false; // this tab pressed Reload while a new version was waiting
let reloaded = false;
let fallback: ReturnType<typeof setTimeout> | undefined;
let stopChecks = (): void => {};

export const updateState = (): UpdateState => state;

/** Say a new version is ready, with Reload. It stays up until pressed or swiped away, whatever document opens or closes. */
const offer = (): void => toast(NEW_VERSION, reloadAction(), { keep: true, duration: Infinity });

function reloadOnce(): void {
  clearTimeout(fallback);
  if (reloaded) return;
  reloaded = true;
  reload();
}

/**
 * Register the service worker (`register` is vite-plugin-pwa's registerSW; tests pass a fake) and offer each new
 * version. A message's Reload (this one, or a document a newer Nib saved) goes through `reloadToNewVersion`.
 */
export function startUpdates(register: Register, hooks: { reload(): void } = { reload: () => location.reload() }): void {
  reload = () => hooks.reload();
  setReloader(() => { void reloadToNewVersion(); });
  applyUpdate = register({
    onNeedRefresh() { state = 'waiting'; offer(); },
    onNeedReload() {
      state = 'active';
      if (asked) reloadOnce(); // this tab pressed Reload
      else offer(); // another tab did: nothing changes here but the message
    },
    onOfflineReady() { toast(OFFLINE_READY); },
    onRegisteredSW(_url, registration) { if (registration) checkHourly(registration); },
  });
}

/**
 * Reload onto the new version: write the change waiting to be saved, then, if a new version is waiting, ask it to
 * take over and reload when it has (or after `RELOAD_FALLBACK` if it never does). A plain reload while it waits would
 * load the old version again, from its cache.
 */
export async function reloadToNewVersion(): Promise<void> {
  await flushSave();
  if (state !== 'waiting' || !applyUpdate) { reloadOnce(); return; }
  asked = true;
  clearTimeout(fallback);
  fallback = setTimeout(reloadOnce, RELOAD_FALLBACK);
  try { await applyUpdate(true); } catch { reloadOnce(); }
}

/** Look for a new version every hour while the page is shown, and when it is shown again an hour or more since. */
function checkHourly(registration: ServiceWorkerRegistration): void {
  stopChecks();
  let last = Date.now();
  const check = () => { last = Date.now(); registration.update().catch(() => {}); }; // (offline: the next one tries again)
  const shown = () => document.visibilityState === 'visible';
  const timer = setInterval(() => { if (shown()) check(); }, CHECK_EVERY);
  const onShow = () => { if (shown() && Date.now() - last >= CHECK_EVERY) check(); };
  document.addEventListener('visibilitychange', onShow);
  stopChecks = () => { clearInterval(timer); document.removeEventListener('visibilitychange', onShow); };
}

export function resetUpdatesForTests(): void {
  stopChecks(); stopChecks = () => {};
  clearTimeout(fallback); fallback = undefined;
  state = 'current'; applyUpdate = null; asked = false; reloaded = false;
  reload = () => location.reload();
  setReloader(() => location.reload());
}
