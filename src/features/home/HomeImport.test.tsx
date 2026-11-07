// Import from Home: a file dropped anywhere, or chosen with the hero, opens the Import dialog; the document is
// made only on Write it out. Then Home around it: its layout, its headings, and the focus after Rename and Delete.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { closeImport } from '@/features/doc/actions';
import { createDoc } from '@/store/documents';
import { useEditor } from '@/store/editor';
import { fontsLoad } from '@/test/docs';
import { HomePage } from './HomePage';

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
  duplicateDoc: vi.fn(), putDoc: vi.fn(),
  deleteDoc: vi.fn(async (id: string) => { mem.docs = mem.docs.filter(d => d.id !== id); }),
  renameDoc: vi.fn(async (id: string, title: string) => { mem.docs = mem.docs.map(d => (d.id === id ? { ...d, title } : d)); }),
  onDocsChanged: vi.fn(() => () => {}),
  MissingDocumentError: class MissingDocumentError extends Error {},
  getPref: vi.fn(async () => undefined), setPref: vi.fn(async () => {}),
}));
vi.mock('@/engine/importers.js', async orig => ({ ...(await orig<typeof import('@/engine/importers.js')>()), readDocument: vi.fn(async () => ({ parts: ['# Essay\nHello'], pages: 0, words: 2, name: 'Essay' })) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn(), getToasts: vi.fn(() => []) }), Toaster: () => null }));

fontsLoad();
const files = (f: File) => ({ dataTransfer: { files: [f], types: ['Files'] } });
beforeEach(() => { mem.docs = [{ id: 'a1', title: 'A', createdAt: 1, updatedAt: 1, settings: {}, doc: { pageCount: 1, boxes: [], fileName: '' } }]; location.hash = '#/'; vi.mocked(createDoc).mockClear(); });
afterEach(() => { cleanup(); closeImport(); vi.restoreAllMocks(); }); // (unmounted first: closing Import under it is an update outside act)

test('a file dropped anywhere on Home opens Import with it, and nothing is made until Write it out', async () => {
  render(<HomePage />); await screen.findByText('A'); act(() => { fireEvent.drop(window, files(new File(['x'], 'Essay.txt'))); });
  expect(await screen.findByRole('dialog', { name: 'Import a document' })).toBeInTheDocument(); expect(createDoc).not.toHaveBeenCalled();
  await userEvent.click(await screen.findByRole('button', { name: 'Write it out' }));
  await waitFor(() => expect(createDoc).toHaveBeenCalledWith(expect.objectContaining({ title: 'Essay' }))); expect(location.hash).toBe('#/d/new1/write');
});
test('Cancel leaves Home as it was', async () => {
  render(<HomePage />); await screen.findByText('A'); act(() => { fireEvent.drop(window, files(new File(['x'], 'Essay.txt'))); });
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' })); expect(createDoc).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).toBeNull(); expect(location.hash).toBe('#/');
});
test('the hero and Import a file open the file picker, then Import with the chosen file', async () => {
  let input: HTMLInputElement | undefined; vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) { input = this; });
  render(<HomePage />); await userEvent.click(await screen.findByRole('button', { name: /^Import a PDF/ }));
  Object.defineProperty(input!, 'files', { value: [new File(['x'], 'Essay.txt')] }); act(() => { input!.dispatchEvent(new Event('change')); });
  expect(await screen.findByText('Essay.txt: 2 words.')).toBeInTheDocument(); expect(createDoc).not.toHaveBeenCalled();
});
test('the picker offers the files the dialog reads', async () => {
  let input: HTMLInputElement | undefined; vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) { input = this; });
  render(<HomePage />); await userEvent.click(await screen.findByRole('button', { name: /^Import a PDF/ }));
  expect(input!.accept).toContain('.docx'); expect(input!.accept).toContain('.markdown');
});
test('while Import is open, a file dropped on it goes to Import', async () => {
  render(<HomePage />); await screen.findByText('A'); act(() => { fireEvent.drop(window, files(new File(['x'], 'One.txt'))); }); await screen.findByText('One.txt: 2 words.');
  fireEvent.drop(await screen.findByRole('dialog', { name: 'Import a document' }), files(new File(['y'], 'Two.txt')));
  expect(await screen.findByText('Two.txt: 2 words.')).toBeInTheDocument(); expect(screen.getAllByRole('dialog')).toHaveLength(1);
});
test('while Import is open, a file dragged over Home lights nothing up', async () => {
  render(<HomePage />); await screen.findByText('A'); act(() => { fireEvent.drop(window, files(new File(['x'], 'One.txt'))); }); await screen.findByRole('dialog');
  fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'] } }); expect(screen.queryByText('Drop to import this document')).toBeNull();
});
test('a file dropped on the open dialog’s backdrop does not replace the file being imported', async () => {
  render(<HomePage />); await screen.findByText('A'); act(() => { fireEvent.drop(window, files(new File(['x'], 'Essay.txt'))); });
  await screen.findByText('Essay.txt: 2 words.');
  const ev = new Event('drop', { cancelable: true }) as Event & { dataTransfer?: unknown };
  ev.dataTransfer = { files: [new File(['y'], 'Other.txt')], types: ['Files'] };
  act(() => { window.dispatchEvent(ev); });
  expect(ev.defaultPrevented).toBe(true); expect(screen.getByText('Essay.txt: 2 words.')).toBeInTheDocument(); expect(screen.queryByText(/Other\.txt/)).toBeNull();
});

/** The `⋯` menu of the document titled `title`, then its item `item`. */
async function menu(title: string, item: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: `More for ${title}` }));
  await userEvent.click(await screen.findByRole('menuitem', { name: item }));
}
test.each([['Rename', 'dialog'], ['Delete', 'alertdialog']] as const)('a file dropped while %s is open is left alone: no Import on top of it', async (item, role) => {
  render(<HomePage />); await screen.findByText('A'); await menu('A', item); await screen.findByRole(role);
  fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'] } }); expect(screen.queryByText('Drop to import this document')).toBeNull();
  const ev = new Event('drop', { cancelable: true }) as Event & { dataTransfer?: unknown };
  ev.dataTransfer = { files: [new File(['x'], 'Essay.txt')], types: ['Files'] };
  act(() => { window.dispatchEvent(ev); });
  expect(ev.defaultPrevented).toBe(true); // (and the browser doesn't open the file instead)
  expect(useEditor.getState().importOpen).toBe(false); expect(screen.getAllByRole(role)).toHaveLength(1);
});

test('Home is laid out as the plan has it: up to 1080 px wide, a tall hero with a 32 px icon (Design decision 7)', async () => {
  render(<HomePage />); await screen.findByText('A');
  const hero = screen.getByRole('button', { name: /^Import a PDF/ });
  expect(hero.parentElement).toHaveClass('mx-auto', 'max-w-[1080px]', 'flex-col', 'gap-8', 'px-4', 'py-6', 'wide:px-8', 'wide:py-10');
  expect(hero).toHaveClass('rounded-2xl', 'border-2', 'border-dashed', 'border-line-strong', 'bg-surface', 'py-12', 'wide:py-16');
  expect(hero.querySelector('svg')).toHaveClass('size-8', 'text-primary');
});
