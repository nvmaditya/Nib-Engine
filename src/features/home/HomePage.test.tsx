import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
