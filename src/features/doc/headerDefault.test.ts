// The remembered default header: a header change in the open document is what new headers start from, in this tab at
// once and on the device about once a second; another tab's is taken in when this one is shown again or focused.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SAMPLE_HEAD } from '@/engine/config.js';
import { cleanSettings, sampleDoc } from '@/engine/doc.js';
import type { HeaderField } from '@/engine/types';
import { getPref, setPref } from '@/store/documents';
import { closeDocument, undo } from '@/store/editor';
import { box, docOf, fieldsOf, get, open } from '@/test/docs';
import { addBlock, deleteBlock, renameField, setField } from './actions';
import {
  HEADER_DEFAULT, cleanRemembered, defaultHeaderFields, flushHeaderDefault, installHeaderMemory, loadHeaderDefault, useHeaderDefault,
} from './headerDefault';
import { today } from './headerFields';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}), getPref: vi.fn(async () => undefined), setPref: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

const NOW = new Date(2026, 10, 7);
const hdr = (fields: HeaderField[] = fieldsOf({ name: '', class: '', date: 'x' })) =>
  box({ id: 'h', kind: 'header', name: 'Header', x: 446, y: 76, w: 320, fields, text: '' });
const labels = () => useHeaderDefault.getState().fields?.map(f => f.label) ?? null;
const theirs = (...l: string[]) => ({ fields: l.map(label => ({ label, value: '' })) });
/** The page hidden or shown again. */
const visibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  try { document.dispatchEvent(new Event('visibilitychange')); } finally { Reflect.deleteProperty(document, 'visibilityState'); }
};
/** Let a read of storage answer. */
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

let remove: () => void;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.mocked(setPref).mockClear();
  vi.mocked(getPref).mockReset().mockResolvedValue(undefined);
  useHeaderDefault.setState({ fields: null });
  remove = installHeaderMemory();
});
afterEach(async () => {
  remove();
  await flushHeaderDefault(); // a change a test left waiting is not written in the next one
  await closeDocument();
  vi.useRealTimers();
});

test('before anything is remembered, a new header is Name, Class and today’s Date', () => {
  expect(defaultHeaderFields(NOW)).toEqual([
    { id: 'f1', label: 'Name', value: '' }, { id: 'f2', label: 'Class', value: '' }, { id: 'f3', label: 'Date', value: '7 November 2026', today: true }]);
  open(docOf(box({ id: 'm', text: 'words' })));
  addBlock('header', 0);
  expect(get().doc.boxes[1].text).toBe(`Name:\nClass:\nDate: ${today()}`);
});

test('a change to the open document’s header is remembered at once and written once a second', () => {
  open(docOf(hdr()));
  setField('h', 'name', 'A'); setField('h', 'name', 'As'); renameField('h', 'class', 'Section');
  expect(labels()).toEqual(['Name', 'Section', 'Date']);
  expect(setPref).not.toHaveBeenCalled();
  vi.advanceTimersByTime(999);
  expect(setPref).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(setPref).toHaveBeenCalledTimes(1);
  expect(setPref).toHaveBeenCalledWith('header-default', {
    fields: [{ label: 'Name', value: 'As' }, { label: 'Section', value: '' }, { label: 'Date', value: 'x', today: true }] });
  expect(HEADER_DEFAULT).toBe('header-default');
  // Typing on: the next write is a second after the first change since, with the latest value.
  setField('h', 'name', 'Ash'); vi.advanceTimersByTime(500); setField('h', 'name', 'Asha');
  vi.advanceTimersByTime(499);
  expect(setPref).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  expect(setPref).toHaveBeenCalledTimes(2);
  expect(vi.mocked(setPref).mock.calls[1][1]).toMatchObject({ fields: [{ label: 'Name', value: 'Asha' }, {}, {}] });
  vi.advanceTimersByTime(5000);
  expect(setPref).toHaveBeenCalledTimes(2);
});

test('opening, closing or reading a document again is not a change', async () => {
  const teacher = [{ id: 't', label: 'Teacher', value: 'Mrs Rao' }];
  open(docOf(hdr(teacher)));
  open(docOf(hdr())); // another document (Home closes the open one first)
  open(docOf(hdr(teacher))); // read back from storage
  await closeDocument();
  open(docOf(box({ id: 'm', text: 'no header' })));
  expect(useHeaderDefault.getState().fields).toBeNull();
  vi.advanceTimersByTime(2000);
  expect(setPref).not.toHaveBeenCalled();
});

test('undoing a header change is a change too', () => {
  open(docOf(hdr()));
  renameField('h', 'class', 'Section');
  expect(labels()).toEqual(['Name', 'Section', 'Date']);
  undo();
  expect(labels()).toEqual(['Name', 'Class', 'Date']);
});

test('a document with no header changes nothing, and a header added to one is its header', () => {
  open(docOf(hdr(), box({ id: 'm', y: 178, text: 'words' })));
  deleteBlock('h');
  expect(useHeaderDefault.getState().fields).toBeNull();
  setField('m', 'name', 'x'); // not a header
  expect(useHeaderDefault.getState().fields).toBeNull();
  addBlock('header', 0);
  expect(labels()).toEqual(['Name', 'Class', 'Date']);
});

test('leaving the page writes a waiting change at once', () => {
  open(docOf(hdr()));
  renameField('h', 'class', 'Section');
  window.dispatchEvent(new Event('pagehide'));
  expect(setPref).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1000);
  expect(setPref).toHaveBeenCalledTimes(1); // nothing was left waiting
  renameField('h', 'class', 'Group');
  visibility('hidden');
  expect(setPref).toHaveBeenCalledTimes(2);
  expect(vi.mocked(setPref).mock.calls[1][1]).toMatchObject({ fields: [{}, { label: 'Group' }, {}] });
  window.dispatchEvent(new Event('pagehide')); // nothing waits: nothing is written
  expect(setPref).toHaveBeenCalledTimes(2);
});

test('a failed write is ignored, and this tab keeps its copy until it next reads the stored one', async () => {
  vi.mocked(setPref).mockRejectedValueOnce(new Error('quota'));
  open(docOf(hdr()));
  renameField('h', 'class', 'Section');
  await expect(flushHeaderDefault()).resolves.toBeUndefined();
  expect(labels()).toEqual(['Name', 'Section', 'Date']);
});

test('a stored default is read back cleaned, and anything unreadable is the built-in one', async () => {
  const read = async (v: unknown) => { vi.mocked(getPref).mockResolvedValueOnce(v); await loadHeaderDefault(); return useHeaderDefault.getState().fields; };
  expect(await read({ fields: [{ label: ' Section\n', value: 'B', today: 'no' }] })).toEqual([{ label: 'Section', value: 'B' }]);
  expect(getPref).toHaveBeenCalledWith('header-default');
  for (const v of [{ fields: [] }, 'junk', null]) {
    useHeaderDefault.setState({ fields: [{ label: 'Section', value: 'B' }] });
    expect(await read(v), JSON.stringify(v)).toBeNull();
  }
  for (const v of [undefined, { fields: 'x' }, { fields: [1, 'a', [{ label: 'x' }]] }, { label: 'Name' }]) expect(await read(v), JSON.stringify(v)).toBeNull();
  vi.mocked(getPref).mockRejectedValueOnce(new Error('blocked'));
  await expect(loadHeaderDefault()).resolves.toBeUndefined();
  expect(useHeaderDefault.getState().fields).toBeNull();
  expect(await read({ fields: [{ id: 'x', label: 'Due', value: '1 May', today: true }, ...Array.from({ length: 14 }, () => ({ label: 'F' }))] }))
    .toEqual([{ label: 'Due', value: '1 May', today: true }, ...Array.from({ length: 11 }, () => ({ label: 'F', value: '' }))]);
  vi.mocked(getPref).mockRejectedValueOnce(new Error('blocked')); // a read that fails says nothing of what is stored
  await loadHeaderDefault();
  expect(labels()).toEqual(['Due', ...Array.from({ length: 11 }, () => 'F')]);
  expect(cleanRemembered({ fields: [{ label: 'Name', value: 'Asha', id: 'f1' }] })).toEqual([{ label: 'Name', value: 'Asha' }]);
});

test('shown again or focused, it takes in what another tab remembered, unless a change of its own is waiting', async () => {
  vi.mocked(getPref).mockResolvedValue(theirs('Teacher'));
  window.dispatchEvent(new Event('focus'));
  await settle();
  expect(labels()).toEqual(['Teacher']);
  vi.mocked(getPref).mockResolvedValue(theirs('School'));
  visibility('visible');
  await settle();
  expect(labels()).toEqual(['School']);
  vi.mocked(getPref).mockResolvedValue(theirs('Roll no.'));
  window.dispatchEvent(new Event('pageshow')); // back from the back-forward cache
  await settle();
  expect(labels()).toEqual(['Roll no.']);

  open(docOf(hdr()));
  renameField('h', 'class', 'Section'); // waiting to be written
  vi.mocked(getPref).mockClear().mockResolvedValue(theirs('Teacher'));
  window.dispatchEvent(new Event('focus')); visibility('visible'); window.dispatchEvent(new Event('pageshow'));
  await settle();
  expect(getPref).not.toHaveBeenCalled();
  expect(labels()).toEqual(['Name', 'Section', 'Date']);

  vi.advanceTimersByTime(1000); // written: what storage holds is read again
  window.dispatchEvent(new Event('focus'));
  await settle();
  expect(labels()).toEqual(['Teacher']);

  // A change made while a read is on its way wins over what the read finds.
  let answer!: (v: unknown) => void;
  vi.mocked(getPref).mockReturnValueOnce(new Promise(r => { answer = r; }));
  window.dispatchEvent(new Event('focus'));
  renameField('h', 'class', 'Group');
  answer(theirs('School'));
  await settle();
  expect(labels()).toEqual(['Name', 'Group', 'Date']);
});

test('once removed, it neither remembers nor listens', async () => {
  remove();
  remove = () => {};
  open(docOf(hdr()));
  renameField('h', 'class', 'Section');
  vi.mocked(getPref).mockResolvedValue(theirs('Teacher'));
  window.dispatchEvent(new Event('focus'));
  await settle();
  expect([useHeaderDefault.getState().fields, vi.mocked(getPref).mock.calls.length]).toEqual([null, 0]);
});

test('the example document keeps its own fields', () => {
  useHeaderDefault.setState({ fields: [{ label: 'Teacher', value: 'Mrs Rao' }] });
  expect(sampleDoc(cleanSettings(null, false)).boxes[0].text).toBe(SAMPLE_HEAD);
});
