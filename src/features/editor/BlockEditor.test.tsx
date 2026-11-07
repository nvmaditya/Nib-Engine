import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SAMPLE_BODY } from '@/engine/config.js';
import { srcOffset } from '@/engine/core.js';
import { flushSave, openDocument, placeCaret, undo, update } from '@/store/editor';
import { get, rec } from '@/test/docs';
import { setActiveEditor } from './active';
import { BlockEditor, type BlockEditorProps } from './BlockEditor';
import { FormatToolbar } from './FormatToolbar';
import { offsetAt, posAt } from './positions';

vi.mock('@/store/documents', async orig => ({ ...(await orig<typeof import('@/store/documents')>()), putDoc: vi.fn(async () => {}) }));

// jsdom has no ClipboardEvent; ProseMirror makes one for view.pasteHTML.
if (typeof globalThis.ClipboardEvent === 'undefined') {
  globalThis.ClipboardEvent = class extends Event { clipboardData = null; } as unknown as typeof ClipboardEvent;
}

let ed: Editor;
const text = () => get().doc.boxes[0].text;
const ui = (p: Partial<BlockEditorProps> = {}) => (
  <><FormatToolbar /><BlockEditor boxId="b1" range={null} label="Main text" acceptCaret onReady={e => (ed = e)} {...p} /></>
);
const setup = (body = SAMPLE_BODY, p: Partial<BlockEditorProps> = {}) => { openDocument(rec('A', body)); return render(ui(p)); };
// Typing: one character at a time, the way ProseMirror reads a keystroke (the input rules first, else the text).
// (insertContent's applyInputRules would run every extension's rules on a timer, against a stale position.)
function type(s: string) {
  for (const ch of s) act(() => {
    const { view } = ed, { from, to } = view.state.selection, plain = () => view.state.tr.insertText(ch, from, to);
    if (!view.someProp('handleTextInput', f => f(view, from, to, ch, plain))) view.dispatch(plain());
  });
}
// Select markup offsets [from, to) and focus the editor.
const select = (from: number, to = from) => act(() => {
  ed.commands.setTextSelection({ from: posAt(ed.state.doc, text(), from), to: posAt(ed.state.doc, text(), to) });
  ed.view.focus();
});

beforeEach(async () => { await flushSave(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

test('shows the block as rich text', () => {
  setup();
  expect(screen.getByRole('heading', { level: 1, name: 'The Water Cycle' })).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(4);
  expect(document.querySelector('mark')!.textContent).toBe('rain, snow or hail');
  const box = screen.getByRole('textbox', { name: 'Main text' });
  expect(box).toHaveAttribute('aria-multiline', 'true');
});

test('typing writes markup into the block, one undo step per burst', () => {
  setup();
  vi.useFakeTimers();
  act(() => { ed.commands.insertContentAt(16, '!'); });
  act(() => { ed.commands.insertContentAt(17, '!'); });
  expect(text()).toMatch(/^# The Water Cycle!!\n/);
  act(() => undo());
  expect(text()).toBe(SAMPLE_BODY);
  expect(get().canUndo).toBe(false);
});

test('Ctrl+Z in the editor undoes through the app history and puts the caret at the change', () => {
  setup();
  act(() => { ed.commands.insertContentAt(16, '!'); ed.commands.focus(); });
  fireEvent.keyDown(ed.view.dom, { key: 'z', ctrlKey: true });
  expect(text()).toBe(SAMPLE_BODY);
  expect(ed.getText()).not.toContain('!');
  expect(offsetAt(ed.state.doc, text(), ed.state.selection.from)).toBe(17);
  fireEvent.keyDown(ed.view.dom, { key: 'Z', ctrlKey: true, shiftKey: true });
  expect(text()).toMatch(/^# The Water Cycle!/);
  expect(ed.getText()).toContain('Cycle!');
  fireEvent.keyDown(ed.view.dom, { key: 'z', ctrlKey: true });
  fireEvent.keyDown(ed.view.dom, { key: 'y', ctrlKey: true });
  expect(text()).toMatch(/^# The Water Cycle!/);
});

test('a paste and each formatting change are undo steps of their own, between bursts of typing', async () => {
  setup('');
  type('one');
  act(() => { ed.view.pasteText(' two'); });
  type(' three');
  select(0, 3);
  await userEvent.click(screen.getByRole('button', { name: 'Bold' }));
  fireEvent.keyDown(ed.view.dom, { key: 'u', ctrlKey: true });
  await userEvent.click(screen.getByRole('button', { name: 'Numbered list' }));
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Text style' }), 'Heading');
  const steps = [text()];
  while (get().canUndo) { act(() => undo()); steps.push(text()); }
  expect(steps).toEqual(['## **_one_** two three', '1. **_one_** two three', '**_one_** two three', '**one** two three', 'one two three', 'one two', 'one', '']);
});

test('undo from the browser menu goes through the app history too', () => {
  setup();
  act(() => { ed.commands.insertContentAt(16, '!'); });
  act(() => { ed.view.dom.dispatchEvent(new InputEvent('beforeinput', { inputType: 'historyUndo', bubbles: true, cancelable: true })); });
  expect(text()).toBe(SAMPLE_BODY);
});

test.each([['# T', '# T'], ['## H', '## H'], ['- a', '- a'], ['1. a', '1. a'], ['> q', '> q'], ['**b** ', '**b** '], ['*u* ', '*u* ']])('typing %j in an empty block gives %j', (typed, line) => {
  setup('');
  type(typed);
  expect(text()).toBe(line);
}); // a literal paragraph would be written \# T, \- a…

test('Bold, page break and text style write markup', async () => {
  setup();
  const w = SAMPLE_BODY.indexOf('water cycle');
  select(w, w + 'water cycle'.length);
  fireEvent.keyDown(ed.view.dom, { key: 'b', ctrlKey: true });
  expect(text()).toContain('The **water cycle** is');
  expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
  select(text().indexOf('## Why'));
  expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(screen.getByRole('button', { name: 'Page break' }));
  expect(text()).toContain('\n\\newpage\n## Why it matters');
  select(text().indexOf('The **water'));
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Text style' }), 'Heading');
  expect(text().split('\n')[3]).toMatch(/^## The \*\*water cycle\*\* is/);
});

test('the toolbar is disabled until an editor has focus', () => {
  render(<FormatToolbar />);
  expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Text style' })).toBeDisabled();
});

test('the toolbar is off for an editor in a view that isn’t shown (hidden and inert)', () => {
  openDocument(rec('A', 'x'));
  render(<><div inert><BlockEditor boxId="b1" range={null} label="Hidden" onReady={e => (ed = e)} /></div><FormatToolbar /></>);
  act(() => setActiveEditor(ed, 'b1'));
  expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Text style' })).toBeDisabled();
});

test('shortcut hints say Ctrl+ or ⌘ for the platform', () => {
  const { unmount } = render(<FormatToolbar />);
  expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('title', 'Bold (Ctrl+B)');
  expect(screen.getByRole('button', { name: 'Page break' })).toHaveAttribute('title', 'Page break (Ctrl+Enter)');
  unmount();
  const mac = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
  render(<FormatToolbar />);
  expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('title', 'Bold (⌘B)');
  expect(screen.getByRole('button', { name: 'Underline' })).toHaveAttribute('title', 'Underline (⌘U)');
  expect(screen.getByRole('button', { name: 'Page break' })).toHaveAttribute('title', 'Page break (⌘Enter)');
  mac.mockRestore();
});

test('Ctrl+Enter splits the line at the caret around a page break', () => {
  setup('one two');
  select(4);
  fireEvent.keyDown(ed.view.dom, { key: 'Enter', ctrlKey: true });
  expect(text()).toBe('one \n\\newpage\ntwo');
  act(() => { ed.commands.insertContent('x'); });
  expect(text()).toBe('one \n\\newpage\nxtwo');
});

test('the / menu inserts a numbered list', async () => {
  setup('');
  await act(async () => { ed.commands.insertContent('/'); });
  const lb = await screen.findByRole('listbox', { name: 'Insert' });
  expect(within(lb).getAllByRole('option').map(o => o.textContent)).toEqual(['Normal text', 'Title', 'Heading', 'Note', 'Bulleted list', 'Numbered list', 'Page break']);
  const box = screen.getByRole('textbox', { name: 'Main text' });
  expect(box).toHaveAttribute('aria-haspopup', 'listbox');
  expect(box).toHaveAttribute('aria-expanded', 'true');
  expect(box).toHaveAttribute('aria-controls', lb.id);
  for (let i = 0; i < 5; i++) fireEvent.keyDown(ed.view.dom, { key: 'ArrowDown' });
  const opt = within(lb).getByRole('option', { selected: true });
  expect(opt).toHaveTextContent('Numbered list');
  expect(box).toHaveAttribute('aria-activedescendant', opt.id);
  fireEvent.keyDown(ed.view.dom, { key: 'Enter' });
  expect(text()).toBe('1. ');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  for (const a of ['aria-haspopup', 'aria-expanded', 'aria-controls', 'aria-activedescendant']) expect(box).not.toHaveAttribute(a);
});

test('Escape closes the / menu', async () => {
  setup('');
  await act(async () => { ed.commands.insertContent('/'); });
  await screen.findByRole('listbox', { name: 'Insert' });
  fireEvent.keyDown(ed.view.dom, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(text()).toBe('/');
});

test('paste from Google Docs keeps its formatting and nothing more', () => {
  setup('');
  act(() => { ed.view.pasteHTML('<b style="font-weight:normal" id="docs-internal-guid-1"><h1><span>Title</span></h1><p><span style="font-weight:700">Bold</span> <span style="text-decoration:underline">under</span> <span style="text-decoration:line-through">gone</span> <span style="background-color:#ffff00">hi</span> <span style="background-color:transparent">plain</span></p><ul><li><p>one</p><ul><li><p>two</p></li></ul></li></ul></b>'); });
  expect(text()).toBe('# Title\n**Bold** *under* ~~gone~~ ==hi== plain\n- one\n  - two');
});

test('paste from Word keeps its lists', () => {
  setup('');
  act(() => { ed.view.pasteHTML('<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·</span><b>first</b></p><p class="MsoListParagraph" style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">1.</span>second</p>'); });
  expect(text()).toBe('- **first**\n  1. second');
});

test('pasted near-white backgrounds and normal-weight wrappers add no formatting', () => {
  setup('');
  act(() => { ed.view.pasteHTML('<strong style="font-weight:normal"><p><span style="background-color:rgb(248, 249, 250)">a</span> <span style="background:whitesmoke">b</span> <span style="background-color:#f3f3f3">c</span> <span style="background-color:#fff59d">d</span></p></strong>'); });
  expect(text()).toBe('a b c ==d==');
});

test('pasted text lands as the converter writes it, so positions stay exact', () => {
  setup('- item');
  select(text().length);
  act(() => { ed.view.pasteText('\tx'); });
  expect(text()).toBe('- item    x');
  expect(ed.state.doc.textContent).toBe('item    x');
  expect(offsetAt(ed.state.doc, text(), ed.state.selection.head)).toBe(11); // after the x
  // spaces the markup drops after a list marker
  act(() => update(s => { s.doc.boxes[0].text = '- a'; }));
  select(2);
  act(() => { ed.view.pasteText('  x'); });
  expect(text()).toBe('- xa');
  expect(offsetAt(ed.state.doc, text(), ed.state.selection.head)).toBe(3); // between x and a
});

test('spaces typed at the start of a heading or list item go, as markup has none there', () => {
  setup('# Title\n- item');
  select(2);
  type(' ');
  expect([text(), ed.state.doc.firstChild!.textContent]).toEqual(['# Title\n- item', 'Title']);
  select(text().indexOf('item'));
  type('  x');
  expect([text(), ed.state.doc.lastChild!.textContent]).toEqual(['# Title\n- xitem', 'xitem']);
  expect(offsetAt(ed.state.doc, text(), ed.state.selection.head)).toBe(text().indexOf('item'));
  select(4);
  type(' ');
  expect(text()).toBe('# Ti tle\n- xitem'); // anywhere else a space stays
});

test('page-break lines outlive a pasted change', () => {
  setup('- item\nnext', { breaks: [{ offset: 7, page: 2, idx: 1, actions: false }] });
  select(6);
  act(() => { ed.view.pasteText('\tx'); });
  expect(text()).toBe('- item    x\nnext');
  expect(screen.getByText('Page 2 starts here')).toBeInTheDocument();
});

test('Tab indents a list item; Shift-Enter starts a new line; no empty line is added at the end', () => {
  setup('- a\n- b');
  select(text().length);
  fireEvent.keyDown(ed.view.dom, { key: 'Tab' });
  expect(text()).toBe('- a\n  - b');
  fireEvent.keyDown(ed.view.dom, { key: 'Tab', shiftKey: true });
  expect(text()).toBe('- a\n- b');
  act(() => { ed.commands.insertContent('c'); });
  expect(text()).toBe('- a\n- bc');
  act(() => update(s => { s.doc.boxes[0].text = 'x'; }));
  select(1);
  fireEvent.keyDown(ed.view.dom, { key: 'Enter', shiftKey: true });
  expect(text()).toBe('x\n');
});

test('page-break lines carry their actions', async () => {
  const onSplit = vi.fn(), onRemovePart = vi.fn();
  const { rerender } = setup();
  rerender(ui({ breaks: [{ offset: SAMPLE_BODY.indexOf('## Why'), page: 2, idx: 1, actions: true }], onSplit, onRemovePart }));
  expect(screen.getByText('Page 2 starts here')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Split here' }));
  expect(onSplit).toHaveBeenCalledWith(1);
  await userEvent.click(screen.getByRole('button', { name: 'Remove page 2 part' }));
  expect(onRemovePart).toHaveBeenCalledWith(1);
});

test('a break inside a paragraph is an inline line that moves with the text, and has no actions when asked', () => {
  const { rerender } = setup();
  const at = SAMPLE_BODY.indexOf('It also helps');
  rerender(ui({ breaks: [{ offset: at, page: 3, idx: 2, actions: false }] }));
  const chip = screen.getByText('Page 3 starts here').parentElement!;
  expect(chip.tagName).toBe('SPAN');
  expect(screen.queryByRole('button', { name: 'Split here' })).not.toBeInTheDocument();
  act(() => { ed.commands.insertContentAt(posAt(ed.state.doc, text(), at - 1), '!!'); });
  expect(chip.nextSibling?.textContent).toMatch(/^It also helps/);
});

test('a caret request focuses the editor at that word', () => {
  setup();
  const o = srcOffset(SAMPLE_BODY, { li: 3, tok: 2 });
  act(() => placeCaret('b1', o));
  expect(ed.isFocused).toBe(true);
  expect(offsetAt(ed.state.doc, text(), ed.state.selection.from)).toBe(o);
  expect(get().caret).toBeNull();
  expect(get().selectedId).toBe('b1');
});

test('an outside change reloads an editor that does not have focus', () => {
  setup();
  act(() => update(s => { s.doc.boxes[0].text = '# New'; }, { history: 'x' }));
  expect(screen.getByRole('heading', { level: 1, name: 'New' })).toBeInTheDocument();
});

test('a reload without focus keeps the selection on the same text', () => {
  const { rerender } = setup('a\nb\nc\nd', { range: { first: 1, end: 3 } });
  act(() => { ed.commands.setTextSelection({ from: 4, to: 5 }); }); // "c"
  rerender(ui({ range: { first: 0, end: 4 } }));
  const { from, to } = ed.state.selection;
  expect(ed.state.doc.textBetween(from, to)).toBe('c');
});

test('a part edits only its own lines and reports how many it has', () => {
  const onLineCount = vi.fn();
  const { rerender } = setup('a\nb\nc\nd', { range: { first: 1, end: 3 }, onLineCount });
  expect(ed.getText({ blockSeparator: '|' })).toBe('b|c');
  act(() => { ed.commands.setTextSelection(2); ed.view.focus(); }); // the end of "b"
  fireEvent.keyDown(ed.view.dom, { key: 'Enter' });
  expect(text()).toBe('a\nb\n\nc\nd');
  expect(onLineCount).toHaveBeenLastCalledWith(3);
  // the parent still passes { first: 1, end: 3 }: the editor keeps the lines it has
  expect(ed.getText({ blockSeparator: '|' })).toBe('b||c');
  const caret = ed.state.selection.head;
  rerender(ui({ range: { first: 1, end: 4 }, onLineCount })); // the parent catches up: nothing moves
  expect(ed.getText({ blockSeparator: '|' })).toBe('b||c');
  expect(ed.state.selection.head).toBe(caret);
  act(() => placeCaret('b1', 0)); // line 0 is not this part's
  expect(get().caret).not.toBeNull();
  rerender(ui({ range: { first: 3, end: 5 }, onLineCount })); // a new range is shown
  expect(ed.getText({ blockSeparator: '|' })).toBe('c|d');
});

test('a deleted block is never written back', () => {
  setup();
  act(() => update(s => { s.doc.boxes = []; }));
  act(() => { ed.commands.insertContentAt(1, 'x'); });
  expect(get().doc.boxes).toHaveLength(0);
});

/* ---------- Numbered lists that run on past a part ---------- */

const numbered = (items: string[], indent: number[] = []) => items.map((t, i) => '  '.repeat(indent[i] ?? 0) + t).join('\n');
const count = (names: string[], from = 1) => names.map((t, i) => `${from + i}. ${t}`);
const item = (n: number) => 'item' + n;
const upTo = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test('a numbered list that runs on past the part keeps counting when an item is deleted or added', () => {
  setup(count(upTo(1, 40).map(item)).join('\n'), { range: { first: 0, end: 26 } });
  const end = (li: number) => text().split('\n').slice(0, li + 1).join('\n').length;
  act(() => { ed.commands.deleteRange({ from: posAt(ed.state.doc, text(), end(0)), to: posAt(ed.state.doc, text(), end(1)) }); }); // item2 goes
  expect(text()).toBe(count([1, ...upTo(3, 40)].map(item)).join('\n'));
  select(end(0));
  fireEvent.keyDown(ed.view.dom, { key: 'Enter' });
  act(() => { ed.commands.insertContent('new'); });
  expect(text()).toBe(count([item(1), 'new', ...upTo(3, 40).map(item)]).join('\n'));
});

test('a list that runs on keeps counting at each indent', () => {
  setup(numbered(['1. a', '2. b', '1. x', '2. y', '3. c', '4. d'], [0, 0, 1, 1, 0, 0]), { range: { first: 0, end: 2 } });
  act(() => { ed.commands.deleteRange({ from: posAt(ed.state.doc, text(), 3), to: posAt(ed.state.doc, text(), 8) }); }); // a goes
  expect(text()).toBe(numbered(['1. b', '1. x', '2. y', '2. c', '3. d'], [0, 1, 1, 0, 0]));
});

test('a list after the part that starts its own count keeps it', () => {
  setup('1. a\n2. b\n1. c\n2. d', { range: { first: 0, end: 2 } });
  select(text().indexOf('\n1. c'));
  act(() => { ed.commands.insertContent('x'); });
  expect(text()).toBe('1. a\n2. bx\n1. c\n2. d');
  select(text().indexOf('a') + 1);
  fireEvent.keyDown(ed.view.dom, { key: 'Enter' });
  expect(text()).toBe('1. a\n2. \n3. bx\n1. c\n2. d');
});
