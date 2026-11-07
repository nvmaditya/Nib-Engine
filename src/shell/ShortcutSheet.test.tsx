import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { BlockEditor } from '@/features/editor/BlockEditor';
import { flushSave, openDocument } from '@/store/editor';
import { get, rec } from '@/test/docs';
import { Overlays } from './Overlays';
import { closeOverlay, focusBack, useOverlays } from './overlays';
import { SHORTCUTS } from './shortcuts';

vi.mock('@/store/documents', async orig => ({ ...(await orig<typeof import('@/store/documents')>()), putDoc: vi.fn(async () => {}) }));

beforeEach(async () => { await flushSave(); useOverlays.setState({ open: null }); });
afterEach(() => { delete (navigator as unknown as Record<string, unknown>).platform; });

const onApple = () => Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
const sheet = () => screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
const texts = (els: Element[]) => els.map(el => el.textContent);
const rowOf = (what: string) => within(sheet()).getAllByRole('term').find(dt => dt.textContent === what)!.nextElementSibling!;

// The plan's Shortcuts table, column by column.
const GROUPS = ['Anywhere', 'In a document', 'A block on a handwritten page', 'In the text', 'As you type'];
const WHAT = [
  'Search commands and documents', 'Keyboard shortcuts', 'Close a dialog or menu',
  'Undo', 'Redo', 'Leave the selected block',
  'Move it a ruled line up or down', 'Move it a little left or right', 'Write in it In Write', 'Delete it, or only this page’s part In Write', 'Cancel moving it',
  'Bold', 'Underline', 'Cross out', 'Highlight', 'Normal', 'Title', 'Heading', 'Note', 'Bulleted list', 'Numbered list',
  'Indent a list item, or take it back out', 'Page break', 'Text styles, lists and a page break',
  'Title', 'Heading', 'Bulleted list', 'Numbered list', 'Note', 'Bold', 'Underline', 'Cross out', 'Highlight',
];
const KEYS = [
  'Ctrl+K', '? or Ctrl+/', 'Esc',
  'Ctrl+Z', 'Ctrl+Shift+Z or Ctrl+Y', 'Esc',
  '↑ or ↓', '← or →', 'Enter', 'Delete or Backspace', 'Esc',
  'Ctrl+B', 'Ctrl+U', 'Ctrl+Shift+S', 'Ctrl+Shift+H', 'Ctrl+Alt+0', 'Ctrl+Alt+1', 'Ctrl+Alt+2', 'Ctrl+Shift+B', 'Ctrl+Shift+8', 'Ctrl+Shift+7',
  'Tab or Shift+Tab', 'Ctrl+Enter', '/',
  '# ', '## ', '- ', '1. ', '> ', '**words**', '*words*', '~~words~~', '==words==',
];

test('the sheet lists every shortcut, by where it works', () => {
  useOverlays.setState({ open: 'shortcuts' });
  render(<Overlays />);
  const d = sheet();
  expect(d).toHaveAttribute('data-overlay', 'shortcuts');
  expect(d).toHaveAccessibleDescription('Every keyboard shortcut in Nib, by where it works.');
  expect(texts(within(d).getAllByRole('heading', { level: 3 }))).toEqual(GROUPS);
  expect(texts(within(d).getAllByRole('term'))).toEqual(WHAT);
  expect(texts(within(d).getAllByRole('definition'))).toEqual(KEYS);
  expect(texts([...rowOf('Keyboard shortcuts').querySelectorAll('kbd')])).toEqual(['?', 'Ctrl+/']);
  expect(within(d).getByText('Tab to a block, or click it.')).toHaveClass('text-muted');
  expect(within(d).getByText('At the start of a line, then a space; marks around words.')).toHaveClass('text-muted');
  expect(within(d).getAllByText('In Write')).toHaveLength(2);
  for (const el of within(d).getAllByText('In Write')) expect(el).toHaveClass('text-muted');
  expect(within(d).getByRole('button', { name: 'Close' })).toBeInTheDocument();
});

test('Ctrl+Y is listed only off Apple', () => {
  useOverlays.setState({ open: 'shortcuts' });
  const { unmount } = render(<Overlays />);
  expect(texts([...rowOf('Redo').querySelectorAll('kbd')])).toEqual(['Ctrl+Shift+Z', 'Ctrl+Y']);
  unmount();
  onApple();
  render(<Overlays />);
  expect(rowOf('Redo').textContent).toBe('⇧⌘Z');
  expect(texts(['Search commands and documents', 'Keyboard shortcuts', 'Bold', 'Normal', 'Bulleted list', 'Page break'].map(rowOf)))
    .toEqual(['⌘K', '? or ⌘/', '⌘B', '⌥⌘0', '⇧⌘8', '⌘Enter']);
});

/* ---------- The keys do what the sheet says ---------- */

let ed: Editor;
const text = () => get().doc.boxes[0].text;
const setup = (body: string) => {
  openDocument(rec('A', body));
  return render(<><Overlays /><BlockEditor boxId="b1" range={null} label="Main text" acceptCaret onReady={e => (ed = e)} /></>);
};

// A chord from the sheet as a US keyboard sends it (Shift+8 is `*`).
const SHIFTED: Record<string, string> = { 7: '&', 8: '*' };
const KEY_CODES: Record<string, number> = { Enter: 13, Tab: 9 };
function eventFor(chord: string[]): KeyboardEventInit {
  const key = chord[chord.length - 1], mods = chord.slice(0, -1), shiftKey = mods.includes('Shift');
  const letter = /^[A-Z]$/.test(key);
  return {
    key: letter ? (shiftKey ? key : key.toLowerCase()) : (shiftKey && SHIFTED[key]) || key,
    keyCode: KEY_CODES[key] ?? key.charCodeAt(0),
    ctrlKey: mods.includes('Mod') || mods.includes('Ctrl'), shiftKey, altKey: mods.includes('Alt'),
  };
}
const inTheText = SHORTCUTS.find(g => g.title === 'In the text')!.rows;

test.each([
  ['Bold', 'x', 0, '**x**'],
  ['Underline', 'x', 0, '*x*'],
  ['Cross out', 'x', 0, '~~x~~'],
  ['Highlight', 'x', 0, '==x=='],
  ['Title', 'x', 0, '# x'],
  ['Heading', 'x', 0, '## x'],
  ['Normal', '# x', 0, 'x'],
  ['Note', 'x', 0, '> x'],
  ['Bulleted list', 'x', 0, '- x'],
  ['Numbered list', 'x', 0, '1. x'],
  ['Indent a list item, or take it back out', '- x', 0, '  - x'],
  ['Indent a list item, or take it back out', '  - x', 1, '- x'],
  ['Page break', 'x', 0, '\\newpage\nx'],
])('each text shortcut in the sheet does what it says: %s on %j', (what, body, alt, after) => {
  setup(body);
  const chord = inTheText.find(r => r.what === what)!.keys![alt];
  act(() => {
    if (what === 'Page break') ed.commands.setTextSelection(1); // the caret at the start
    else ed.commands.selectAll();
    ed.view.focus();
  });
  fireEvent.keyDown(ed.view.dom, eventFor(chord));
  expect(text()).toBe(after);
});

// Typing: one character at a time, the way ProseMirror reads a keystroke (the input rules first, else the text).
function type(s: string) {
  for (const ch of s) act(() => {
    const { view } = ed, { from, to } = view.state.selection, plain = () => view.state.tr.insertText(ch, from, to);
    if (!view.someProp('handleTextInput', f => f(view, from, to, ch, plain))) view.dispatch(plain());
  });
}

test.each(SHORTCUTS.find(g => g.title === 'As you type')!.rows.map(r => [r.what, r.typed!]))('as you type, %s: %j', (_what, typed) => {
  setup('');
  const line = typed.endsWith(' ') ? typed + 'x' : typed; // a line's marker, then its text; or marks around words
  type(line);
  expect(text()).toBe(line);
});

test('closing the sheet gives the focus back', async () => {
  setup('x');
  act(() => { ed.commands.setTextSelection(2); ed.view.focus(); }); // (TipTap's focus command focuses again later, on a timer)
  fireEvent.keyDown(ed.view.dom, { key: '?', shiftKey: true }); // typed, not a shortcut, in the editor
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.keyDown(ed.view.dom, { key: '/', ctrlKey: true });
  expect(sheet()).toContainElement(document.activeElement as HTMLElement);
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(document.activeElement?.closest('.ProseMirror')).toBe(ed.view.dom));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(useOverlays.getState().open).toBe(null);
});

// A stand-in for the palette, an overlay as the sheet is.
function Palette() {
  const open = useOverlays(s => s.open) === 'palette';
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) closeOverlay(); }}>
      <DialogContent data-overlay="palette" onCloseAutoFocus={focusBack}>
        <DialogTitle>Search commands and documents</DialogTitle><DialogDescription>x</DialogDescription><input aria-label="Search" />
      </DialogContent>
    </Dialog>
  );
}

test('swapped for the palette, the sheet leaves the focus to it, and it comes back to the editor after both', async () => {
  setup('x');
  render(<Palette />);
  act(() => { ed.commands.setTextSelection(2); ed.view.focus(); });
  fireEvent.keyDown(ed.view.dom, { key: '/', ctrlKey: true });
  fireEvent.keyDown(document.activeElement!, { key: 'k', ctrlKey: true });
  expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();
  const search = screen.getByRole('textbox', { name: 'Search' });
  await act(async () => { await new Promise(r => setTimeout(r, 20)); }); // the sheet's closing focus has run
  expect(document.activeElement).toBe(search);
  fireEvent.keyDown(search, { key: 'Escape' });
  await waitFor(() => expect(document.activeElement).toBe(ed.view.dom));
});
