// New versions of Nib are offered, never forced (Design decision 2 of the M6 plan). vite-plugin-pwa's registerSW
// (src/app/pwa.ts) tells this tab when a new version is waiting (onNeedRefresh), and when one has taken over
// (onNeedReload), which happens in every open tab as soon as any one of them presses Reload. Only the tab whose Reload
// was pressed reloads, after writing its last change; every other tab keeps its text and caret and says so.
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { SAVE_FAILED, reloadAction, setReloader, takeDownMessage, toast, useEditor, writeBeforeReload } from '@/store/editor';
import { giveFocusBack, rememberedFocus } from '@/lib/focus';
import { MEMORY_ID } from './route';

export const NEW_VERSION = 'A new version is ready.';
export const OFFLINE_READY = 'Nib works offline now.';
/** How often a page that is shown looks for a new version (ms). */
export const CHECK_EVERY = 3_600_000;
/** How long Reload waits for the new version to take over before it reloads anyway (ms). */
export const RELOAD_FALLBACK = 3000;
/** A page still here this long after its reload began had it stopped (the browser's Stop, or Esc): it is given back (ms). */
export const GIVE_BACK_AFTER = 10_000;

/** No new version known; one is waiting; one has taken over (this tab still runs the old one). */
export type UpdateState = 'current' | 'waiting' | 'active';

type Register = (o: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>;

let state: UpdateState = 'current';
let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null; // asks the waiting version to take over
let reload = (): void => location.reload();
let asked = false; // this tab pressed Reload while a new version was waiting
let reloading = false; // on its way: the last change is being written, then the page reloads
let fallback: ReturnType<typeof setTimeout> | undefined;
let stopped: ReturnType<typeof setTimeout> | undefined; // gives the page back if the reload never happens
let stopChecks = (): void => {};
let putAway = false; // the Import dialog put the message away (as it does every message, for its footer on phones)
let unfollow = (): void => {};
let unhear = (): void => {};

export const updateState = (): UpdateState => state;

/**
 * Nothing is kept on this device (storage is blocked: the document lives only in this tab). A reload would lose the
 * whole document, so no new version is offered; it takes over on the next visit, as the service worker does anyway.
 */
const inMemory = (): boolean => useEditor.getState().docId === MEMORY_ID;

/**
 * Say a new version is ready, with Reload. It stays up until pressed or swiped away, whatever document opens or
 * closes; put away by the Import dialog, it comes back when the dialog closes.
 */
function offer(): void {
  putAway = false;
  if (inMemory()) return;
  toast(NEW_VERSION, reloadAction(), {
    keep: true, duration: Infinity,
    onDismiss: () => { if (useEditor.getState().importOpen) putAway = true; }, // (not swiped away by the person)
  });
}

/**
 * Follow the store: the Import dialog closing after it put the message away, and a document with nowhere to be kept.
 * (What was seen last is kept here: `update` changes the state in place, so the previous state can't tell.)
 */
function followEditor(): () => void {
  let { docId, importOpen } = useEditor.getState();
  return useEditor.subscribe(s => {
    const closed = importOpen && !s.importOpen, memory = s.docId === MEMORY_ID && docId !== MEMORY_ID;
    docId = s.docId; importOpen = s.importOpen;
    if (state === 'current') return;
    if (memory) { putAway = false; takeDownMessage(NEW_VERSION); }
    else if (closed && putAway) offer();
  });
}

/** The last change can't be written: keep the page, say so, and offer the new version again, to try again. */
function keepPage(): void {
  toast(SAVE_FAILED);
  if (state !== 'current') offer();
}

/**
 * Reload, once, writing the last change right before: the focus went back to the editor when Reload was pressed, so
 * the person may have typed while the new version took over. Someone still typing is let pause first. Then the page
 * lets go of the focus and takes no more (`inert`, which a message's action giving the focus back respects too): the
 * old page stays on screen while the new one loads, and anything typed into it then would be lost. If the change
 * can't be written, the page stays.
 */
async function reloadOnce(): Promise<void> {
  clearTimeout(fallback);
  if (reloading) return;
  reloading = true;
  if (await writeBeforeReload({ pause: true }) === 'failed') {
    reloading = false; asked = false;
    keepPage();
    return;
  }
  const back = rememberedFocus();
  document.body.setAttribute('inert', ''); // (first: then nothing, sonner's own focus return included, can focus into it)
  (document.activeElement as HTMLElement | null)?.blur?.();
  clearTimeout(stopped);
  stopped = setTimeout(() => giveBack(back), GIVE_BACK_AFTER);
  reload();
}

/**
 * The reload was stopped (the browser's Stop, or Esc) and this page is still here: everything is written, so give
 * it back, with the focus where it was, and offer the new version again so Reload can be pressed again.
 */
function giveBack(back: HTMLElement | null): void {
  document.body.removeAttribute('inert');
  reloading = false; asked = false;
  giveFocusBack(back);
  if (state !== 'current') offer();
}

/**
 * The page's own service worker container: a new version taking charge of this page. vite-plugin-pwa says so
 * (onNeedReload) only in a tab a service worker controlled when it registered, not on a first visit or after a hard
 * reload. Returns the remover.
 */
function hearTakeover(): () => void {
  const container = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  if (!container) return () => {};
  const onChange = () => {
    if (state === 'current') return; // a first install taking charge is no news
    state = 'active';
    if (asked) void reloadOnce(); // this tab pressed Reload
    else offer(); // another tab did
  };
  container.addEventListener('controllerchange', onChange);
  return () => container.removeEventListener('controllerchange', onChange);
}

/**
 * Register the service worker (`register` is vite-plugin-pwa's registerSW; tests pass a fake) and offer each new
 * version. A message's Reload (this one, or a document a newer Nib saved) goes through `reloadToNewVersion`.
 */
export function startUpdates(register: Register, hooks: { reload(): void } = { reload: () => location.reload() }): void {
  reload = () => hooks.reload();
  setReloader(() => { void reloadToNewVersion(); });
  unfollow(); unfollow = followEditor();
  unhear(); unhear = hearTakeover();
  applyUpdate = register({
    onNeedRefresh() { state = 'waiting'; offer(); },
    onNeedReload() {
      state = 'active';
      if (asked) void reloadOnce(); // this tab pressed Reload
      else offer(); // another tab did: nothing changes here but the message
    },
    onOfflineReady() { toast(OFFLINE_READY); },
    onRegisteredSW(_url, registration) { if (registration) checkHourly(registration); },
  });
}

/**
 * Reload onto the new version: write the open document's last change, then, if a new version is waiting, ask it to
 * take over and reload when it has (or after `RELOAD_FALLBACK` if it never does). A plain reload while it waits would
 * load the old version again, from its cache. A change that can't be written keeps the page: Nib says so, and the
 * new version stays offered, to try again. (A change only a newer Nib can write goes on: the reload is the fix.)
 */
export async function reloadToNewVersion(): Promise<void> {
  if (inMemory()) return; // (never offered there: nothing would be kept)
  if (await writeBeforeReload() === 'failed') { keepPage(); return; }
  if (state !== 'waiting' || !applyUpdate) { await reloadOnce(); return; }
  asked = true;
  clearTimeout(fallback);
  fallback = setTimeout(() => { void reloadOnce(); }, RELOAD_FALLBACK);
  try { await applyUpdate(true); } catch { await reloadOnce(); }
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
  unfollow(); unfollow = () => {}; putAway = false;
  unhear(); unhear = () => {};
  document.body.removeAttribute('inert');
  clearTimeout(stopped); stopped = undefined;
  clearTimeout(fallback); fallback = undefined;
  state = 'current'; applyUpdate = null; asked = false; reloading = false;
  reload = () => location.reload();
  setReloader(() => location.reload());
}
