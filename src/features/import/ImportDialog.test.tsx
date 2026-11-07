// The Import dialog: a file read and shown as it will come across, its options, and writing it out (into the
// open document as one undo step, or from Home as a new document made only then). Full screen on phones.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/core';
import { toast as sonner } from 'sonner';
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { parseHash } from '@/app/route';
import { importError, readDocument } from '@/engine/importers.js';
import type { ReadResult } from '@/engine/types';
import { closeImport, openImport, setV } from '@/features/doc/actions';
import { today } from '@/features/doc/model';
import { BlockEditor } from '@/features/editor/BlockEditor';
import { offsetAt } from '@/features/editor/positions';
import { useUndoShortcuts } from '@/shell/useUndoShortcuts';
import { createDoc, listDocs } from '@/store/documents';
import { flushSave, openDocument, undo, useEditor } from '@/store/editor';
import { box, docOf, fontsLoad, get, lines, open, rec } from '@/test/docs';
import { ImportDialog } from './ImportDialog';

vi.mock('@/engine/importers.js', async orig => ({ ...(await orig<typeof import('@/engine/importers.js')>()), readDocument: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn(), getToasts: vi.fn(() => []) }), Toaster: () => null }));
vi.mock('@/store/documents', async orig => {
  const actual = await orig<typeof import('@/store/documents')>();
  return { ...actual, createDoc: vi.fn(actual.createDoc) };
});

fontsLoad();
const wideMatchMedia = window.matchMedia;
const width = (px: number) => Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => px });
/** A phone: no media query for a wide window matches, and every element is 390 px wide. */
function phone(): void {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }) as MediaQueryList;
  width(390);
}

const ESSAY = { parts: ['# A Short Essay\n\n## Introduction\nWater moves between **rivers**, *seas* and ~~lakes~~ all the time.', '## Conclusion\nThat is the water cycle.'], pages: 0, words: 24, name: 'Essay' };
const essay = () => new File(['x'], 'Essay.docx');
function Open({ file = essay() }: { file?: File | null }) { const o = useEditor(s => s.importOpen); return <ImportDialog open={o} file={file} target="open" onClose={closeImport} />; }
function HomeLike() { const o = useEditor(s => s.importOpen), f = useEditor(s => s.importFile); return <ImportDialog open={o} file={f} target="new" onClose={closeImport} />; }
/** The document's own Undo and Redo keys, as the top bar listens for them. */
function Shortcuts() { useUndoShortcuts(); return null; }
const dialog = () => screen.findByRole('dialog', { name: 'Import a document' }), writeIt = () => screen.getByRole('button', { name: 'Write it out' });
const ready = () => screen.findByText('Essay.docx: 24 words.');

beforeEach(async () => {
  await flushSave(); vi.mocked(sonner).mockClear(); vi.mocked(sonner.dismiss).mockClear(); vi.mocked(sonner.getToasts).mockReset().mockReturnValue([]); vi.mocked(createDoc).mockClear();
  vi.mocked(readDocument).mockReset().mockResolvedValue(ESSAY);
});
afterEach(() => { window.matchMedia = wideMatchMedia; width(1200); closeImport(); });
afterAll(async () => { await flushSave(); delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth; vi.unstubAllGlobals(); });

test('a chosen file is read and shown as it will come across', async () => {
  open(docOf(box({ id: 'm', text: 'old' }))); openImport(); render(<Open />); await dialog();
  expect(await screen.findByText('Essay.docx: 24 words.')).toBeInTheDocument();
  const tb = screen.getByRole('textbox', { name: 'Imported text' }); expect(within(tb).getByRole('heading', { level: 1 })).toHaveTextContent('A Short Essay');
  expect(screen.getByRole('checkbox', { name: 'Start a new page where the file does' })).toBeInTheDocument(); expect(writeIt()).toBeEnabled();
});
test('with no file yet, the dialog asks for one', async () => { open(docOf(box())); openImport(); render(<Open file={null} />); expect(await screen.findByText('Choose a PDF, Word (.docx) or text file')).toBeInTheDocument(); expect(writeIt()).toBeDisabled(); });
test('a file that can’t be read says why, and nothing can be written out', async () => {
  vi.mocked(readDocument).mockRejectedValueOnce(Object.assign(new Error('rtf'), { code: 'rtf' })); open(docOf(box())); openImport(); render(<Open />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Rich text files (.rtf) can’t be read here. Open it in Word or Google Docs and save it as .docx or PDF first.');
  expect(writeIt()).toBeDisabled(); expect(screen.getByText('Choose a PDF, Word (.docx) or text file')).toBeInTheDocument();
});
test('the last file chosen wins', async () => {
  let first!: (r: ReadResult) => void; vi.mocked(readDocument).mockReturnValueOnce(new Promise(r => { first = r; })).mockResolvedValueOnce({ ...ESSAY, parts: ['Second file'], name: 'Two' });
  open(docOf(box())); openImport(); const { rerender } = render(<Open file={new File(['x'], 'One.txt')} />); rerender(<Open file={new File(['y'], 'Two.txt')} />);
  await screen.findByText('Two.txt: 24 words.'); await act(async () => first({ ...ESSAY, parts: ['First file'] }));
  expect(screen.getByRole('textbox', { name: 'Imported text' })).toHaveTextContent('Second file');
});
test('Write it out replaces the pages as one undo step, and the dialog closes', async () => {
  open(docOf(box({ id: 'm', text: 'old' }))); openImport(); render(<Open />); await screen.findByText('Essay.docx: 24 words.');
  await userEvent.click(writeIt());
  expect(get().doc.boxes.map(b => [b.name, b.text])).toEqual([['Main text', ESSAY.parts.join('\n\n')]]); expect(get().importOpen).toBe(false);
  undo(); expect(get().doc.boxes.map(b => b.text)).toEqual(['old']); expect(get().canUndo).toBe(false);
});
test('the choices come with it: the file’s pages, Add after the last page and a look, all in the same step', async () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: lines(40) }))); openImport(); render(<Open />); await screen.findByText('Essay.docx: 24 words.');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Start a new page where the file does' }));
  await userEvent.click(screen.getByRole('radio', { name: 'Add after the last page' })); await userEvent.click(screen.getByRole('radio', { name: 'Journal' }));
  await userEvent.click(writeIt());
  expect(get().doc.boxes).toHaveLength(1); expect(get().doc.boxes[0].text).toBe(lines(40) + '\n\\newpage\n' + ESSAY.parts.join('\n\\newpage\n')); expect(get().S.font).toBe('caveat');
  undo(); expect([get().doc.boxes[0].text, get().S.font]).toEqual([lines(40), 'labelle']);
});
test('an Untitled document takes the file’s name, and the same undo step gives the old one back', async () => {
  openDocument(rec('Untitled', docOf(box({ id: 'm', text: 'old' })))); openImport(); render(<Open />); await ready();
  await userEvent.click(screen.getByRole('radio', { name: 'Letter' })); await userEvent.click(writeIt());
  expect([get().title, get().S.font]).toEqual(['Essay', 'cedarville']);
  undo(); expect([get().title, get().S.font, get().doc.boxes.map(b => b.text), get().canUndo]).toEqual(['Untitled', 'labelle', ['old'], false]);
});
test('a header block with Name, Class and today’s Date', async () => {
  open(docOf(box())); openImport(); render(<Open />); await screen.findByText('Essay.docx: 24 words.');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Add a header block' })); await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Asha'); await userEvent.click(writeIt());
  expect(get().doc.boxes.map(b => b.kind)).toEqual(['header', 'text']); expect(get().doc.boxes[0].fields).toEqual({ name: 'Asha', class: '', date: today() });
});
test('Add after the last page never writes a header, even one ticked and filled in before choosing it', async () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: 'mine' }))); openImport(); render(<Open />); await ready();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Add a header block' })); await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Asha');
  await userEvent.click(screen.getByRole('radio', { name: 'Add after the last page' }));
  expect(screen.queryByRole('checkbox', { name: 'Add a header block' })).toBeNull(); await userEvent.click(writeIt());
  expect(get().doc.boxes.map(b => b.kind)).toEqual(['text']); expect(get().doc.boxes[0].text).toBe('mine\n\\newpage\n' + ESSAY.parts.join('\n\n'));
});
test('…and the open document’s own header stays as it is, never a second one', async () => {
  const fields = { name: 'Old', class: '7B', date: '1 May 2026' };
  open(docOf(box({ id: 'h', kind: 'header', name: 'Header', x: 446, y: 76, w: 320, fields }), box({ id: 'm', name: 'Main text', y: 178, text: 'mine' })));
  openImport(); render(<Open />); await ready();
  const name = screen.getByRole('textbox', { name: 'Name' }); await userEvent.clear(name); await userEvent.type(name, 'New');
  await userEvent.click(screen.getByRole('radio', { name: 'Add after the last page' })); await userEvent.click(writeIt());
  const headers = get().doc.boxes.filter(b => b.kind === 'header'); expect(headers).toHaveLength(1); expect(headers[0].fields).toEqual(fields);
});
test('edits in the preview are what is written', async () => {
  open(docOf(box())); openImport(); render(<Open />); const tb = await screen.findByRole('textbox', { name: 'Imported text' });
  // (jsdom has no End key or click position in an editor, so the caret is put at the end of the last line, 'That is the water cycle.')
  const ed = (tb as HTMLElement & { editor: Editor }).editor; act(() => { ed.commands.setTextSelection(ed.state.doc.content.size - 1); ed.view.focus(); });
  await userEvent.keyboard(' Really.'); await userEvent.click(writeIt());
  expect(get().doc.boxes[0].text).toContain('That is the water cycle. Really.');
});
test('Ctrl+Z in the preview leaves the document and its history alone', async () => {
  open(docOf(box({ id: 'm', text: 'mine' }))); openImport(); render(<Open />); const tb = await screen.findByRole('textbox', { name: 'Imported text' });
  await userEvent.click(tb); await userEvent.keyboard('abc{Control>}z{/Control}'); expect([get().doc.boxes[0].text, get().canUndo]).toEqual(['mine', false]);
});
test('while the dialog is open, the document’s Undo and Redo keys never reach it, from a radio or a button either', async () => {
  open(docOf(box({ id: 'm', text: 'mine' }))); setV({ size: 40 }); setV({ size: 44 }); undo(); // a step to undo, and one to redo
  const user = userEvent.setup(), state = () => [get().S.size, get().canUndo, get().canRedo];
  openImport(); render(<><Shortcuts /><Open /></>); await ready();
  for (const el of [screen.getByRole('radio', { name: 'Add after the last page' }), screen.getByRole('radio', { name: 'Journal' }), screen.getByRole('button', { name: 'Cancel' }), await dialog()]) {
    for (const keys of ['{Control>}z{/Control}', '{Control>}{Shift>}z{/Shift}{/Control}', '{Control>}y{/Control}', '{Meta>}z{/Meta}']) {
      act(() => el.focus()); await user.keyboard(keys); // (each on its own: an Undo then a Redo would put it back)
      expect(state()).toEqual([40, true, true]);
    }
  }
  await user.click(screen.getByRole('button', { name: 'Cancel' })); await user.keyboard('{Control>}z{/Control}'); // once it's closed, they're the document's again
  expect(state()).toEqual([30, false, true]);
});
test('…and outside a text field the keys do nothing at all, so the browser’s own Undo doesn’t start either', async () => {
  open(docOf(box())); openImport(); render(<Open />); await ready(); await userEvent.click(screen.getByRole('checkbox', { name: 'Add a header block' }));
  const z = (el: Element) => fireEvent.keyDown(el, { key: 'z', ctrlKey: true }); // false: its default was prevented
  expect([screen.getByRole('radio', { name: 'Journal' }), screen.getByRole('button', { name: 'Cancel' }), screen.getByLabelText('Choose another file'), await dialog()].map(z)).toEqual([false, false, false, false]);
  expect(z(screen.getByRole('textbox', { name: 'Name' }))).toBe(true); // a field keeps its own undo
});
test('the browser’s own Undo (Ctrl+Z in a field with nothing to undo of its own, or the Edit menu) never reaches an editor behind the dialog', async () => {
  open(docOf(box({ id: 'm', text: 'mine' }))); let behind!: Editor;
  render(<><BlockEditor boxId="m" range={null} label="Main text" onReady={e => (behind = e)} /><Open /></>);
  act(() => { behind.commands.insertContentAt(5, '!'); }); expect([get().doc.boxes[0].text, get().canUndo]).toEqual(['mine!', true]);
  const native = (el: Element, inputType: string) => act(() => { el.dispatchEvent(new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true })); });
  act(() => openImport()); const tb = await screen.findByRole('textbox', { name: 'Imported text' });
  for (const t of ['historyUndo', 'historyRedo']) { native(behind.view.dom, t); expect([get().doc.boxes[0].text, get().canUndo, get().canRedo]).toEqual(['mine!', true, false]); }
  act(() => { tb.focus(); }); await userEvent.keyboard('abc'); native(tb, 'historyUndo'); expect(tb).not.toHaveTextContent('abc'); // the preview's own undo still has it
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' })); native(behind.view.dom, 'historyUndo'); expect(get().doc.boxes[0].text).toBe('mine'); // the document's again once it's closed
});
test('an emptied preview can’t be written out', async () => {
  open(docOf(box({ id: 'm', text: 'mine' }))); openImport(); render(<Open />); const tb = await screen.findByRole('textbox', { name: 'Imported text' });
  await userEvent.click(tb); await userEvent.keyboard('{Control>}a{/Control}{Backspace}'); await userEvent.click(writeIt());
  expect(screen.getByRole('alert')).toHaveTextContent('There’s no text to write out.'); expect(get().doc.boxes[0].text).toBe('mine');
});
test('…until something is typed there again', async () => {
  open(docOf(box({ id: 'm', text: 'mine' }))); openImport(); render(<Open />); const tb = await screen.findByRole('textbox', { name: 'Imported text' });
  await userEvent.click(tb); await userEvent.keyboard('{Control>}a{/Control}{Backspace}'); await userEvent.click(writeIt()); await screen.findByRole('alert');
  await userEvent.click(tb); await userEvent.keyboard('Fresh'); expect(screen.queryByRole('alert')).toBeNull();
  await userEvent.click(writeIt()); expect(get().doc.boxes.map(b => b.text)).toEqual(['Fresh']);
});
test('Cancel writes nothing', async () => { open(docOf(box({ id: 'm', text: 'mine' }))); openImport(); render(<Open />); await screen.findByText('Essay.docx: 24 words.'); await userEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect([get().importOpen, get().doc.boxes[0].text, get().canUndo]).toEqual([false, 'mine', false]); });
test.each([
  ['the close button', () => userEvent.click(screen.getByRole('button', { name: 'Close' }))],
  ['Escape', () => userEvent.keyboard('{Escape}')],
])('%s writes nothing either', async (_how, close) => {
  open(docOf(box({ id: 'm', text: 'mine' }))); openImport(); render(<Open />); await ready();
  await userEvent.click(screen.getByRole('radio', { name: 'Journal' })); await close();
  expect([get().importOpen, get().doc.boxes[0].text, get().S.font, get().canUndo]).toEqual([false, 'mine', 'labelle', false]);
});
test('opening it again starts afresh: no file, and the choices back where they start', async () => {
  vi.mocked(readDocument).mockRejectedValueOnce(Object.assign(new Error('odt'), { code: 'odt' }));
  open(docOf(box())); openImport(); const { rerender } = render(<Open file={new File(['x'], 'Essay.odt')} />); await screen.findByRole('alert');
  await userEvent.upload(document.querySelector<HTMLInputElement>('input[type=file]')!, essay()); await ready();
  await userEvent.click(screen.getByRole('radio', { name: 'Add after the last page' })); await userEvent.click(screen.getByRole('radio', { name: 'Journal' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  rerender(<Open file={null} />); act(() => openImport()); await dialog();
  expect(screen.queryByRole('alert')).toBeNull(); expect(screen.queryByRole('textbox', { name: 'Imported text' })).toBeNull(); expect(writeIt()).toBeDisabled();
  await userEvent.upload(document.querySelector<HTMLInputElement>('input[type=file]')!, essay()); await ready();
  expect(screen.getByRole('radio', { name: 'Replace what’s on the pages' })).toBeChecked(); expect(screen.getByRole('radio', { name: 'Keep this document’s look' })).toBeChecked();
});
test('Choose another file reads that one instead', async () => {
  open(docOf(box())); openImport(); render(<Open />); await ready();
  vi.mocked(readDocument).mockResolvedValueOnce({ parts: ['Other words'], pages: 2, words: 2, name: 'Other' });
  const other = new File(['y'], 'Other.pdf'); await userEvent.upload(screen.getByLabelText('Choose another file'), other);
  expect(await screen.findByText('Other.pdf: 2 words from 2 pages.')).toBeInTheDocument(); expect(readDocument).toHaveBeenLastCalledWith(other);
  expect(screen.getByRole('textbox', { name: 'Imported text' })).toHaveTextContent('Other words');
});
test('the status line says what is being read, then its words and the file’s pages', async () => {
  let done!: (r: ReadResult) => void; vi.mocked(readDocument).mockReturnValueOnce(new Promise(r => { done = r; }));
  open(docOf(box())); openImport(); render(<Open file={new File(['x'], 'Essay.pdf')} />); const d = await dialog();
  expect(within(d).getByRole('status')).toHaveTextContent('Reading Essay.pdf…'); expect(writeIt()).toBeDisabled();
  await act(async () => done({ ...ESSAY, words: 1204, pages: 3 }));
  expect(within(d).getByRole('status')).toHaveTextContent(/^Essay\.pdf: 1,204 words from 3 pages\.$/); expect(writeIt()).toBeEnabled();
});
test('…one word from one page', async () => {
  vi.mocked(readDocument).mockResolvedValueOnce({ parts: ['Hello'], pages: 1, words: 1, name: 'Hi' });
  open(docOf(box())); openImport(); render(<Open file={new File(['x'], 'Hi.pdf')} />);
  expect(await screen.findByText('Hi.pdf: 1 word from 1 page.')).toBeInTheDocument();
});
test.each(['scan', 'password', 'locked', 'doc', 'rtf', 'odt', 'image', 'type', 'empty', 'big', 'lib', 'read', undefined])('a file refused with code %s says so in Task 1’s words', async code => {
  vi.mocked(readDocument).mockRejectedValueOnce(Object.assign(new Error('no'), code ? { code } : {}));
  open(docOf(box())); openImport(); render(<Open />);
  expect((await screen.findByRole('alert')).textContent).toBe(importError(code ?? ''));
  expect(writeIt()).toBeDisabled(); expect(screen.getByText('Choose a PDF, Word (.docx) or text file')).toBeInTheDocument();
});
test('a file dropped anywhere on the dialog is read there, and goes no further', async () => {
  open(docOf(box())); openImport(); render(<Open file={null} />); const d = await dialog(); const behind = vi.fn(); window.addEventListener('drop', behind);
  const f = new File(['z'], 'Dropped.txt'), data = { dataTransfer: { files: [f], types: ['Files'] } };
  try {
    expect(fireEvent.dragOver(within(d).getByRole('heading', { name: 'Import a document' }), data)).toBe(false); // (the drop is allowed)
    fireEvent.drop(within(d).getByRole('heading', { name: 'Import a document' }), data);
    expect(await screen.findByText('Dropped.txt: 24 words.')).toBeInTheDocument(); expect(readDocument).toHaveBeenLastCalledWith(f); expect(behind).not.toHaveBeenCalled();
  } finally { window.removeEventListener('drop', behind); }
});
/** The Write bar's Import button, as the dialog is opened from it. */
function ImportButton() { return <button type="button" onClick={() => openImport()}>Import</button>; }
test.each([
  ['Cancel', () => userEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
  ['the close button', () => userEvent.click(screen.getByRole('button', { name: 'Close' }))],
  ['Escape', () => userEvent.keyboard('{Escape}')],
])('closing with %s gives the focus back to the button that opened it', async (_how, close) => {
  open(docOf(box())); render(<><ImportButton /><Open /></>); const button = screen.getByRole('button', { name: 'Import' });
  await userEvent.click(button); await ready(); expect(button).not.toHaveFocus();
  await close(); await waitFor(() => expect(button).toHaveFocus());
});
test('Write it out puts the caret where the imported text starts, in the document', async () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: 'mine' }))); let behind!: Editor;
  render(<><ImportButton /><BlockEditor boxId="m" range={null} label="Main text" acceptCaret onReady={e => (behind = e)} /><Open /></>);
  await userEvent.click(screen.getByRole('button', { name: 'Import' })); await ready();
  await userEvent.click(screen.getByRole('radio', { name: 'Add after the last page' })); await userEvent.click(writeIt());
  await waitFor(() => expect(behind.view.dom).toHaveFocus());
  const text = get().doc.boxes[0].text; expect(offsetAt(behind.state.doc, text, behind.state.selection.from)).toBe('mine\n\\newpage\n'.length);
  await new Promise(r => setTimeout(r, 10)); expect(behind.view.dom).toHaveFocus(); // (closing doesn't take it back to the button)
});
test('on a phone, Write it out leaves the caret out of the editor (no keyboard) and focuses the pages instead', async () => {
  phone(); open(docOf(box({ id: 'm', name: 'Main text', text: 'mine' }))); render(<><ImportButton /><main data-pages aria-label="Pages"><h2 data-page-heading tabIndex={-1}>Page 1</h2></main><Open /></>);
  await userEvent.click(screen.getByRole('button', { name: 'Import' })); await ready(); await userEvent.click(writeIt());
  expect(get().caret).toBeNull(); await waitFor(() => expect(screen.getByText('Page 1')).toHaveFocus());
  await new Promise(r => setTimeout(r, 10)); expect(screen.getByText('Page 1')).toHaveFocus();
});
test('…and with Replace, at the start of the new Main text', async () => {
  open(docOf(box({ id: 'm', text: 'mine' }))); render(<><ImportButton /><Open /></>);
  await userEvent.click(screen.getByRole('button', { name: 'Import' })); await ready(); await userEvent.click(writeIt());
  expect(get().caret).toMatchObject({ boxId: get().doc.boxes.at(-1)!.id, offset: 0 }); expect(get().canUndo).toBe(true);
  undo(); expect([get().doc.boxes.map(b => b.text), get().canUndo]).toEqual([['mine'], false]); // (still the one step)
});
test('opening it puts away the messages still showing, each by its own id', async () => {
  open(docOf(box())); vi.mocked(sonner.dismiss).mockClear(); vi.mocked(sonner.getToasts).mockReturnValue([{ id: 1 }, { id: 'two' }] as ReturnType<typeof sonner.getToasts>);
  openImport(); render(<Open />); await ready();
  expect(vi.mocked(sonner.dismiss).mock.calls).toEqual([[1], ['two']]);
});
test('opening puts the focus on the dialog itself, not in the preview', async () => {
  open(docOf(box())); openImport(); render(<Open />); const d = await dialog(); await ready();
  expect(document.activeElement).toBe(d); expect(d).toHaveAttribute('tabindex', '-1');
});
test('wide screens: the preview sits in a column of its own that it scrolls in, the options in another', async () => {
  open(docOf(box())); openImport(); render(<Open />); await ready();
  const root = screen.getByRole('toolbar', { name: 'Formatting' }).parentElement!, column = root.parentElement!, body = column.parentElement!;
  expect(column).toHaveClass('flex', 'min-h-0', 'flex-col'); expect(body).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto', 'wide:grid', 'wide:grid-cols-[minmax(0,1fr)_340px]', 'wide:overflow-hidden');
  expect(within(body).getByRole('radiogroup', { name: 'Look' }).closest('.wide\\:overflow-y-auto')?.parentElement).toBe(body);
});
test('from Home, Write it out makes a new document with its look and opens it', async () => {
  location.hash = '#/'; const onClose = vi.fn(); render(<ImportDialog open file={essay()} target="new" onClose={onClose} />);
  await screen.findByText('Essay.docx: 24 words.'); expect(screen.queryByRole('radiogroup', { name: 'Where it goes' })).toBeNull();
  await userEvent.click(screen.getByRole('radio', { name: 'Neat notes' })); await userEvent.click(writeIt());
  await waitFor(() => expect(parseHash(location.hash)).toMatchObject({ name: 'doc', stage: 'write' }));
  expect([get().title, get().S.font, get().canUndo, onClose.mock.calls.length]).toEqual(['Essay', 'patrick', false, 1]);
});
test('from Home, wide: the new document’s caret waits at the start of the imported text', async () => {
  location.hash = '#/'; render(<ImportDialog open file={essay()} target="new" onClose={vi.fn()} />); await ready(); await userEvent.click(writeIt());
  await waitFor(() => expect(get().caret).toMatchObject({ boxId: get().doc.boxes.at(-1)!.id, offset: 0 }));
});
test('from Home, on a phone: no caret (no keyboard); the pages get the focus once they are drawn', async () => {
  phone(); location.hash = '#/'; openImport(essay()); render(<HomeLike />); await ready(); await userEvent.click(writeIt());
  await waitFor(() => expect(parseHash(location.hash)).toMatchObject({ name: 'doc' })); expect(get().caret).toBeNull();
  render(<main data-pages aria-label="Pages"><h2 data-page-heading>Page 1</h2></main>); // (drawn a moment later)
  await waitFor(() => expect(screen.getByText('Page 1')).toHaveFocus()); expect(get().caret).toBeNull();
});
test('from Home, Write it out can’t be pressed again while the document is being made', async () => {
  location.hash = '#/'; const onClose = vi.fn(); render(<ImportDialog open file={essay()} target="new" onClose={onClose} />); await ready();
  fireEvent.click(writeIt()); expect(writeIt()).toBeDisabled(); fireEvent.click(writeIt());
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1)); expect(createDoc).toHaveBeenCalledTimes(1); expect(writeIt()).toBeEnabled();
});
test('from Home, Cancel makes nothing', async () => {
  const before = (await listDocs()).length, onClose = vi.fn(); render(<ImportDialog open file={essay()} target="new" onClose={onClose} />); await ready();
  await userEvent.click(screen.getByRole('radio', { name: 'Journal' })); await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalledTimes(1); expect(createDoc).not.toHaveBeenCalled(); expect((await listDocs()).length).toBe(before);
});
test('from Home, a refused file makes nothing', async () => {
  vi.mocked(readDocument).mockRejectedValueOnce(Object.assign(new Error('image'), { code: 'image' })); const before = (await listDocs()).length;
  render(<ImportDialog open file={new File(['x'], 'IMG_0001.heic')} target="new" onClose={vi.fn()} />); await screen.findByRole('alert');
  expect(writeIt()).toBeDisabled(); expect((await listDocs()).length).toBe(before);
});
test('on a phone the dialog fills the screen, and crossing 860 px keeps the preview and its edits', async () => {
  phone(); open(docOf(box())); openImport(); render(<Open />);
  expect(await dialog()).toHaveClass('h-dvh', 'w-full', 'rounded-none', 'wide:h-[min(52rem,calc(100dvh-4rem))]', 'wide:w-[min(68rem,calc(100vw-4rem))]');
  const tb = await screen.findByRole('textbox', { name: 'Imported text' }); await userEvent.click(tb); await userEvent.keyboard('Draft ');
  act(() => { window.matchMedia = wideMatchMedia; width(1200); window.dispatchEvent(new Event('resize')); });
  await userEvent.click(screen.getByRole('radio', { name: 'Journal' })); // (and the dialog draws again on the wide side)
  expect(screen.getByRole('textbox', { name: 'Imported text' })).toBe(tb); expect(tb).toHaveTextContent('Draft');
});
