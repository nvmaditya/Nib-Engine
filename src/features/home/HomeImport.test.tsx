// Import from Home: a file dropped anywhere, or chosen with the hero, opens the Import dialog; the document is
// made only on Write it out.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { closeImport } from '@/features/doc/actions';
import { createDoc } from '@/store/documents';
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
  duplicateDoc: vi.fn(), deleteDoc: vi.fn(), putDoc: vi.fn(), renameDoc: vi.fn(),
  onDocsChanged: vi.fn(() => () => {}),
  MissingDocumentError: class MissingDocumentError extends Error {},
  getPref: vi.fn(async () => undefined), setPref: vi.fn(async () => {}),
}));
vi.mock('@/engine/importers.js', async orig => ({ ...(await orig<typeof import('@/engine/importers.js')>()), readDocument: vi.fn(async () => ({ parts: ['# Essay\nHello'], pages: 0, words: 2, name: 'Essay' })) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn(), getToasts: vi.fn(() => []) }), Toaster: () => null }));

fontsLoad();
const files = (f: File) => ({ dataTransfer: { files: [f], types: ['Files'] } });
beforeEach(() => { mem.docs = [{ id: 'a1', title: 'A', createdAt: 1, updatedAt: 1, settings: {}, doc: { pageCount: 1, boxes: [], fileName: '' } }]; location.hash = '#/'; vi.mocked(createDoc).mockClear(); });
afterEach(() => { closeImport(); vi.restoreAllMocks(); });

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
