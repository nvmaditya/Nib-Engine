import { beforeEach, expect, test, vi } from 'vitest';
import { getDb } from '@/store/db';
import { setPref } from '@/store/documents';
import { openDocument } from '@/store/editor';
import { box, docOf, get, open, rec } from '@/test/docs';
import { DEFAULT_PREFS, IDLE_RUN, loadExportPrefs, setChoose, setExportPrefs, togglePage, useExportPick, useExportPrefs, useExportRun } from './state';

vi.mock('@/store/documents', async importOriginal => {
  const actual = await importOriginal<typeof import('@/store/documents')>();
  return { ...actual, setPref: vi.fn(actual.setPref) };
});

beforeEach(async () => {
  await (await getDb()).clear('prefs');
  useExportPrefs.setState(DEFAULT_PREFS);
  useExportPick.setState({ choose: false, out: [] });
  useExportRun.setState(IDLE_RUN);
  vi.mocked(setPref).mockClear();
});

test('a new device downloads a PDF, with several images in one ZIP, at Standard quality', () => expect(useExportPrefs.getState()).toMatchObject(DEFAULT_PREFS));
test('format, ZIP and quality are remembered on the device', async () => {
  setExportPrefs({ format: 'jpg', quality: 'print' }); await vi.waitFor(() => expect(setPref).toHaveBeenCalled());
  vi.resetModules(); const st = await import('@/features/export/state'); await st.loadExportPrefs();
  expect(st.useExportPrefs.getState()).toMatchObject({ format: 'jpg', zip: true, quality: 'print' });
});
test('stored values of the wrong shape are ignored', async () => { await setPref('export', { format: 'gif', zip: 'yes', quality: 'print' }); await loadExportPrefs(); expect(useExportPrefs.getState()).toMatchObject({ format: 'pdf', zip: true, quality: 'print' }); });
test('a choice made before the stored ones arrive wins', async () => { await setPref('export', { format: 'png' }); const p = loadExportPrefs(); setExportPrefs({ format: 'jpg' }); await p; expect(useExportPrefs.getState().format).toBe('jpg'); });
test('choosing what is already chosen writes nothing', async () => {
  vi.mocked(setPref).mockClear();
  const before = useExportPrefs.getState();
  setExportPrefs({ format: before.format });
  await new Promise(r => setTimeout(r, 20)); // let the write, if there were one, happen
  expect(setPref).not.toHaveBeenCalled();
  expect(useExportPrefs.getState()).toBe(before);
});
test('a refused write keeps the choice for now', async () => { vi.mocked(setPref).mockRejectedValueOnce(new Error('quota')); setExportPrefs({ format: 'png' }); await vi.waitFor(() => expect(setPref).toHaveBeenCalled()); expect(useExportPrefs.getState().format).toBe('png'); });
test('a page left out and put back', () => { setChoose(true); togglePage(1); expect(useExportPick.getState()).toEqual({ choose: true, out: [1] }); togglePage(1); expect(useExportPick.getState().out).toEqual([]); });
test('the page choice starts again when another document opens', () => { openDocument(rec('A', docOf(box()))); setChoose(true); togglePage(0); openDocument(rec('B', docOf(box()))); expect(useExportPick.getState()).toEqual({ choose: false, out: [] }); });
test('none of this is in the document or its undo history', () => { open(docOf(box())); setExportPrefs({ format: 'png' }); setChoose(true); togglePage(0); expect(get().canUndo).toBe(false); });
test('the run starts idle', () => expect(useExportRun.getState()).toEqual({ kind: null, done: 0, total: 0 }));
