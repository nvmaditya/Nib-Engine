import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/core';
import { useRef, type RefObject } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BlockEditor } from '@/features/editor/BlockEditor';
import { FormatToolbar } from '@/features/editor/FormatToolbar';
import { fromMarkup } from '@/features/editor/markup';
import { flushSave, update } from '@/store/editor';
import { box, docOf, get, open } from '@/test/docs';
import { ImportPreview, type PreviewHandle } from './ImportPreview';
import { importText } from './preview';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }), Toaster: () => null }));
vi.mock('@/store/documents', async orig => ({ ...(await orig<typeof import('@/store/documents')>()), putDoc: vi.fn(async () => {}) }));

// jsdom has no ClipboardEvent; ProseMirror makes one for view.pasteHTML.
if (typeof globalThis.ClipboardEvent === 'undefined') {
  globalThis.ClipboardEvent = class extends Event { clipboardData = null; } as unknown as typeof ClipboardEvent;
}

const ESSAY = ['# A Short Essay\n\n## Introduction\nWater moves between **rivers**, *seas* and ~~lakes~~ all the time.\n- Evaporation\n- Condensation\n1. First\n2. Second', '## Conclusion\nThat is the water cycle.'];
let handle: RefObject<PreviewHandle | null>;
function Harness({ breaks = false, parts = ESSAY }: { breaks?: boolean; parts?: string[] }) { handle = useRef<PreviewHandle>(null); return <ImportPreview parts={parts} breaks={breaks} ref={handle} />; }
const md = () => handle.current!.markup();
/** The separator between the file's two parts: the node right after the numbered list (part 1 has a blank line of its own, which isn't one). */
const sepAt = (ed: Editor) => { let at = -1, prev = ''; ed.state.doc.forEach((n, off) => { if (prev === 'orderedList') at = off; prev = n.type.name; }); return at; };
/** Where `word` starts in the editor's document. */
const posOfText = (ed: Editor, word: string) => { let at = -1; ed.state.doc.descendants((n, p) => { if (at < 0 && n.isText && n.text!.includes(word)) at = p + n.text!.indexOf(word); return at < 0; }); return at; };

const wideMatchMedia = window.matchMedia;
beforeEach(async () => { await flushSave(); });
afterEach(() => { cleanup(); window.matchMedia = wideMatchMedia; });

test('the preview shows what will come across: a title, headings, bold, underline, crossed-out words and lists', () => {
  render(<Harness />); const tb = screen.getByRole('textbox', { name: 'Imported text' });
  expect(within(tb).getByRole('heading', { level: 1 })).toHaveTextContent('A Short Essay');
  expect(within(tb).getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['Introduction', 'Conclusion']);
  expect([tb.querySelector('strong')?.textContent, tb.querySelector('u')?.textContent, tb.querySelector('s')?.textContent]).toEqual(['rivers', 'seas', 'lakes']);
  expect(within(tb).getAllByRole('listitem')).toHaveLength(4); expect(md()).toBe(importText(ESSAY, false));
  expect(screen.getByText('Check the text and change anything before it’s written out')).toBeInTheDocument(); expect(document.activeElement).toBe(document.body);
});
test('Start a new page where the file does swaps the separators and keeps what was typed', () => {
  const { rerender } = render(<Harness />); rerender(<Harness breaks />); expect(md()).toBe(importText(ESSAY, true));
  act(() => { handle.current!.editor.commands.insertContentAt(1, 'Draft: '); }); rerender(<Harness breaks={false} />);
  expect(md()).toBe(importText(ESSAY, false).replace('# A Short Essay', '# Draft: A Short Essay'));
});
test('…and a separator that was deleted gets its page break where it was', () => {
  const { rerender } = render(<Harness />); const ed = handle.current!.editor, at = sepAt(ed);
  act(() => { ed.commands.deleteRange({ from: at, to: at + 2 }); }); rerender(<Harness breaks />);
  expect(md()).toContain('2. Second\n\\newpage\n## Conclusion');
});
test('…and a line typed after the file’s page ends stays on that page', async () => {
  const user = userEvent.setup(), { rerender } = render(<Harness />); const ed = handle.current!.editor;
  act(() => { ed.commands.setTextSelection(posOfText(ed, 'Second') + 6); ed.view.focus(); }); // (focus() would wait a frame)
  await user.keyboard('{Enter}{Enter}More'); rerender(<Harness breaks />);
  expect(md()).toContain('2. Second\nMore\n\\newpage\n## Conclusion');
});
test('the page-break switch isn’t a step of the preview’s undo', async () => {
  const user = userEvent.setup(), { rerender } = render(<Harness />); await user.click(screen.getByRole('textbox', { name: 'Imported text' }));
  rerender(<Harness breaks />); await user.keyboard('{Control>}z{/Control}'); expect(md()).toBe(importText(ESSAY, true));
});
test('Ctrl+Z undoes typing in the preview, never the document', async () => {
  const user = userEvent.setup(); open(docOf(box({ id: 'm', text: 'mine' }))); render(<Harness />);
  await user.click(screen.getByRole('textbox', { name: 'Imported text' })); await user.keyboard('xyz'); expect(md()).toContain('xyz');
  await user.keyboard('{Control>}z{/Control}'); expect(md()).toBe(importText(ESSAY, false));
  expect([get().doc.boxes[0].text, get().canUndo]).toEqual(['mine', false]);
});
test('…and a document’s own last change stays where it is, not undone by it', async () => {
  const user = userEvent.setup(); open(docOf(box({ id: 'm', text: 'mine' }))); act(() => update(s => { s.doc.boxes[0].text = 'mine!'; })); render(<Harness />);
  await user.click(screen.getByRole('textbox', { name: 'Imported text' })); await user.keyboard('xyz{Control>}z{/Control}{Control>}z{/Control}');
  expect(md()).toBe(importText(ESSAY, false)); expect([get().doc.boxes[0].text, get().canUndo]).toEqual(['mine!', true]);
});
test('undo from the browser’s menu undoes the preview’s typing too', () => {
  open(docOf(box({ id: 'm', text: 'mine' }))); act(() => update(s => { s.doc.boxes[0].text = 'mine!'; })); render(<Harness />); const ed = handle.current!.editor;
  act(() => { ed.commands.insertContentAt(1, 'x'); });
  act(() => { ed.view.dom.dispatchEvent(new InputEvent('beforeinput', { inputType: 'historyUndo', bubbles: true, cancelable: true })); });
  expect(md()).toBe(importText(ESSAY, false)); expect([get().doc.boxes[0].text, get().canUndo]).toEqual(['mine!', true]);
});
test('Ctrl+Shift+Z and Ctrl+Y redo in the preview', async () => {
  const user = userEvent.setup(); render(<Harness />);
  await user.click(screen.getByRole('textbox', { name: 'Imported text' })); await user.keyboard('xyz{Control>}z{/Control}');
  await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}'); expect(md()).toContain('xyz');
  await user.keyboard('{Control>}z{/Control}{Control>}y{/Control}'); expect(md()).toContain('xyz');
});
test('pasting from Word or Google Docs keeps the formatting markup can say', () => {
  render(<Harness />); const ed = handle.current!.editor; act(() => { ed.commands.setTextSelection(ed.state.doc.content.size - 1); ed.view.pasteHTML('<b style="font-weight:normal"><p><b>bold</b> <u>under</u></p></b>'); });
  expect(md()).toContain('**bold**'); expect(md()).toContain('*under*');
});
test('the formatting tools act on the preview', async () => {
  const user = userEvent.setup(); render(<Harness />); const ed = handle.current!.editor;
  act(() => { const p = posOfText(ed, 'Second'); ed.chain().focus().setTextSelection({ from: p, to: p + 6 }).run(); });
  await user.click(within(screen.getByRole('toolbar', { name: 'Formatting' })).getByRole('button', { name: 'Bold' })); expect(md()).toContain('2. **Second**');
});
test('the preview’s tools format the preview alone, and Write’s tools the block being written in', async () => {
  const user = userEvent.setup(); open(docOf(box({ id: 'm', text: 'mine here' }))); let w!: Editor;
  render(<><FormatToolbar /><BlockEditor boxId="m" range={null} label="Main text" onReady={e => (w = e)} /><Harness /></>);
  const [writeTools, previewTools] = screen.getAllByRole('toolbar', { name: 'Formatting' }), ed = handle.current!.editor;
  act(() => { w.commands.setTextSelection({ from: 1, to: 5 }); w.view.focus(); }); // Write's block is the active editor
  act(() => { const p = posOfText(ed, 'Second'); ed.commands.setTextSelection({ from: p, to: p + 6 }); ed.view.focus(); });
  await user.click(within(previewTools).getByRole('button', { name: 'Bold' }));
  expect(md()).toContain('2. **Second**'); expect(get().doc.boxes[0].text).toBe('mine here');
  await user.click(within(writeTools).getByRole('button', { name: 'Underline' }));
  expect(get().doc.boxes[0].text).toBe('*mine* here'); expect(md()).toBe(importText(ESSAY, false).replace('2. Second', '2. **Second**'));
});
test('what’s pasted is held as the converter reads it back, so the preview is always its own markup', () => {
  render(<Harness />); const ed = handle.current!.editor;
  act(() => { ed.commands.setTextSelection(posOfText(ed, 'Evaporation') + 11); ed.view.pasteText('\tx'); });
  expect(md()).toContain('- Evaporation    x\n');
  expect(ed.state.doc.eq(ed.schema.nodeFromJSON(fromMarkup(md())))).toBe(true);
});
test('another file’s parts load in its place, and Ctrl+Z never brings the first one back', async () => {
  const user = userEvent.setup(), { rerender } = render(<Harness />);
  await user.click(screen.getByRole('textbox', { name: 'Imported text' })); await user.keyboard('xyz');
  const next = ['Second file', 'Its page two'];
  rerender(<Harness parts={next} />); expect(md()).toBe(importText(next, false));
  rerender(<Harness parts={next} />); await user.keyboard('{Control>}z{/Control}{Control>}z{/Control}'); expect(md()).toBe(importText(next, false));
});
test('crossing 860 px keeps what was typed: the layout changes by CSS alone', async () => {
  // A phone: no query matches. Anything that asked (useWide) would be told of the crossing through its listener.
  const asked: string[] = [], told: (() => void)[] = [];
  const mm = (wide: boolean) => (query: string) => {
    asked.push(query);
    return { matches: wide, media: query, onchange: null, addEventListener: (_: string, fn: () => void) => told.push(fn), removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false } as unknown as MediaQueryList;
  };
  window.matchMedia = mm(false);
  const user = userEvent.setup(); render(<Harness />); const ed = handle.current!.editor;
  await user.click(screen.getByRole('textbox', { name: 'Imported text' })); await user.keyboard('xyz');
  window.matchMedia = mm(true);
  act(() => { told.forEach(fn => fn()); window.dispatchEvent(new Event('resize')); });
  expect(handle.current!.editor).toBe(ed); expect(ed.isDestroyed).toBe(false); expect(md()).toContain('xyz');
  expect(asked).toEqual([]);
  const scroller = screen.getByRole('textbox', { name: 'Imported text' }).closest('.nib-editor')!;
  expect(scroller.className.split(' ')).toEqual(expect.arrayContaining(['min-h-[45dvh]', 'flex-1', 'wide:min-h-0', 'wide:overflow-y-auto']));
  expect(screen.getByRole('toolbar', { name: 'Formatting' }).className.split(' ')).toEqual(expect.arrayContaining(['sticky', 'top-0', 'flex-nowrap', 'overflow-x-auto', 'bg-surface']));
});
test('the textbox is spell-checked, and shows a placeholder when it’s emptied', async () => {
  render(<Harness />); const tb = screen.getByRole('textbox', { name: 'Imported text' });
  expect(tb).toHaveAttribute('aria-multiline', 'true'); expect(tb).toHaveAttribute('spellcheck', 'true'); expect(tb).toHaveClass('nib-prose');
  act(() => { handle.current!.editor.commands.clearContent(); });
  expect(tb.querySelector('[data-placeholder]')).toHaveAttribute('data-placeholder', 'Nothing to write out yet.');
});
