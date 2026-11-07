// The Pages view: each page's typed copy beside its handwritten one, the Show switch, page rows, and typing
// past the bottom of a page without anything moving under the caret.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/core';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { PAGE_W } from '@/engine/config.js';
import { hitWord, srcOffset } from '@/engine/core.js';
import { cleanSettings, sampleDoc } from '@/engine/doc.js';
import type { EngineDoc } from '@/engine/types';
import { App } from '@/app/App';
import { addPageAt, deleteBlock, deletePageAt, splitAt } from '@/features/doc/actions';
import { layoutFor } from '@/features/doc/model';
import { offsetAt } from '@/features/editor/positions';
import { createDoc } from '@/store/documents';
import { flushSave, update } from '@/store/editor';
import { box, docOf, fontsLoad, get, lines, words } from '@/test/docs';

vi.mock('@/store/documents', async orig => ({ ...(await orig<typeof import('@/store/documents')>()), putDoc: vi.fn(async () => {}) }));

// jsdom does no layout: every element is 1200 px wide, so pages are 500 px wide side by side.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
  fontsLoad();
});
afterAll(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  vi.unstubAllGlobals();
});
beforeEach(async () => { await flushSave(); localStorage.removeItem('nib.writeMode'); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

/** Open a document (the sample when none is given) in the Pages view, and wait for its pages. */
async function openWrite(doc?: EngineDoc): Promise<void> {
  const S = cleanSettings(null, false);
  const id = (await createDoc({ title: 'T', settings: S, doc: doc ?? sampleDoc(S) })).id;
  location.hash = `#/d/${id}/write`;
  render(<App />);
  await screen.findByText('Page 1');
}
const textbox = (name: string) => screen.getByRole('textbox', { name });
/** The TipTap editor behind a textbox (TipTap keeps it on its element). */
const editorFor = (name: string) => (textbox(name) as HTMLElement & { editor: Editor }).editor;
const textOf = (name: string) => editorFor(name).getText({ blockSeparator: '\n' });
const row = (i: number) => document.querySelector<HTMLElement>(`[data-drop-page="${i}"]`)!;
const typed = (i: number) => document.querySelector<HTMLElement>(`.typed-page[data-paper="${i}"]`)!;
const m = (text: string, p = {}) => box({ id: 'm', name: 'Main text', text, ...p });
const rect = (top: number, h: number) => ({ top, bottom: top + h, height: h, left: 0, right: 1200, width: 1200, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
const s = 500 / PAGE_W;

test('each page shows its typed and handwritten copies', async () => {
  await openWrite();
  expect(screen.getByText('· 2 blocks')).toBeInTheDocument();
  expect(screen.getByText('Typed · edit here')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Handwritten page 1 of 1' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Main text, page 1' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Aarav Mehta');
  expect(screen.getByRole('button', { name: 'Drag to move page 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Options for page 1' })).toBeInTheDocument();
  expect(within(typed(0)).getByRole('button', { name: 'Move Main text' })).toBeInTheDocument();
  expect(within(typed(0)).getByRole('button', { name: 'Options for Main text' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add page' })).toBeInTheDocument();
  expect(screen.queryByText(/text\sbox/i)).toBeNull(); // the interface says Block
});

test('a part sits where its handwriting is, in its block’s colour, with the page’s text size', async () => {
  await openWrite(docOf(m(lines(40), { color: 2 })));
  const sg = layoutFor(get().S, get().doc).segs.find(p => p.box.id === 'm' && p.idx === 1)!;
  const part = typed(1).querySelector<HTMLElement>('[data-part="m:1"]')!;
  const px = (v: string) => parseFloat(v); // jsdom keeps 6 significant digits
  const placed = [part.style.marginLeft, part.style.marginTop, part.style.width, part.style.minHeight].map(px);
  [sg.x, sg.top + 3.4, sg.w, sg.bottom - sg.top - 3.4].forEach((v, k) => expect(placed[k]).toBeCloseTo(v * s, 2));
  expect(part.style.getPropertyValue('--bc')).toBe('#D9661F');
  expect(within(part).getByText('2 of 2')).toBeInTheDocument();
  const body = textbox('Main text, page 2').closest<HTMLElement>('.typed-body')!;
  expect(px(body.style.fontSize)).toBeCloseTo(34 * s * 0.56, 3);
  expect(px(body.style.lineHeight)).toBeCloseTo(34 * s, 3);
  // A4, growing to hold its parts (while a part is frozen past the bottom, its page is longer).
  expect([typed(1).style.width, typed(1).style.minHeight]).toEqual(['500px', `${Math.round(500 * 1123 / 794)}px`]);
});

test('a document with nothing written opens with its typed page showing, and the Show kept for others stays', async () => {
  localStorage.setItem('nib.writeMode', 'hand');
  await openWrite(docOf()); // a new document: no blocks yet
  expect(screen.getByRole('button', { name: 'Side by side' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Empty page. Use + Add, or drag a block here in Outline.')).toBeInTheDocument();
  expect(localStorage.getItem('nib.writeMode')).toBe('hand');
  cleanup();
  await openWrite(docOf(m(' '), box({ id: 'n', name: 'Margin note', kind: 'note', text: '' }))); // blank blocks: still nothing written
  expect(screen.getByRole('button', { name: 'Side by side' })).toHaveAttribute('aria-pressed', 'true');
  cleanup();
  await openWrite(docOf(m('Some words')));
  expect(screen.getByRole('button', { name: 'Handwritten' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('textbox', { name: 'Main text, page 1' })).toBeNull();
  localStorage.setItem('nib.writeMode', 'typed');
  cleanup();
  await openWrite(docOf());
  expect(screen.getByRole('button', { name: 'Typed' })).toHaveAttribute('aria-pressed', 'true'); // the typed page shows already
});

test('Show switches and is remembered', async () => {
  await openWrite();
  const pages = screen.getByRole('main', { name: 'Pages' });
  await userEvent.click(screen.getByRole('button', { name: 'Typed' }));
  expect(within(pages).queryByText('Handwritten')).toBeNull();
  expect(screen.queryByRole('img', { name: 'Handwritten page 1 of 1' })).toBeNull();
  expect(localStorage.getItem('nib.writeMode')).toBe('typed');
  await userEvent.click(screen.getByRole('button', { name: 'Handwritten' }));
  expect(screen.queryByRole('textbox', { name: 'Main text, page 1' })).toBeNull();
  expect(screen.getByRole('img', { name: 'Handwritten page 1 of 1' })).toBeInTheDocument();
  cleanup();
  render(<App />);
  expect(await screen.findByRole('button', { name: 'Handwritten' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('textbox', { name: 'Main text, page 1' })).toBeNull();
});

test('typing past the bottom of page 1 leaves page 2’s typed copy alone until you leave the editor', async () => {
  await openWrite(docOf(m(lines(29)))); // line1–28 on page 1, line29 on page 2
  expect(textOf('Main text, page 2')).toBe('line29');
  vi.useFakeTimers();
  const p1 = editorFor('Main text, page 1');
  act(() => { p1.view.focus(); });
  act(() => { p1.commands.setTextSelection(6); p1.commands.splitBlock(); p1.commands.insertContent('new'); }); // after line1
  const caret = p1.state.selection.from;
  await act(() => vi.advanceTimersByTimeAsync(200)); // the layout settles: line28 is now on page 2
  expect(textOf('Main text, page 2')).toBe('line29'); // frozen
  expect(textOf('Main text, page 1').split('\n')).toEqual(['line1', 'new', ...lines(28).split('\n').slice(1)]);
  expect(within(textbox('Main text, page 1')).getByText('Page 2 starts here')).toBeInTheDocument();
  expect([p1.state.selection.from, document.activeElement]).toEqual([caret, textbox('Main text, page 1')]);
  act(() => { p1.commands.blur(); });
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(textOf('Main text, page 2')).toBe('line28\nline29');
  expect(textOf('Main text, page 1').split('\n')).toEqual(['line1', 'new', ...lines(27).split('\n').slice(1)]);
  expect(get().doc.boxes[0].text.split('\n')).toEqual(['line1', 'new', ...lines(29).split('\n').slice(1)]);
});

test('after Ctrl+Z in the editor, typing still leaves the next page alone', async () => {
  await openWrite(docOf(m(lines(29))));
  vi.useFakeTimers();
  const p1 = editorFor('Main text, page 1');
  act(() => { p1.view.focus(); });
  act(() => { p1.commands.setTextSelection(6); p1.commands.splitBlock(); });
  await act(() => vi.advanceTimersByTimeAsync(200));
  fireEvent.keyDown(p1.view.dom, { key: 'z', ctrlKey: true });
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect([textOf('Main text, page 1'), textOf('Main text, page 2')]).toEqual([lines(28), 'line29']);
  expect(document.activeElement).toBe(textbox('Main text, page 1'));
  act(() => { p1.commands.setTextSelection(6); p1.commands.splitBlock(); p1.commands.insertContent('again'); });
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(textOf('Main text, page 2')).toBe('line29');
  expect(textOf('Main text, page 1').split('\n')).toHaveLength(29);
});

test('typing a new line at the very bottom of a full page keeps the caret on it', async () => {
  await openWrite(docOf(m(lines(28)))); // exactly one page
  vi.useFakeTimers();
  const p1 = editorFor('Main text, page 1');
  act(() => { p1.view.focus(); p1.commands.setTextSelection(p1.state.doc.content.size - 1); });
  act(() => { p1.commands.splitBlock(); p1.commands.insertContent('x'); });
  const caret = p1.state.selection.from;
  await act(() => vi.advanceTimersByTimeAsync(200)); // the layout puts "x" on a new page 2
  expect(screen.getByText('Page 2')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Main text, page 2' })).toBeNull(); // it fills once you leave
  expect(textOf('Main text, page 1').split('\n').slice(-2)).toEqual(['line28', 'x']);
  expect([p1.state.selection.from, document.activeElement]).toEqual([caret, textbox('Main text, page 1')]);
  act(() => { p1.commands.insertContent('y'); });
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(get().doc.boxes[0].text).toBe(lines(28) + '\nxy');
  act(() => { p1.commands.blur(); });
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect([textOf('Main text, page 1'), textOf('Main text, page 2')]).toEqual([lines(28), 'xy']);
});

test('while frozen, a part the block gains waits, and every line shows once', async () => {
  await openWrite(docOf(m(lines(56)))); // two full pages
  vi.useFakeTimers();
  const p1 = editorFor('Main text, page 1');
  act(() => { p1.view.focus(); });
  act(() => { p1.commands.setTextSelection(6); p1.commands.splitBlock(); p1.commands.insertContent('new'); });
  await act(() => vi.advanceTimersByTimeAsync(200)); // line56 now goes on to a page 3
  expect(screen.getByText('Page 3')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Main text, page 3' })).toBeNull();
  expect(screen.queryByText(/^Continues the paragraph/)).toBeNull(); // it doesn't, it waits
  const shown =[...textOf('Main text, page 1').split('\n'), ...textOf('Main text, page 2').split('\n')];
  expect(shown).toEqual(get().doc.boxes[0].text.split('\n'));
  act(() => { p1.commands.blur(); });
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(textOf('Main text, page 3')).toBe('line56');
});

test('a waiting part keeps waiting when the focus moves to another part of its block', async () => {
  await openWrite(docOf(m(lines(56))));
  vi.useFakeTimers();
  const p1 = editorFor('Main text, page 1');
  act(() => { p1.view.focus(); });
  act(() => { p1.commands.setTextSelection(6); p1.commands.splitBlock(); p1.commands.insertContent('new'); });
  await act(() => vi.advanceTimersByTimeAsync(200)); // line56 goes on to a page 3, which waits
  act(() => { editorFor('Main text, page 2').view.focus(); });
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(document.activeElement).toBe(textbox('Main text, page 2'));
  expect(screen.queryByText(/^Continues the paragraph/)).toBeNull();
  expect(screen.queryByRole('textbox', { name: 'Main text, page 3' })).toBeNull();
  const shown = [...textOf('Main text, page 1').split('\n'), ...textOf('Main text, page 2').split('\n')];
  expect(shown).toEqual(get().doc.boxes[0].text.split('\n'));
  act(() => { editorFor('Main text, page 2').commands.blur(); });
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(textOf('Main text, page 3')).toBe('line56');
});

test('while frozen, a block that no longer reaches the next page shows its last lines at once', async () => {
  await openWrite(docOf(m(lines(29))));
  vi.useFakeTimers();
  const p1 = editorFor('Main text, page 1');
  act(() => { p1.view.focus(); });
  act(() => { p1.commands.deleteRange({ from: 6, to: 8 }); }); // line1 and line2 become one line
  const caret = p1.state.selection.from;
  await act(() => vi.advanceTimersByTimeAsync(200)); // everything fits on page 1 now
  expect(screen.queryByText('Page 2')).toBeNull();
  expect(textOf('Main text, page 1').split('\n')).toEqual(['line1line2', ...lines(29).split('\n').slice(2)]);
  expect([p1.state.selection.from, document.activeElement]).toEqual([caret, textbox('Main text, page 1')]);
});

test('deleting the block whose editor has focus leaves nothing behind', async () => {
  await openWrite();
  vi.useFakeTimers();
  act(() => { editorFor('Main text, page 1').view.focus(); });
  act(() => deleteBlock('b1'));
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(get().doc.boxes.some(b => b.id === 'b1')).toBe(false);
  expect(screen.queryByRole('textbox', { name: /Main text/ })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Page 1' })); // not lost to the page body
});

test('splitting and deleting a page while an editor has focus', async () => {
  await openWrite(docOf(m(lines(40))));
  vi.useFakeTimers();
  act(() => { editorFor('Main text, page 2').view.focus(); });
  act(() => splitAt('m', 1));
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(textOf('Main text (continued), page 2')).toBe(lines(40).split('\n').slice(28).join('\n'));
  expect(screen.queryByRole('textbox', { name: 'Main text, page 2' })).toBeNull();
  // the focus went to the part now in its place
  expect(document.activeElement).toBe(within(typed(1)).getByRole('button', { name: 'Options for Main text (continued)' }));
  act(() => { editorFor('Main text (continued), page 2').view.focus(); });
  act(() => deletePageAt(1));
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(get().doc.boxes.map(b => b.id)).toEqual(['m']);
  expect(get().doc.boxes[0].text).toBe(lines(28));
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Page 1' }));
});

test('clicking a word in Handwritten mode opens the typed copy at that word', async () => {
  await openWrite();
  await userEvent.click(screen.getByRole('button', { name: 'Handwritten' }));
  const sg = layoutFor(get().S, get().doc).segs.find(p => p.box.id === 'b1')!;
  const rw = sg.rows.filter(r => r.kind === 'text')[3];
  const at = { clientX: (sg.x + 60) * s, clientY: (rw.ruleY - 6) * s };
  const want = srcOffset(sg.box.text, hitWord(sg, at.clientX / s, at.clientY / s)!);
  expect(want).toBeGreaterThan(0);
  const f = document.querySelector<HTMLElement>('.block-frame[data-id="b1:0"]')!;
  fireEvent.pointerDown(f, { ...at, button: 0, pointerId: 1 });
  fireEvent.pointerUp(f, { ...at, pointerId: 1 });
  fireEvent.click(f, at);
  expect(localStorage.getItem('nib.writeMode')).toBe('side');
  const ed = editorFor('Main text, page 1');
  expect(document.activeElement).toBe(textbox('Main text, page 1'));
  expect(offsetAt(ed.state.doc, get().doc.boxes[1].text, ed.state.selection.from)).toBe(want);
  expect(get().caret).toBeNull();
});

test('an empty page says how to fill it', async () => {
  await openWrite();
  act(() => addPageAt());
  expect(await screen.findByText('Empty page. Use + Add, or drag a block here in Outline.')).toBeInTheDocument();
  expect(screen.getByText('· 0 blocks')).toBeInTheDocument();
});

test('a part with no line of its own points to where its paragraph starts', async () => {
  await openWrite(docOf(m(words(40), { y: 1009 })));
  expect(await screen.findByText('Continues the paragraph from page 1.')).toBeInTheDocument();
  expect(textOf('Main text, page 1')).toBe(words(40));
  expect(screen.queryByRole('textbox', { name: 'Main text, page 2' })).toBeNull();
  expect(within(textbox('Main text, page 1')).getByText('Page 2 starts here')).toBeInTheDocument(); // mid-paragraph
});

test('Import opens from the Write bar and from a file dropped anywhere on the document', async () => {
  await openWrite();
  await userEvent.click(screen.getByRole('button', { name: 'Import' }));
  const dlg = await screen.findByRole('dialog', { name: 'Import a document' });
  await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  // jsdom has no DragEvent, so give a plain event the parts the drop handler reads.
  const file = new File(['Dropped words'], 'notes.txt', { type: 'text/plain' });
  const drop = Object.assign(new Event('drop', { cancelable: true }), { dataTransfer: { types: ['Files'], files: [file] } });
  act(() => { window.dispatchEvent(drop); });
  expect(await screen.findByDisplayValue('Dropped words')).toBeInTheDocument();
});

test('dragging a page by its grip moves it', async () => {
  await openWrite({ ...docOf(m(lines(5)), box({ id: 'n', name: 'Notes', page: 1, text: 'x' })), pageCount: 2 });
  row(0).getBoundingClientRect = () => rect(0, 100);
  vi.spyOn(document, 'elementFromPoint').mockImplementation(() => row(0));
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Drag to move page 2' }), { pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 10, clientY: 150 });
  fireEvent.pointerMove(document, { pointerId: 1, clientX: 10, clientY: 30 });
  expect(row(0).dataset.drop).toBe('before');
  fireEvent.pointerUp(document, { pointerId: 1, clientX: 10, clientY: 20 });
  expect(get().doc.boxes.map(b => [b.id, b.page])).toEqual([['m', 1], ['n', 0]]);
});

test('a block’s ⋯ is on its typed tag, and on its handwritten tag only when the typed copy is hidden', async () => {
  await openWrite();
  const handTag = () => document.querySelector<HTMLElement>('.block-frame[data-id="b1:0"] .tag')!;
  expect(screen.getAllByRole('button', { name: 'Options for Main text' })).toHaveLength(1);
  expect(within(handTag()).queryByRole('button', { name: 'Options for Main text' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Handwritten' }));
  expect(within(handTag()).getByRole('button', { name: 'Options for Main text' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Typed' }));
  expect(screen.getAllByRole('button', { name: 'Options for Main text' })).toHaveLength(1);
});

test('a header on two pages shows its fields once, on its first part', async () => {
  await openWrite(docOf(box({ id: 'h', kind: 'header', name: 'Header', x: 446, y: 1009, w: 320, fields: { name: 'A', class: 'B', date: 'C' } })));
  const later = typed(1).querySelector<HTMLElement>('[data-part="h:1"]')!;
  expect(later).not.toBeNull(); // the header really runs onto page 2
  expect(screen.getAllByRole('textbox', { name: 'Name' })).toHaveLength(1);
  expect(within(typed(0)).getByRole('textbox', { name: 'Date' })).toHaveValue('C');
  expect(later.querySelector('input, [role="textbox"]')).toBeNull();
  expect(within(later).queryByText(/^Continues/)).toBeNull();
});

test('the grips have no browser panning, so touch drags them', async () => {
  await openWrite();
  expect(screen.getByRole('button', { name: 'Drag to move page 1' })).toHaveClass('touch-none');
  expect(within(typed(0)).getByRole('button', { name: 'Move Main text' })).toHaveClass('touch-none');
  expect(document.querySelector('[data-sheets]')).toContainElement(typed(0));
});

test('a typed part’s grip moves it with the arrow keys', async () => {
  await openWrite(docOf(m(lines(3))));
  const grip = within(typed(0)).getByRole('button', { name: 'Move Main text' });
  grip.focus();
  await userEvent.keyboard('{ArrowDown}');
  expect(get().doc.boxes[0].y).toBe(144);
  expect(document.activeElement).toBe(grip);
});

test('Add puts a new block on the page most in view', async () => {
  await openWrite({ ...docOf(m(lines(5))), pageCount: 3 });
  const pages = screen.getByRole('main', { name: 'Pages' });
  pages.getBoundingClientRect = () => rect(0, 800);
  [-900, 100, 1100].forEach((t, i) => { row(i).getBoundingClientRect = () => rect(t, 900); });
  fireEvent.scroll(pages);
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Text block' }));
  await waitFor(() => expect(get().doc.boxes).toHaveLength(2));
  expect(get().doc.boxes[1].page).toBe(1);
});

test('an import’s first page scrolls into view', async () => {
  await openWrite({ ...docOf(m(lines(5))), pageCount: 3 });
  const into = vi.fn();
  row(2).scrollIntoView = into;
  act(() => update(st => { st.scrollToPage = 2; }, { save: false, layout: false }));
  expect(into).toHaveBeenCalled();
  expect(get().scrollToPage).toBeNull();
});

test('while the stage is hidden (width 0) the pages and editors stay mounted', async () => {
  let width = 1200, resize: (() => void) | null = null;
  vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { resize = cb; } observe() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
  try {
    await openWrite();
    const before = document.querySelectorAll('[data-drop-page]').length;
    expect(textbox('Main text, page 1')).toBeInTheDocument();
    width = 0; // display: none
    act(() => resize?.());
    expect(textbox('Main text, page 1')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-drop-page]').length).toBe(before);
    expect(screen.queryByText('Loading handwriting…')).toBeNull();
  } finally {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
    vi.unstubAllGlobals();
  }
});

test('deleting a block from its ⋯ menu moves the focus to the next block’s menu, else to the page', async () => {
  await openWrite(); // the header, then Main text, on page 1
  await userEvent.click(within(typed(0)).getByRole('button', { name: 'Options for Header' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Delete block' }));
  await waitFor(() => expect(document.activeElement).toBe(within(typed(0)).getByRole('button', { name: 'Options for Main text' })));
  await userEvent.keyboard('{Enter}');
  await userEvent.click(screen.getByRole('menuitem', { name: 'Delete block' }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Page 1' })));
});
