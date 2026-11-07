// The update flow, with a fake `register` in place of vite-plugin-pwa's (src/app/pwa.ts passes the real one, which
// only exists in a build). The messages are on the real message list (sonner's Toaster), as the app shows them.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { Toaster, toast as sonner } from 'sonner';
import { afterEach, beforeEach, expect, test, vi, type Mock } from 'vitest';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { NewerDocumentError, putDoc } from '@/store/documents';
import { SAVE_NEWER, closeDocument, flushSave, openDocument, update } from '@/store/editor';
import { rec } from '@/test/docs';
import { CHECK_EVERY, NEW_VERSION, OFFLINE_READY, RELOAD_FALLBACK, resetUpdatesForTests, startUpdates, updateState } from './updates';

vi.mock('@/store/documents', async orig => ({ ...(await orig<typeof import('@/store/documents')>()), putDoc: vi.fn(async () => 1) }));

let opts: RegisterSWOptions, applyUpdate: Mock<(reloadPage?: boolean) => Promise<void>>, reload: Mock<() => void>;
let shown: DocumentVisibilityState = 'visible';

const tick = (ms = 50) => act(() => { vi.advanceTimersByTime(ms); });
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
  resetUpdatesForTests(); applyUpdate = vi.fn(async () => {}); reload = vi.fn();
  startUpdates(o => { opts = o; return applyUpdate; }, { reload });
  render(createElement(Toaster, { expand: true, visibleToasts: 3 }));
});
afterEach(async () => {
  await closeDocument();
  act(() => { for (const t of sonner.getToasts()) sonner.dismiss(t.id); vi.runOnlyPendingTimers(); });
  resetUpdatesForTests();
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'visibilityState');
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
  act(() => opts.onNeedReload!());
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
  act(() => opts.onNeedReload!()); // late
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
  act(() => opts.onNeedReload!());
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
