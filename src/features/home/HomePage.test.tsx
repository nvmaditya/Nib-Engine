import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster, toast as sonner } from 'sonner';
import { NewerDocumentError, deleteDoc, duplicateDoc, listDocs, onDocsChanged, renameDoc } from '@/store/documents';
import { cleanSettings } from '@/engine/doc.js';
import { HomePage } from './HomePage';
import { forgetThumb, thumbFor } from './thumbs';

vi.mock('./thumbs', async orig => ({
  ...(await orig<typeof import('./thumbs')>()),
  thumbFor: vi.fn(async () => ({ url: 'data:image/jpeg;base64,AAAA', pages: 2 })),
  peekThumb: vi.fn(() => null),
  forgetThumb: vi.fn(async () => {}),
}));

const mem = vi.hoisted(() => ({ docs: [] as any[] }));
vi.mock('@/store/documents', () => ({
  NewerDocumentError: class NewerDocumentError extends Error {},
  listDocs: vi.fn(async () => [...mem.docs]),
  getDoc: vi.fn(async (id: string) => mem.docs.find(d => d.id === id)),
  createDoc: vi.fn(async (init: any = {}) => { const r = { id: 'new1', title: init.title ?? 'Untitled', createdAt: 1, updatedAt: 1, settings: {}, doc: { pageCount: 1, boxes: [], fileName: '' } }; mem.docs.unshift(r); return r; }),
  duplicateDoc: vi.fn(),
  deleteDoc: vi.fn(async (id: string) => { mem.docs = mem.docs.filter(d => d.id !== id); }),
  putDoc: vi.fn(async (r: any) => { mem.docs = mem.docs.map(d => (d.id === r.id ? r : d)); }),
  renameDoc: vi.fn(async (id: string, title: string) => { mem.docs = mem.docs.map(d => (d.id === id ? { ...d, title } : d)); }),
  onDocsChanged: vi.fn(() => () => {}),
  MissingDocumentError: class MissingDocumentError extends Error {},
  getPref: vi.fn(async () => undefined),
  setPref: vi.fn(async () => {}),
}));

const NOW = new Date(2026, 10, 6, 12).getTime();
const mk = (id: string, title: string, updatedAt = NOW) => ({ id, title, createdAt: 1, updatedAt, settings: { ...cleanSettings(null, false), ...(id === 'b2' ? { font: 'zeyada' } : {}) }, doc: { pageCount: 2, boxes: [], fileName: '' } });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); mem.docs = [mk('a1', 'A'), mk('b2', 'B', new Date(2026, 10, 3).getTime())]; location.hash = '#/'; });

test('lists recent documents and opens one', async () => {
  render(<HomePage />);
  expect(await screen.findByText('B')).toBeInTheDocument();
  expect(screen.getByText('2 pages · Exam answer · Edited today')).toBeInTheDocument();
  expect(screen.getByText('2 pages · Edited 3 November 2026')).toBeInTheDocument();
  await userEvent.click(screen.getByText('A'));
  expect(location.hash).toBe('#/d/a1/write');
});

test('delete asks first', async () => {
  render(<HomePage />);
  await screen.findByText('A');
  await userEvent.click(screen.getByRole('button', { name: 'More for A' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  const dlg = await screen.findByRole('alertdialog');
  expect(within(dlg).getByText('Delete “A”? This can’t be undone.')).toBeInTheDocument();
  await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('A')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'More for A' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(screen.queryByText('A')).not.toBeInTheDocument());
});

afterEach(() => { vi.useRealTimers(); });

test('each document shows its first page, how many pages it has, its look and when it was edited', async () => {
  render(<HomePage />); expect(await screen.findByText('2 pages · Exam answer · Edited today')).toBeInTheDocument();
  expect(screen.getByText('A').closest('li')!.querySelector('img')).toHaveAttribute('src', 'data:image/jpeg;base64,AAAA');
  expect(thumbFor).toHaveBeenCalledWith('doc:a1', expect.objectContaining({ font: 'labelle' }), expect.objectContaining({ boxes: [] }), 156, expect.anything());
});
test('the page count is the laid-out one, not the stored minimum', async () => {
  mem.docs = [{ ...mk('a1', 'A'), doc: { pageCount: 1, boxes: [], fileName: '' } }];
  vi.mocked(thumbFor).mockResolvedValue({ url: 'data:image/jpeg;base64,AAAA', pages: 5 });
  render(<HomePage />); expect(await screen.findByText('5 pages · Exam answer · Edited today')).toBeInTheDocument();
});
test('until page 1 is drawn, the line leaves the page count out', async () => {
  vi.mocked(thumbFor).mockReturnValue(new Promise(() => {}));
  render(<HomePage />); expect(await screen.findAllByText('Exam answer · Edited today')).toHaveLength(1);
});
test('Delete forgets the thumbnail', async () => {
  render(<HomePage />); await userEvent.click(await screen.findByRole('button', { name: 'More for A' })); await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' })); await waitFor(() => expect(forgetThumb).toHaveBeenCalledWith('doc:a1'));
});

test('leaving a document shows its latest title', async () => {
  const { openDocument, renameDocument } = await import('@/store/editor');
  openDocument(mem.docs[0]);
  renameDocument('Renamed');
  render(<HomePage />);
  expect(await screen.findByText('Renamed')).toBeInTheDocument();
});

test('when the documents can’t be read, Home says so instead of “No documents yet.”', async () => {
  vi.mocked(listDocs).mockRejectedValueOnce(new Error('storage gone'));
  render(<HomePage />);
  expect(await screen.findByText('Nib can’t read your documents on this device right now.')).toBeInTheDocument();
  expect(screen.queryByText('No documents yet.')).toBeNull();
});

test('a rename of a document a newer version of Nib saved says to reload', async () => {
  const user = userEvent.setup();
  render(<><HomePage /><Toaster /></>);
  vi.mocked(renameDoc).mockRejectedValueOnce(new NewerDocumentError());
  await user.click(await screen.findByRole('button', { name: 'More for A' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  const dlg = await screen.findByRole('dialog', { name: 'Rename document' });
  await user.click(within(dlg).getByRole('button', { name: 'Rename' }));
  expect(await screen.findByText('This document was saved by a newer version of Nib. Reload the page to keep editing.')).toBeInTheDocument();
});

test('a rename, duplicate or delete that fails says so and closes its dialog', async () => {
  const user = userEvent.setup();
  render(<><HomePage /><Toaster /></>);
  const failed = 'That didn’t work. Try again.';
  const menu = async (item: string) => {
    await user.click(await screen.findByRole('button', { name: 'More for A' }));
    await user.click(await screen.findByRole('menuitem', { name: item }));
  };

  vi.mocked(renameDoc).mockRejectedValueOnce(new Error('no'));
  await menu('Rename');
  const dlg = await screen.findByRole('dialog', { name: 'Rename document' });
  await user.clear(within(dlg).getByRole('textbox', { name: 'Document name' }));
  await user.type(within(dlg).getByRole('textbox', { name: 'Document name' }), 'Essay');
  await user.click(within(dlg).getByRole('button', { name: 'Rename' }));
  expect(await screen.findByText(failed)).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByText('A')).toBeInTheDocument();
  act(() => { sonner.dismiss(); });
  await waitFor(() => expect(screen.queryByText(failed)).toBeNull());

  vi.mocked(duplicateDoc).mockRejectedValueOnce(new Error('no'));
  await menu('Duplicate');
  expect(await screen.findByText(failed)).toBeInTheDocument();
  act(() => { sonner.dismiss(); });
  await waitFor(() => expect(screen.queryByText(failed)).toBeNull());

  vi.mocked(deleteDoc).mockRejectedValueOnce(new Error('no'));
  await menu('Delete');
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
  expect(await screen.findByText(failed)).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(screen.getByText('A')).toBeInTheDocument();
  act(() => { sonner.dismiss(); });
});

const wait = (ms: number) => act(() => new Promise<void>(r => { setTimeout(r, ms); }));
test('while someone types in another tab, Home reads the list again at most once a second, and not while it is hidden', async () => {
  render(<HomePage />);
  await screen.findByText('A');
  const heard = vi.mocked(onDocsChanged).mock.calls.at(-1)![0];
  await wait(50);
  vi.mocked(listDocs).mockClear();

  for (let rev = 2; rev < 12; rev++) act(() => heard({ type: 'saved', id: 'a1', rev })); // ten saves, close together
  await waitFor(() => expect(listDocs).toHaveBeenCalledTimes(1)); // the first at once
  await wait(300);
  expect(listDocs).toHaveBeenCalledTimes(1); // the rest wait for the second to be up
  await waitFor(() => expect(listDocs).toHaveBeenCalledTimes(2), { timeout: 2000 }); // then one read for all of them
  await wait(1100);
  expect(listDocs).toHaveBeenCalledTimes(2);

  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  try {
    act(() => heard({ type: 'added', id: 'c3' }));
    await wait(1100);
    expect(listDocs).toHaveBeenCalledTimes(2); // hidden: nothing is read
  } finally { delete (document as { visibilityState?: string }).visibilityState; }
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  await waitFor(() => expect(listDocs).toHaveBeenCalledTimes(3)); // shown again: what it missed, at once
});
