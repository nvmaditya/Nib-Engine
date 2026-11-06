import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster, toast as sonner } from 'sonner';
import { deleteDoc, duplicateDoc, listDocs, putDoc } from '@/store/documents';
import { HomePage } from './HomePage';

const mem = vi.hoisted(() => ({ docs: [] as any[] }));
vi.mock('@/store/documents', () => ({
  listDocs: vi.fn(async () => [...mem.docs]),
  getDoc: vi.fn(async (id: string) => mem.docs.find(d => d.id === id)),
  createDoc: vi.fn(async (init: any = {}) => { const r = { id: 'new1', title: init.title ?? 'Untitled', createdAt: 1, updatedAt: 1, settings: {}, doc: { pageCount: 1, boxes: [], fileName: '' } }; mem.docs.unshift(r); return r; }),
  duplicateDoc: vi.fn(),
  deleteDoc: vi.fn(async (id: string) => { mem.docs = mem.docs.filter(d => d.id !== id); }),
  putDoc: vi.fn(async (r: any) => { mem.docs = mem.docs.map(d => (d.id === r.id ? r : d)); }),
}));

const NOW = new Date(2026, 10, 6, 12).getTime();
const mk = (id: string, title: string, updatedAt = NOW) => ({ id, title, createdAt: 1, updatedAt, settings: {}, doc: { pageCount: 2, boxes: [], fileName: '' } });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); mem.docs = [mk('a1', 'A'), mk('b2', 'B', new Date(2026, 10, 3).getTime())]; location.hash = '#/'; });

test('lists recent documents and opens one', async () => {
  render(<HomePage />);
  expect(await screen.findByText('B')).toBeInTheDocument();
  expect(screen.getAllByText('2 pages').length).toBe(2);
  expect(screen.getByText('Edited today')).toBeInTheDocument();
  expect(screen.getByText('Edited 3 November 2026')).toBeInTheDocument();
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

test('a rename, duplicate or delete that fails says so and closes its dialog', async () => {
  const user = userEvent.setup();
  render(<><HomePage /><Toaster /></>);
  const failed = 'That didn’t work. Try again.';
  const menu = async (item: string) => {
    await user.click(await screen.findByRole('button', { name: 'More for A' }));
    await user.click(await screen.findByRole('menuitem', { name: item }));
  };

  vi.mocked(putDoc).mockRejectedValueOnce(new Error('no'));
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
