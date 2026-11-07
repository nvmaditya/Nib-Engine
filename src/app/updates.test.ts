// The update flow, with a fake `register` in place of vite-plugin-pwa's (src/app/pwa.ts passes the real one, which
// only exists in a build). The messages are on the real message list (sonner's Toaster), as the app shows them.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { Toaster, toast as sonner } from 'sonner';
import { afterEach, beforeEach, expect, test, vi, type Mock } from 'vitest';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { closeImport, openImport } from '@/features/doc/actions';
import { ImportDialog } from '@/features/import/ImportDialog';
import { installFocusMemory } from '@/lib/focus';
import { NewerDocumentError, putDoc } from '@/store/documents';
import { SAVE_FAILED, SAVE_NEWER, closeDocument, flushSave, openDocument, update, useEditor } from '@/store/editor';
import { rec } from '@/test/docs';
import { MEMORY_ID } from './route';
import { CHECK_EVERY, GIVE_BACK_AFTER, NEW_VERSION, OFFLINE_READY, RELOAD_FALLBACK, resetUpdatesForTests, startUpdates, updateState } from './updates';

vi.mock('@/store/documents', async orig => ({ ...(await orig<typeof import('@/store/documents')>()), putDoc: vi.fn(async () => 1) }));

let opts: RegisterSWOptions, applyUpdate: Mock<(reloadPage?: boolean) => Promise<void>>, reload: Mock<() => void>;
let shown: DocumentVisibilityState = 'visible';
let sw: EventTarget; // navigator.serviceWorker, which jsdom has none of

const tick = (ms = 50) => act(() => { vi.advanceTimersByTime(ms); });
/** Let `ms` go by a frame at a time, with React drawing between frames as a browser does (sonner's exits run in effects). */
const frames = (ms: number) => { for (let t = 0; t < ms; t += 16) tick(Math.min(16, ms - t)); };
const settle = (ms = 50) => act(() => vi.advanceTimersByTimeAsync(ms)); // timers, and the promises they start
/** The message showing `msg` (not one on its way out). */
const message = (msg: string): HTMLElement | null => {
  const el = screen.queryByText(msg)?.closest<HTMLElement>('[data-sonner-toast]') ?? null;
  return el && el.getAttribute('data-removed') !== 'true' ? el : null;
};
const reloadIn = (msg: string) => within(message(msg)!).getByRole('button', { name: 'Reload' });
/** Press a message's button, as a click does in Chromium: it takes the focus, then is clicked. */
const press = (b: HTMLElement) => act(() => { b.focus(); fireEvent.click(b); });

beforeEach(async () => {
  await flushSave();
  vi.useFakeTimers();
  vi.mocked(putDoc).mockReset().mockResolvedValue(1);
  shown = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => shown });
  sw = new EventTarget();
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw });
  resetUpdatesForTests(); applyUpdate = vi.fn(async () => {}); reload = vi.fn();
  startUpdates(o => { opts = o; return applyUpdate; }, { reload });
  render(createElement(Toaster, { expand: true, visibleToasts: 3 }));
});
afterEach(async () => {
  act(() => closeImport());
  await closeDocument();
  if (useEditor.getState().docId === MEMORY_ID) useEditor.setState({ docId: null }); // (never closed: nothing would keep it)
  resetUpdatesForTests(); // (first: its timers go with it, so none says anything into the next test)
  act(() => { for (const t of sonner.getToasts()) sonner.dismiss(t.id); vi.runOnlyPendingTimers(); });
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

test('a new version waiting says so with Reload, and stays up', () => {
  expect(updateState()).toBe('current');
  act(() => opts.onNeedRefresh!()); tick();
  expect(updateState()).toBe('waiting');
  expect(message(NEW_VERSION)).not.toBeNull();
  tick(60_000);
  expect(reloadIn(NEW_VERSION)).toBeInTheDocument();
});

test('Reload writes the last change first, then reloads only this tab', async () => {
  openDocument(rec('A', 'x'));
  update(s => { s.doc.boxes[0].text = 'xy'; }); // a change waiting for a pause in typing
  act(() => opts.onNeedRefresh!()); tick();
  press(reloadIn(NEW_VERSION));
  await settle(0);
  expect(putDoc).toHaveBeenCalledTimes(1);
  expect(vi.mocked(putDoc).mock.calls[0][0].doc.boxes[0].text).toBe('xy');
  expect(applyUpdate).toHaveBeenCalledTimes(1);
  expect(vi.mocked(putDoc).mock.invocationCallOrder[0]).toBeLessThan(applyUpdate.mock.invocationCallOrder[0]); // written first
  expect(reload).not.toHaveBeenCalled(); // not until the new version is in charge
  act(() => opts.onNeedReload!()); await settle(0); // (it writes once more first)
  expect(reload).toHaveBeenCalledTimes(1);
  await settle(RELOAD_FALLBACK * 2);
  expect(reload).toHaveBeenCalledTimes(1); // once
});

test('a new version taking over from another tab never reloads this one', async () => {
  act(() => opts.onNeedRefresh!()); tick();
  act(() => opts.onNeedReload!()); // another tab pressed Reload
  await settle(RELOAD_FALLBACK * 2);
  expect(reload).not.toHaveBeenCalled();
  expect(applyUpdate).not.toHaveBeenCalled();
  expect(updateState()).toBe('active');
  expect(message(NEW_VERSION)).not.toBeNull();
});

test('Reload once the new version is in charge just reloads', async () => {
  act(() => opts.onNeedRefresh!()); tick();
  act(() => opts.onNeedReload!());
  press(reloadIn(NEW_VERSION));
  await settle(0);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(applyUpdate).not.toHaveBeenCalled();
});

test('if the new version never takes over, Reload reloads anyway after 3 s', async () => {
  act(() => opts.onNeedRefresh!()); tick();
  press(reloadIn(NEW_VERSION));
  await settle(0);
  expect(applyUpdate).toHaveBeenCalledTimes(1);
  await settle(RELOAD_FALLBACK - 100);
  expect(reload).not.toHaveBeenCalled();
  await settle(200);
  expect(reload).toHaveBeenCalledTimes(1);
  act(() => opts.onNeedReload!()); await settle(0); // late
  expect(reload).toHaveBeenCalledTimes(1);
});

test('the first install says Nib works offline now', () => {
  act(() => opts.onOfflineReady!()); tick();
  expect(message(OFFLINE_READY)).not.toBeNull();
});

test('the message stays up when a document opens or closes', async () => {
  act(() => opts.onNeedRefresh!()); tick();
  openDocument(rec('A', 'a')); tick(500);
  expect(message(NEW_VERSION)).not.toBeNull();
  await act(() => closeDocument()); tick(500);
  expect(message(NEW_VERSION)).not.toBeNull();
});

test('a document a newer Nib saved offers Reload, which goes to the new version', async () => {
  vi.mocked(putDoc).mockRejectedValue(new NewerDocumentError());
  openDocument(rec('A', 'a'));
  update(s => { s.doc.boxes[0].text = 'b'; });
  await act(() => flushSave()); tick();
  expect(reloadIn(SAVE_NEWER)).toBeInTheDocument();
  act(() => opts.onNeedRefresh!()); tick(); // (a plain reload would load the old version again, from its cache)
  press(reloadIn(SAVE_NEWER));
  await settle(0);
  expect(applyUpdate).toHaveBeenCalledTimes(1);
  expect(reload).not.toHaveBeenCalled();
  act(() => opts.onNeedReload!()); await settle(0); // (it writes once more first)
  expect(reload).toHaveBeenCalledTimes(1);
});

test('checks for a new version every hour while shown', () => {
  const swUpdate = vi.fn(async () => {});
  act(() => opts.onRegisteredSW!('sw.js', { update: swUpdate } as unknown as ServiceWorkerRegistration));
  tick(CHECK_EVERY - 1000);
  expect(swUpdate).not.toHaveBeenCalled();
  tick(1000);
  expect(swUpdate).toHaveBeenCalledTimes(1);

  shown = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
  tick(CHECK_EVERY + 60_000);
  expect(swUpdate).toHaveBeenCalledTimes(1); // not while hidden

  shown = 'visible'; document.dispatchEvent(new Event('visibilitychange')); // shown again, over an hour on
  expect(swUpdate).toHaveBeenCalledTimes(2);
  shown = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
  shown = 'visible'; document.dispatchEvent(new Event('visibilitychange')); // shown again a moment later
  expect(swUpdate).toHaveBeenCalledTimes(2);
});

/** The Import dialog, open while the store says so, as Home and a document show it. */
function Import() {
  const open = useEditor(s => s.importOpen);
  return createElement(ImportDialog, { open, file: null, target: 'new', onClose: closeImport });
}

test('Import puts the message away while it is open, and closing it brings the message back', () => {
  render(createElement(Import));
  act(() => opts.onNeedRefresh!()); frames(100);
  act(() => openImport()); frames(500); // (it puts away every message, so none covers Write it out on a phone)
  expect(screen.getByRole('dialog', { name: 'Import a document' })).toBeInTheDocument();
  expect(message(NEW_VERSION)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); frames(500);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(reloadIn(NEW_VERSION)).toBeInTheDocument();
});

test('a new version message swiped away stays away when Import opens and closes', () => {
  render(createElement(Import));
  act(() => opts.onNeedRefresh!()); frames(100);
  act(() => { for (const t of sonner.getToasts()) sonner.dismiss(t.id); }); frames(500); // taken down with no dialog open
  expect(message(NEW_VERSION)).toBeNull();
  act(() => openImport()); frames(500);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); frames(500);
  expect(message(NEW_VERSION)).toBeNull();
});

test('Reload with a change that can’t be written keeps the page, says so, and leaves the message up', async () => {
  vi.mocked(putDoc).mockRejectedValue(new Error('disk full'));
  openDocument(rec('A', 'x'));
  update(s => { s.doc.boxes[0].text = 'xy'; }); // a change waiting for a pause in typing
  act(() => opts.onNeedRefresh!()); frames(100);
  press(reloadIn(NEW_VERSION));
  await settle(0); frames(500);
  expect(putDoc).toHaveBeenCalled();
  expect(applyUpdate).not.toHaveBeenCalled();
  expect(message(SAVE_FAILED)).not.toBeNull();
  expect(message(NEW_VERSION)).not.toBeNull(); // so it can be tried again
  await settle(RELOAD_FALLBACK * 2);
  expect(reload).not.toHaveBeenCalled();

  frames(6000); // “Nib couldn’t save…” has gone by itself; nothing is waiting, but the change still isn’t written
  expect(message(SAVE_FAILED)).toBeNull();
  vi.mocked(putDoc).mockClear();
  press(reloadIn(NEW_VERSION));
  await settle(0); frames(500);
  expect(putDoc).toHaveBeenCalled(); // tried again
  expect(message(SAVE_FAILED)).not.toBeNull(); // and said again
  expect(applyUpdate).not.toHaveBeenCalled();

  vi.mocked(putDoc).mockReset().mockResolvedValue(2); // now it can be written
  press(reloadIn(NEW_VERSION));
  await settle(0);
  expect(putDoc).toHaveBeenCalledTimes(1);
  expect(vi.mocked(putDoc).mock.calls[0][0].doc.boxes[0].text).toBe('xy');
  expect(applyUpdate).toHaveBeenCalledTimes(1);
  act(() => opts.onNeedReload!()); await settle(0); // (it writes once more first)
  expect(reload).toHaveBeenCalledTimes(1);
});

test('with nothing kept on this device (no storage), a new version isn’t offered', async () => {
  openDocument({ ...rec('Mem', 'a'), id: MEMORY_ID });
  act(() => opts.onNeedRefresh!()); frames(100);
  expect(message(NEW_VERSION)).toBeNull();
  act(() => opts.onNeedReload!()); frames(100); // another tab took the new version
  await settle(RELOAD_FALLBACK * 2);
  expect(message(NEW_VERSION)).toBeNull();
  expect(reload).not.toHaveBeenCalled();
});

test('a new version offered before Nib finds it has no storage is taken down', () => {
  act(() => opts.onNeedRefresh!()); frames(100);
  expect(message(NEW_VERSION)).not.toBeNull();
  act(() => openDocument({ ...rec('Mem', 'a'), id: MEMORY_ID })); frames(500); // (App's boot, with storage blocked)
  expect(message(NEW_VERSION)).toBeNull();
});

test('an edit made while Reload waits for the new version is written before the page reloads', async () => {
  openDocument(rec('A', 'x'));
  act(() => opts.onNeedRefresh!()); frames(100);
  press(reloadIn(NEW_VERSION)); await settle(0);
  expect(applyUpdate).toHaveBeenCalledTimes(1);
  const field = document.createElement('textarea'); document.body.append(field); field.focus(); // the focus is back where it was
  let focusAtReload: Element | null = null;
  reload.mockImplementation(() => { focusAtReload = document.activeElement; });
  update(s => { s.doc.boxes[0].text = 'x, typed during the wait'; });
  await settle(100); // (before the pause in typing is over)
  vi.mocked(putDoc).mockClear();
  act(() => opts.onNeedReload!()); await settle(0);
  expect(reload).not.toHaveBeenCalled(); // not in the middle of typing: once it pauses
  await settle(400);
  expect(putDoc).toHaveBeenCalledTimes(1);
  expect(vi.mocked(putDoc).mock.calls[0][0].doc.boxes[0].text).toBe('x, typed during the wait');
  expect(reload).toHaveBeenCalledTimes(1);
  expect(vi.mocked(putDoc).mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]);
  expect(focusAtReload).toBe(document.body); // nothing more is typed into the page on its way out
  expect(document.body).toHaveAttribute('inert');
  field.remove();
});

test('…and so is one made before the 3 s are up, when the new version never takes over', async () => {
  openDocument(rec('A', 'x'));
  act(() => opts.onNeedRefresh!()); frames(100);
  press(reloadIn(NEW_VERSION)); await settle(0);
  await settle(RELOAD_FALLBACK - 200);
  update(s => { s.doc.boxes[0].text = 'x, typed late'; });
  vi.mocked(putDoc).mockClear();
  await settle(600); // the 3 s, then the pause in typing
  expect(putDoc).toHaveBeenCalledTimes(1);
  expect(vi.mocked(putDoc).mock.calls[0][0].doc.boxes[0].text).toBe('x, typed late');
  expect(reload).toHaveBeenCalledTimes(1);
});

test('a failing save already on its way when Reload is pressed keeps the page, and says so', async () => {
  vi.mocked(putDoc).mockImplementation(() => new Promise((_, no) => { setTimeout(() => no(new Error('disk full')), 1000); }));
  openDocument(rec('A', 'x'));
  update(s => { s.doc.boxes[0].text = 'xy'; });
  act(() => opts.onNeedRefresh!()); frames(100);
  await settle(400); // the pause in typing is over: the save has started, and its write takes a while
  expect(putDoc).toHaveBeenCalledTimes(1);
  press(reloadIn(NEW_VERSION));
  await settle(6000); frames(500);
  expect(applyUpdate).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
  expect(message(SAVE_FAILED)).not.toBeNull();
  expect(message(NEW_VERSION)).not.toBeNull();
});

test('a change that can’t be written when the new version takes over keeps the page, and Reload tries again', async () => {
  openDocument(rec('A', 'x'));
  act(() => opts.onNeedRefresh!()); frames(100);
  press(reloadIn(NEW_VERSION)); await settle(0);
  expect(applyUpdate).toHaveBeenCalledTimes(1);
  update(s => { s.doc.boxes[0].text = 'x and more'; });
  vi.mocked(putDoc).mockRejectedValue(new Error('disk full'));
  act(() => opts.onNeedReload!()); await settle(1000); frames(500);
  expect(reload).not.toHaveBeenCalled();
  expect(message(SAVE_FAILED)).not.toBeNull();
  expect(message(NEW_VERSION)).not.toBeNull();
  await settle(RELOAD_FALLBACK * 2);
  expect(reload).not.toHaveBeenCalled();

  vi.mocked(putDoc).mockReset().mockResolvedValue(3);
  press(reloadIn(NEW_VERSION)); await settle(0);
  expect(vi.mocked(putDoc).mock.calls[0][0].doc.boxes[0].text).toBe('x and more');
  expect(reload).toHaveBeenCalledTimes(1);
  expect(applyUpdate).toHaveBeenCalledTimes(1); // (the new version is in charge already)
});

test('a tab that had no service worker when it opened reloads as soon as the new version takes over', async () => {
  // vite-plugin-pwa calls onNeedReload only in a tab a service worker controlled when it registered (not on a
  // first visit, nor after a hard reload); the page's own controllerchange is heard in every tab.
  act(() => opts.onNeedRefresh!()); frames(100);
  press(reloadIn(NEW_VERSION)); await settle(0);
  expect(reload).not.toHaveBeenCalled();
  act(() => { sw.dispatchEvent(new Event('controllerchange')); }); await settle(0);
  expect(reload).toHaveBeenCalledTimes(1);
  act(() => opts.onNeedReload!()); await settle(RELOAD_FALLBACK * 2);
  expect(reload).toHaveBeenCalledTimes(1); // once
});

test('a new version taking over without Reload pressed here changes nothing but the message', async () => {
  act(() => { sw.dispatchEvent(new Event('controllerchange')); }); // the first install taking charge
  expect(updateState()).toBe('current');
  act(() => opts.onNeedRefresh!()); frames(100);
  act(() => { sw.dispatchEvent(new Event('controllerchange')); }); // another tab pressed Reload
  await settle(RELOAD_FALLBACK * 2);
  expect(reload).not.toHaveBeenCalled();
  expect(updateState()).toBe('active');
  expect(message(NEW_VERSION)).not.toBeNull();
  press(reloadIn(NEW_VERSION)); await settle(0);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(applyUpdate).not.toHaveBeenCalled();
});

test('once the page is on its way out, nothing takes the focus back into it', async () => {
  const off = installFocusMemory();
  const field = document.createElement('textarea'); document.body.append(field); field.focus();
  act(() => opts.onNeedRefresh!()); frames(100);
  press(reloadIn(NEW_VERSION)); // (a message's action gives the focus back after a timer)
  await act(async () => {}); // promises only: the new version takes over before that timer
  expect(applyUpdate).toHaveBeenCalledTimes(1);
  act(() => { sw.dispatchEvent(new Event('controllerchange')); });
  await act(async () => {});
  expect(reload).toHaveBeenCalledTimes(1);
  await settle(100);
  // Nothing can be typed into a page whose new copy is loading: the focus is nowhere, or inside what is inert, which
  // a browser never lets take the focus or input (jsdom has no inert, so the focus may sit there).
  expect(document.body).toHaveAttribute('inert');
  const at = document.activeElement;
  expect(at === document.body || !!at?.closest('[inert]')).toBe(true);
  off(); field.remove();
});

test('a reload stopped on its way (the browser’s Stop) gives the page back, with the new version offered again', async () => {
  const off = installFocusMemory();
  const field = document.createElement('textarea'); document.body.append(field); field.focus();
  act(() => opts.onNeedRefresh!()); frames(100);
  press(reloadIn(NEW_VERSION)); await settle(0);
  act(() => { sw.dispatchEvent(new Event('controllerchange')); }); await settle(0);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(document.body).toHaveAttribute('inert');
  await settle(GIVE_BACK_AFTER - 500);
  expect(document.body).toHaveAttribute('inert'); // the new page may just be slow
  await settle(600); frames(300); // still here: the reload was stopped
  expect(document.body).not.toHaveAttribute('inert');
  expect(field).toHaveFocus();
  expect(reloadIn(NEW_VERSION)).toBeInTheDocument();
  press(reloadIn(NEW_VERSION)); await settle(0);
  expect(reload).toHaveBeenCalledTimes(2); // (the new version is in charge: it just reloads)
  off(); field.remove();
});
