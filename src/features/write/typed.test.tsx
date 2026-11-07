// A typed page's frozen lines while the focus is away for a moment (the Formatting toolbar, another window),
// and lines joined across a page boundary.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { cleanSettings } from '@/engine/doc.js';
import type { EngineDoc } from '@/engine/types';
import { App } from '@/app/App';
import { createDoc } from '@/store/documents';
import { flushSave, undo } from '@/store/editor';
import { box, docOf, fontsLoad, get, lines } from '@/test/docs';

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

async function openWrite(doc: EngineDoc): Promise<void> {
  const S = cleanSettings(null, false);
  const id = (await createDoc({ title: 'T', settings: S, doc })).id;
  location.hash = `#/d/${id}/write`;
  render(<App />);
  await screen.findByText('Page 1');
}
const textbox = (name: string) => screen.getByRole('textbox', { name });
const editorFor = (name: string) => (textbox(name) as HTMLElement & { editor: Editor }).editor;
const textOf = (name: string) => editorFor(name).getText({ blockSeparator: '\n' });
const m = (text: string) => box({ id: 'm', name: 'Main text', text });
const stored = () => get().doc.boxes[0].text.split('\n');
const settle = () => act(() => vi.advanceTimersByTimeAsync(200));
const styleSelect = () => screen.getAllByRole('combobox', { name: 'Text style' })[0];
const tool = (name: string) => screen.getAllByRole('button', { name })[0];

/** 40 lines (line1–28 on page 1); a new line "Conclusion" typed after line28 goes on to page 2 once laid out. */
async function typePastTheBottom(): Promise<Editor> {
  await openWrite(docOf(m(lines(40))));
  vi.useFakeTimers();
  const p1 = editorFor('Main text, page 1');
  act(() => { p1.view.focus(); p1.commands.setTextSelection(p1.state.doc.content.size - 1); }); // the end of line28
  act(() => { p1.commands.splitBlock(); p1.commands.insertContent('Conclusion'); });
  await settle();
  expect(textOf('Main text, page 1').split('\n').slice(-2)).toEqual(['line28', 'Conclusion']); // frozen
  return p1;
}
// The focus moves from the editor to `el`, as a click or Tab would.
const focusOn = (el: HTMLElement) => act(() => { el.focus(); });

/* ---------- The Formatting toolbar ---------- */

test('a Text style picked in the toolbar formats the line typed past the bottom of the page', async () => {
  await typePastTheBottom();
  focusOn(styleSelect());
  await settle();
  expect(textOf('Main text, page 1').split('\n').slice(-2)).toEqual(['line28', 'Conclusion']); // still frozen
  fireEvent.change(styleSelect(), { target: { value: 'h2' } });
  await settle(); // the editor takes the focus back
  expect(stored().slice(27, 30)).toEqual(['line28', '## Conclusion', 'line29']);
  expect(document.activeElement).toBe(textbox('Main text, page 1'));
});

test('a toolbar button reached from the keyboard formats the same words', async () => {
  const p1 = await typePastTheBottom();
  act(() => { p1.commands.setTextSelection({ from: p1.state.selection.from - 'Conclusion'.length, to: p1.state.selection.from }); });
  focusOn(tool('Bold'));
  await settle();
  fireEvent.click(tool('Bold'));
  await settle();
  expect(stored().slice(27, 29)).toEqual(['line28', '**Conclusion**']);
});

test('the freeze ends when the focus goes on from the toolbar to anything else', async () => {
  await typePastTheBottom();
  focusOn(styleSelect());
  await settle();
  focusOn(screen.getByRole('heading', { name: 'Page 2' }));
  await settle();
  expect(textOf('Main text, page 1').split('\n').at(-1)).toBe('line28');
  expect(textOf('Main text, page 2').split('\n')[0]).toBe('Conclusion');
});

test('the freeze ends when the focus goes on from the toolbar to another block’s editor', async () => {
  await openWrite(docOf(m(lines(40)), box({ id: 'n', name: 'Note', kind: 'note', text: 'side', x: 10, w: 90 })));
  vi.useFakeTimers();
  const p1 = editorFor('Main text, page 1');
  act(() => { p1.view.focus(); p1.commands.setTextSelection(p1.state.doc.content.size - 1); });
  act(() => { p1.commands.splitBlock(); p1.commands.insertContent('Conclusion'); });
  await settle();
  focusOn(tool('Bold'));
  act(() => { editorFor('Note, page 1').view.focus(); });
  await settle();
  expect(textOf('Main text, page 2').split('\n')[0]).toBe('Conclusion');
});

test('the freeze ends when the focus goes from the toolbar to the page itself', async () => {
  await typePastTheBottom();
  focusOn(styleSelect());
  act(() => { styleSelect().blur(); });
  await settle();
  expect(textOf('Main text, page 2').split('\n')[0]).toBe('Conclusion');
});

test('after the toolbar has done its work, leaving the editor ends the freeze', async () => {
  const p1 = await typePastTheBottom();
  focusOn(styleSelect());
  fireEvent.change(styleSelect(), { target: { value: 'h2' } });
  await settle();
  expect(document.activeElement).toBe(textbox('Main text, page 1'));
  act(() => { (p1.view.dom as HTMLElement).blur(); });
  await settle();
  expect(textOf('Main text, page 2').split('\n')[0]).toBe('Conclusion');
});

test('Ctrl+Z while the focus is on a toolbar button ends the freeze', async () => {
  await typePastTheBottom();
  focusOn(tool('Bold'));
  act(() => undo());
  await settle();
  expect(stored()).toEqual(lines(40).split('\n'));
  expect([textOf('Main text, page 1'), textOf('Main text, page 2')]).toEqual([lines(28), lines(40).split('\n').slice(28).join('\n')]);
});

/* ---------- Another window ---------- */

test('the window losing the focus keeps the lines; typing on return goes on where the caret was', async () => {
  const p1 = await typePastTheBottom();
  const away = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  act(() => { (p1.view.dom as HTMLElement).blur(); });
  await settle();
  away.mockRestore();
  expect(textOf('Main text, page 1').split('\n').slice(-2)).toEqual(['line28', 'Conclusion']);
  act(() => { p1.view.focus(); });
  act(() => { p1.commands.insertContent(' is here'); });
  await settle();
  expect(stored().slice(27, 30)).toEqual(['line28', 'Conclusion is here', 'line29']);
});

test('coming back to the window and going somewhere else ends the freeze', async () => {
  const p1 = await typePastTheBottom();
  const away = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  act(() => { (p1.view.dom as HTMLElement).blur(); });
  away.mockRestore();
  focusOn(screen.getByRole('heading', { name: 'Page 1' }));
  await settle();
  expect(textOf('Main text, page 2').split('\n')[0]).toBe('Conclusion');
});

/* ---------- A numbered list over two pages ---------- */

test('deleting an item on page 1 renumbers the list where it goes on, on page 2', async () => {
  await openWrite(docOf(m(Array.from({ length: 40 }, (_, i) => `${i + 1}. item${i + 1}`).join('\n'))));
  vi.useFakeTimers();
  const p1 = editorFor('Main text, page 1');
  act(() => { p1.view.focus(); });
  const { doc } = p1.state, endOf = (i: number) => { let at = 0; doc.descendants((n, pos) => { if (n.type.name === 'paragraph' && i-- === 0) at = pos + n.nodeSize - 1; return at === 0; }); return at; };
  act(() => { p1.commands.deleteRange({ from: endOf(0), to: endOf(1) }); }); // item2 goes
  act(() => { (p1.view.dom as HTMLElement).blur(); });
  await settle();
  const markers = (name: string) => [...textbox(name).querySelectorAll('li')].map(li => li.getAttribute('data-marker') + ' ' + li.textContent);
  expect(markers('Main text, page 1').at(-1)).toBe('28. item29');
  expect(markers('Main text, page 2').slice(0, 2)).toEqual(['29. item30', '30. item31']);
  expect(stored().at(-1)).toBe('39. item40');
});
