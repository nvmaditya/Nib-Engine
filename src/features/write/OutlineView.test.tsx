// Write's Outline view: the page list, the handwritten pages and the selected block's editor, side by
// side, or on phones the pages with the list and the editor in a sheet over them.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/core';
import { EditorView } from '@tiptap/pm/view';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import { App } from '@/app/App';
import type { Box, EngineDoc } from '@/engine/types';
import { deleteBlock, deletePageAt, removePart, select, splitAt } from '@/features/doc/actions';
import { offsetAt } from '@/features/editor/positions';
import { createDoc } from '@/store/documents';
import { flushSave, placeCaret, undo } from '@/store/editor';
import { box, docOf, fieldsOf, forgetHeader, get, lastToast, lines, words } from '@/test/docs';
import { OUTLINE_PEEK } from './OutlineView';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }), Toaster: () => null }));

// jsdom can't fetch the handwriting's font: hand the engine an empty file, which it can't read, so it
// measures with the canvas stub (8 px per character) and the pages lay out.
beforeAll(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(0)))); });
beforeEach(async () => { await flushSave(); vi.mocked(sonner).mockClear(); });
afterEach(() => { vi.restoreAllMocks(); });

const m = () => box({ id: 'm', name: 'Main text', text: lines(40) }); // pages 1–2
const n = (p: Partial<Box> = {}) => box({ id: 'n', name: 'Answers', page: 1, y: 900, color: 2, text: 'x', shuffle: 7, ...p }); // own style, page 2
const h = () => box({
  id: 'h', kind: 'header', name: 'Header', x: 446, y: 76, w: 320, color: 1,
  fields: fieldsOf({ name: 'Riya', class: '', date: '6 November 2026' }), text: 'Name: Riya\nClass:\nDate: 6 November 2026',
});

const ol = () => screen.getByRole('region', { name: 'Outline' });
const insp = () => screen.getByRole('region', { name: 'Selected block' });
/** The list item for part `idx` of a block on several pages. */
const itemFor = (name: string, idx: number) => within(ol()).getByRole('button', { name: new RegExp(`^${name}, part ${idx + 1} of \\d`) });
const item = (name: string) => within(ol()).getByRole('button', { name });
const section = (i: number) => ol().querySelector<HTMLElement>(`[data-drop-page="${i}"]`)!;
const editorOf = (el: HTMLElement) => (el as HTMLElement & { editor: Editor }).editor;

/** Open `doc` at #/d/{id}/outline and wait for its page list. */
async function outline(doc: EngineDoc): Promise<HTMLElement> {
  const id = (await createDoc({ title: 'Outline', doc })).id;
  location.hash = `#/d/${id}/outline`;
  render(<App />);
  await within(await screen.findByRole('region', { name: 'Outline' })).findByText('Page 1');
  return ol();
}

const mouse = { pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true };
/** A mouse drag from `el` that ends over `over` (the element the drop finds under the pointer). */
function dragTo(el: HTMLElement, over: Element | null, y = 60) {
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(over);
  fireEvent.pointerDown(el, { ...mouse, clientX: 10, clientY: 50 });
  fireEvent.pointerMove(document, { pointerId: 1, clientX: 10, clientY: y });
  fireEvent.pointerUp(document, { pointerId: 1, clientX: 10, clientY: y });
}

test('the page list shows each page’s blocks', async () => {
  const list = await outline(docOf(m(), n()));
  expect(within(list).getByText('Page 1')).toBeInTheDocument();
  expect(within(list).getByRole('heading', { name: 'Pages 2' })).toBeInTheDocument();
  expect(within(list).getAllByText('Main text')).toHaveLength(2);
  expect(within(list).getByText('2 of 2')).toBeInTheDocument();
  expect(within(list).getByText('Own style')).toBeInTheDocument();
  expect(within(list).getByText(/^line1 line2 line3/)).toBeInTheDocument();
  expect(within(list).getByText(/^line1 line2 line3/).textContent).toHaveLength(70);
  // page 2 in layout order: the rest of Main text, then Answers
  expect(within(section(1)).getAllByRole('button', { name: /^(Main text|Answers)/ }).map(b => b.getAttribute('aria-label')))
    .toEqual(['Main text, part 2 of 2', 'Answers, own style']);
  expect(within(section(1)).getByText(/^line29 line30/)).toBeInTheDocument();
  expect(within(list).getByRole('button', { name: 'Add page' })).toBeInTheDocument();
  expect(within(list).getByText('Drag a page to reorder; anything that runs on from it follows. Drag a block onto another page to move it.')).toBeInTheDocument();
  expect(within(list).getByRole('img', { name: 'Drag to move page 2' })).toBeInTheDocument();
  expect(within(list).getByRole('button', { name: 'Options for page 2' })).toBeInTheDocument();
});

test('an outline item’s description is its first words', async () => {
  await outline(docOf(m(), n()));
  // its name stays short (name and part), and its first words describe it
  expect(item('Main text, part 1 of 2')).toHaveAccessibleDescription(lines(28).replace(/\n/g, ' ').slice(0, 70));
  expect(item('Main text, part 2 of 2')).toHaveAccessibleDescription(/^line29 line30/);
  expect(item('Answers, own style')).toHaveAccessibleDescription('x');
});

test('the ⋯ on a handwritten tag is white on the colour, as on the typed tag', async () => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
  try {
    await outline(docOf(m(), n()));
    await waitFor(() => expect(document.querySelector('.block-frame .tag-menu button')).not.toBeNull());
    expect(document.querySelector('.block-frame .tag-menu button')!.className).toMatch(/text-white/);
  } finally {
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  }
});

test('selecting a block opens it with its page-break line', async () => {
  await outline(docOf(m(), n()));
  act(() => select('n'));
  expect(within(insp()).getByRole('textbox', { name: 'Block name' })).toHaveValue('Answers');
  expect(within(insp()).getByText('Page 2')).toBeInTheDocument();
  await userEvent.click(itemFor('Main text', 0));
  expect(within(insp()).getByRole('textbox', { name: 'Block name' })).toHaveValue('Main text');
  expect(within(insp()).getByText('Pages 1–2')).toBeInTheDocument();
  expect(within(insp()).getByText('Page 2 starts here')).toBeInTheDocument();
  expect(within(insp()).getByRole('textbox', { name: 'Main text, all pages' })).toBeInTheDocument();
  expect(within(insp()).getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
  expect(within(insp()).getByRole('button', { name: 'Options for Main text' })).toBeInTheDocument();
  expect(itemFor('Main text', 0)).toHaveAttribute('aria-current', 'true');
  expect(itemFor('Main text', 1)).toHaveAttribute('aria-current', 'true');
  // Enter on an item selects it too
  item('Answers, own style').focus();
  await userEvent.keyboard('{Enter}');
  expect(get().selectedId).toBe('n');
});

test('Split here, then Join back', async () => {
  await outline(docOf(m()));
  await userEvent.click(within(insp()).getByRole('button', { name: 'Split here' }));
  expect(lastToast()).toBe('Split “Main text”: from page 2 on, it’s a block of its own.');
  expect(within(insp()).getByText('Split from “Main text”')).toBeInTheDocument();
  expect(within(insp()).getByRole('textbox', { name: 'Block name' })).toHaveValue('Main text (continued)');
  // the button that was pressed has gone: the focus goes to the new block in the list
  await waitFor(() => expect(item('Main text (continued)')).toHaveFocus());
  await userEvent.click(within(insp()).getByRole('button', { name: 'Join back' }));
  expect(lastToast()).toBe('Joined “Main text (continued)” back into “Main text”.');
  expect(get().doc.boxes).toHaveLength(1);
  expect(within(insp()).queryByText(/^Split from/)).toBeNull();
  await waitFor(() => expect(itemFor('Main text', 0)).toHaveFocus());
});

test('Remove page 2 part', async () => {
  await outline(docOf(m()));
  await userEvent.click(within(insp()).getByRole('button', { name: 'Remove page 2 part' }));
  expect(lastToast()).toBe('Removed the page 2 part of “Main text”. The text after it moves up.');
  expect(get().doc.boxes[0].text).toBe(lines(28)); // the part ran to the end, so its line break went too (Task 7 ruling)
  expect(within(insp()).queryByText('Page 2 starts here')).toBeNull();
  expect(within(insp()).getByText('Page 1')).toBeInTheDocument();
});

test('renaming from the inspector', async () => {
  await outline(docOf(m()));
  const f = within(insp()).getByRole('textbox', { name: 'Block name' });
  await userEvent.clear(f);
  await userEvent.type(f, 'Answers{Enter}');
  expect(get().doc.boxes[0].name).toBe('Answers');
  expect(within(ol()).getAllByText('Answers')).toHaveLength(2);
  expect(within(insp()).getByRole('textbox', { name: 'Answers, all pages' })).toBeInTheDocument();
  act(() => undo());
  expect(get().doc.boxes[0].name).toBe('Main text');
  expect(f).toHaveValue('Main text');
  // leaving the field saves it too; an empty name keeps the old one
  await userEvent.clear(f);
  await userEvent.type(f, 'Notes');
  expect(get().doc.boxes[0].name).toBe('Main text');
  await userEvent.tab();
  expect(get().doc.boxes[0].name).toBe('Notes');
  await userEvent.clear(f);
  await userEvent.tab();
  expect(get().doc.boxes[0].name).toBe('Notes');
  expect(f).toHaveValue('Notes');
  await userEvent.type(f, '  {Enter}'); // spaces around a name go
  expect(f).toHaveValue('Notes');
});

test('a typed name is kept when the selection moves on before the field is left', async () => {
  await outline(docOf(m(), n()));
  const nameOf = (id: string) => get().doc.boxes.find(b => b.id === id)!.name;
  const field = () => within(insp()).getByRole('textbox', { name: 'Block name' });
  await userEvent.clear(field());
  await userEvent.type(field(), 'Renamed');
  act(() => select('n')); // pressing another block on the handwritten page: the field goes before it is left
  expect(nameOf('m')).toBe('Renamed');
  expect(field()).toHaveValue('Answers');
  act(() => undo());
  expect(nameOf('m')).toBe('Main text');
  // pressing an empty area of the page (nothing selected) keeps it too; Escape first puts the name back
  act(() => select('m'));
  await userEvent.type(field(), ' too');
  act(() => select(null));
  expect(nameOf('m')).toBe('Main text too');
  act(() => select('m'));
  await userEvent.type(field(), ' not{Escape}');
  act(() => select(null));
  expect(nameOf('m')).toBe('Main text too');
});

test('a continuation in the list can’t be dragged to another page', async () => {
  await outline(docOf(m()));
  fireEvent.pointerDown(itemFor('Main text', 1), { ...mouse, clientX: 10, clientY: 50 });
  fireEvent.pointerMove(document, { pointerId: 1, clientX: 10, clientY: 60 });
  expect(lastToast()).toBe('Part 2 of Main text always follows the part before it. Split it off first to move it on its own.');
  expect(document.body.dataset.dragging).toBeUndefined();
  fireEvent.pointerUp(document, { pointerId: 1, clientX: 10, clientY: 60 });
  expect(get().doc.boxes[0].page).toBe(0);
});

test('dragging a block onto another page’s section moves it there', async () => {
  const list = await outline({ ...docOf(m(), n()), pageCount: 3 });
  expect(within(section(2)).getByText('Drop a block here')).toBeInTheDocument();
  dragTo(item('Answers, own style'), within(section(2)).getByText('Drop a block here'));
  expect(lastToast()).toBe('Moved “Answers” to page 3.');
  expect(get().doc.boxes.find(b => b.id === 'n')!.page).toBe(2);
  expect(get().selectedId).toBe('n'); // a dragged block is selected, as pressing it on the page does
  expect(within(list.querySelector<HTMLElement>('[data-drop-page="2"]')!).getByRole('button', { name: 'Answers, own style' })).toBeInTheDocument();
});

test('dragging a page’s grip onto another page moves the page', async () => {
  await outline(docOf(m(), n()));
  dragTo(within(ol()).getByRole('img', { name: 'Drag to move page 1' }), within(section(1)).getByText('Page 2'));
  expect(lastToast()).toMatch(/^Moved page 1 to position 2\./);
  expect(get().doc.boxes.find(b => b.id === 'm')!.page).toBe(1);
});

test('nothing selected', async () => {
  await outline(docOf(m()));
  act(() => select(null));
  expect(screen.getByText('Select a block on the page or in the outline.')).toBeInTheDocument();
  expect(within(insp()).queryByRole('textbox')).toBeNull();
});

test('deleting the selected block while its editor has focus', async () => {
  await outline(docOf(m()));
  const ed = within(insp()).getByRole('textbox', { name: 'Main text, all pages' });
  act(() => { editorOf(ed).commands.setTextSelection(editorOf(ed).state.doc.content.size - 1); editorOf(ed).view.focus(); });
  expect(ed).toHaveFocus();
  act(() => { editorOf(ed).commands.insertContent('!'); });
  act(() => deleteBlock('m'));
  await act(() => new Promise(r => setTimeout(r, 500)));
  expect(get().doc.boxes).toHaveLength(0);
  expect(screen.getByText('Select a block on the page or in the outline.')).toBeInTheDocument();
  expect(within(ol()).getByText('Drop a block here')).toBeInTheDocument();
  // nothing left in the list to go to: the focus goes to the page's heading
  await waitFor(() => expect(within(ol()).getByRole('heading', { name: 'Page 1' })).toHaveFocus());
});

test('splitting, removing a part and deleting a page while the editor has focus and typing is still being saved', async () => {
  await outline(docOf(m()));
  /** Focus the inspector's editor at the end of its first line and type a character there. */
  const typeInto = (label: string) => {
    const e = editorOf(within(insp()).getByRole('textbox', { name: label }));
    act(() => { e.commands.setTextSelection(6); e.view.focus(); });
    act(() => { e.commands.insertContent('!'); });
  };
  const textOf = (id: string) => get().doc.boxes.find(b => b.id === id)?.text;
  typeInto('Main text, all pages');
  act(() => splitAt('m', 1));
  await act(() => new Promise(r => setTimeout(r, 500)));
  expect(get().doc.boxes.map(b => b.name)).toEqual(['Main text', 'Main text (continued)']);
  expect(textOf('m')).toBe(['line1!', ...lines(28).split('\n').slice(1)].join('\n')); // nothing came back from the old editor
  expect(within(insp()).getByRole('textbox', { name: 'Main text (continued), all pages' })).toBeInTheDocument();
  act(() => undo());
  act(() => select('m'));
  const ed = () => within(insp()).getByRole('textbox', { name: 'Main text, all pages' });
  typeInto('Main text, all pages');
  act(() => removePart('m', 1));
  await act(() => new Promise(r => setTimeout(r, 500)));
  expect(textOf('m')).toBe(['line1!!', ...lines(28).split('\n').slice(1)].join('\n'));
  expect(ed().textContent).not.toContain('line29');
  expect(within(insp()).queryByText(/starts here/)).toBeNull();
  act(() => undo());
  expect(within(insp()).getByText('Page 2 starts here')).toBeInTheDocument();
  typeInto('Main text, all pages');
  act(() => deletePageAt(1));
  await act(() => new Promise(r => setTimeout(r, 500)));
  expect(textOf('m')).toBe(['line1!!!', ...lines(28).split('\n').slice(1)].join('\n'));
  expect(ed().textContent).not.toContain('line29');
  expect(within(insp()).queryByText(/starts here/)).toBeNull();
});

test('Add puts a new block’s caret in the inspector', async () => {
  await outline(docOf(m()));
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Text block' }));
  await waitFor(() => expect(lastToast()).toBe('Added a text block. Page 1 has no free line, so it starts on page 2.')); // once the menu has closed
  const ed = await within(insp()).findByRole('textbox', { name: 'Text block, all pages' });
  await waitFor(() => expect(ed).toHaveFocus());
  expect(get().doc.boxes.at(-1)!.page).toBe(0); // the selected block's page
});

test('Delete block from the inspector’s menu moves the focus to the next block in the list', async () => {
  await outline(docOf(m(), n()));
  await userEvent.click(within(insp()).getByRole('button', { name: 'Options for Main text' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete block' }));
  expect(lastToast()).toBe('Deleted “Main text”.');
  await waitFor(() => expect(item('Answers, own style')).toHaveFocus());
});

test('a header shows its fields and the hint, and its item the filled-in fields', async () => {
  await outline(docOf(h(), box({ id: 'm', name: 'Main text', y: 178, text: 'x' })));
  expect(within(ol()).getByText('Riya · 6 November 2026')).toBeInTheDocument();
  await userEvent.click(item('Header'));
  expect(within(insp()).getByRole('textbox', { name: 'Name' })).toHaveValue('Riya');
  expect(within(insp()).getByText('New documents fill in today’s date.')).toBeInTheDocument();
  expect(within(insp()).queryByRole('toolbar', { name: 'Formatting' })).toBeNull();
  expect(within(insp()).queryByRole('textbox', { name: /all pages/ })).toBeNull();
});

test('Outline’s header editor adds a field, and the header’s item shows its value', async () => {
  try {
    await outline(docOf(h(), box({ id: 'm', name: 'Main text', y: 178, text: 'x' })));
    await userEvent.click(item('Header'));
    await userEvent.click(within(insp()).getByRole('button', { name: 'Add field' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Teacher' }));
    await waitFor(() => expect(within(insp()).getByRole('textbox', { name: 'Teacher' })).toHaveFocus());
    await userEvent.keyboard('Ms Rao');
    expect(get().doc.boxes.find(b => b.id === 'h')!.text).toBe('Name: Riya\nClass:\nDate: 6 November 2026\nTeacher: Ms Rao');
    expect(within(ol()).getByText('Riya · 6 November 2026 · Ms Rao')).toBeInTheDocument();
  } finally {
    await forgetHeader();
  }
});

describe('Undo and Redo keys in the header editor’s fields are the document’s', () => {
  const labels = () => get().doc.boxes.find(b => b.id === 'h')!.fields!.map(f => f.label);
  const valueOf = (label: string) => get().doc.boxes.find(b => b.id === 'h')!.fields!.find(f => f.label === label)?.value;
  const field = (name: string) => within(insp()).getByRole('textbox', { name }) as HTMLInputElement;
  const z = '{Control>}z{/Control}', shiftZ = '{Control>}{Shift>}z{/Shift}{/Control}', y = '{Control>}y{/Control}';
  async function header() {
    await outline(docOf(h(), box({ id: 'm', name: 'Main text', y: 178, text: 'x' })));
    await userEvent.click(item('Header'));
  }
  afterEach(async () => { await forgetHeader(); });

  test('Remove, then Ctrl+Z in the value the focus went to, puts the field back, and Redo is still there', async () => {
    await header();
    await userEvent.click(within(insp()).getByRole('button', { name: 'More for “Class”' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
    await waitFor(() => expect(field('Date')).toHaveFocus());
    await userEvent.keyboard(z);
    expect([labels(), get().canRedo, field('Date').value]).toEqual([['Name', 'Class', 'Date'], true, '6 November 2026']);
    await userEvent.keyboard(shiftZ);
    expect(labels()).toEqual(['Name', 'Date']);
    await userEvent.keyboard(z + y); // Ctrl+Y redoes too
    expect([labels(), get().canRedo]).toEqual([['Name', 'Date'], false]);
    expect(fireEvent.keyDown(field('Date'), { key: 'z', ctrlKey: true })).toBe(false); // the field's own undo never starts
    expect(labels()).toEqual(['Name', 'Class', 'Date']);
  });

  test('Add, then Ctrl+Z in the new value takes the field away again', async () => {
    await header();
    await userEvent.click(within(insp()).getByRole('button', { name: 'Add field' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Teacher' }));
    await waitFor(() => expect(field('Teacher')).toHaveFocus());
    await userEvent.keyboard(z);
    expect([labels(), get().canRedo]).toEqual([['Name', 'Class', 'Date'], true]);
  });

  test('typing, then Ctrl+Z, undoes that burst of typing in the document’s history', async () => {
    await header();
    await userEvent.type(field('Name'), ' Sen');
    expect(valueOf('Name')).toBe('Riya Sen');
    await userEvent.keyboard(z);
    expect([valueOf('Name'), field('Name').value, get().canRedo]).toEqual(['Riya', 'Riya', true]);
    await userEvent.keyboard(shiftZ);
    expect([valueOf('Name'), field('Name').value]).toEqual(['Riya Sen', 'Riya Sen']);
  });

  test('on Apple, ⌘Z and ⇧⌘Z; Ctrl+Y is left alone', async () => {
    const mac = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    await header();
    await userEvent.type(field('Name'), ' Sen');
    await userEvent.keyboard('{Meta>}z{/Meta}');
    expect(valueOf('Name')).toBe('Riya');
    expect(fireEvent.keyDown(field('Name'), { key: 'y', ctrlKey: true })).toBe(true);
    expect(valueOf('Name')).toBe('Riya');
    await userEvent.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}');
    expect(valueOf('Name')).toBe('Riya Sen');
    mac.mockRestore();
  });

  test('in a field’s name while it is open: after Custom field…, Ctrl+Z takes the field away; Esc and Enter are still the name’s', async () => {
    await header();
    await userEvent.click(within(insp()).getByRole('button', { name: 'Add field' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Custom field…' }));
    await waitFor(() => expect(field('Field name')).toHaveFocus());
    await userEvent.keyboard(z);
    expect([labels(), get().canRedo]).toEqual([['Name', 'Class', 'Date'], true]);
    expect(within(insp()).queryByRole('textbox', { name: 'Field name' })).toBeNull();

    await userEvent.click(within(insp()).getByRole('button', { name: 'Rename “Class”' }));
    await userEvent.keyboard('Section{Enter}');
    expect(labels()).toEqual(['Name', 'Section', 'Date']);
    expect(within(insp()).getByRole('button', { name: 'Rename “Section”' })).toHaveFocus();
    await userEvent.click(within(insp()).getByRole('button', { name: 'Rename “Section”' }));
    await userEvent.keyboard('Sec{Escape}');
    expect(labels()).toEqual(['Name', 'Section', 'Date']);
    expect(within(insp()).getByRole('button', { name: 'Rename “Section”' })).toHaveFocus();
  });

  test('…and when Ctrl+Z there takes back that field’s own rename, the open name shows the name now, and leaving it keeps Redo', async () => {
    await header();
    await userEvent.click(within(insp()).getByRole('button', { name: 'Rename “Class”' }));
    await userEvent.keyboard('Section{Enter}');
    await userEvent.click(within(insp()).getByRole('button', { name: 'Rename “Section”' }));
    await userEvent.keyboard(z);
    expect([labels(), field('Field name').value]).toEqual([['Name', 'Class', 'Date'], 'Class']);
    await userEvent.tab();
    expect([labels(), get().canRedo]).toEqual([['Name', 'Class', 'Date'], true]);
  });
});

test('a clicked word’s caret goes to the inspector’s editor', async () => {
  await outline(docOf(m(), n()));
  act(() => placeCaret('m', 6)); // the start of line2
  const ed = within(insp()).getByRole('textbox', { name: 'Main text, all pages' });
  await waitFor(() => expect(ed).toHaveFocus());
  expect(get().caret).toBeNull();
  const e = editorOf(ed);
  expect(offsetAt(e.state.doc, get().doc.boxes[0].text, e.state.selection.head)).toBe(6);
});

test('Add page adds a blank page to the list', async () => {
  await outline(docOf(m()));
  await userEvent.click(within(ol()).getByRole('button', { name: 'Add page' }));
  expect(lastToast()).toBe('Added a blank page.');
  expect(within(section(2)).getByText('Page 3')).toBeInTheDocument();
  expect(within(section(2)).getByText('Drop a block here')).toBeInTheDocument();
});

test('a page break inside a paragraph is a chip in the text with both actions', async () => {
  await outline(docOf(box({ id: 'p', name: 'Main text', y: 1009, text: words(40) }))); // its paragraph runs onto page 2
  const chip = within(insp()).getByText('Page 2 starts here').parentElement!;
  expect(chip).toHaveClass('nib-break-inline');
  expect(within(chip).getByRole('button', { name: 'Remove page 2 part' })).toBeInTheDocument();
  await userEvent.click(within(chip).getByRole('button', { name: 'Split here' }));
  expect(lastToast()).toBe('Split “Main text”: from page 2 on, it’s a block of its own.');
  expect(get().doc.boxes).toHaveLength(2);
});

test('on a wide screen nothing changes', async () => {
  await outline(docOf(m()));
  expect(screen.queryByRole('dialog', { name: 'Outline', hidden: true })).toBeNull();
  // the page list, the handwritten pages and the inspector, side by side in that order
  const list = ol(), pages = screen.getByRole('main', { name: 'Pages' }), inspector = insp();
  expect(pages.parentElement).toBe(list.parentElement);
  expect(inspector.parentElement).toBe(list.parentElement);
  expect([...list.parentElement!.children]).toEqual([list, pages, inspector]);
  expect(list.parentElement).toHaveClass('grid', 'grid-cols-[260px_minmax(0,1fr)_minmax(320px,380px)]');
  expect(screen.queryByRole('button', { name: 'Drag to show more or less of Outline' })).toBeNull();
});

describe('on a phone', () => {
  // A phone: no media query for a wide window matches, and every element is 390 px wide. (jsdom has no
  // pointer capture either, which the sheet asks for when it is pressed.)
  const wideMatchMedia = window.matchMedia;
  const capture = ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'];
  const proto = Element.prototype as unknown as Record<string, unknown>;
  beforeAll(() => {
    window.matchMedia = (query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }) as MediaQueryList;
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 390 });
    for (const k of capture) proto[k] = () => false;
  });
  afterAll(() => {
    window.matchMedia = wideMatchMedia;
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    for (const k of capture) delete proto[k];
  });

  const sheet = () => screen.getByRole('dialog', { name: 'Outline' });
  const handle = () => screen.getByRole('button', { name: 'Drag to show more or less of Outline' });
  const pages = () => screen.getByRole('main', { name: 'Pages' });
  const room = () => pages().parentElement!.style.getPropertyValue('--sheet-shown');
  const after = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  test('the handwritten pages come first, and Outline is a sheet over them', async () => {
    await outline(docOf(m()));
    const dialog = sheet();
    expect(dialog).toHaveAttribute('aria-modal', 'false');
    expect(within(dialog).getByRole('region', { name: 'Outline' })).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: 'Selected block' })).toBeInTheDocument();
    expect(after(pages(), dialog)).toBe(true);
    await waitFor(() => expect(document.querySelectorAll('[data-stage="outline"] .sheet')).toHaveLength(2));
    for (const page of document.querySelectorAll<HTMLElement>('[data-stage="outline"] .sheet')) expect(dialog).not.toContainElement(page);
    expect(within(dialog).getByRole('button', { name: 'Drag to show more or less of Outline' })).toBeInTheDocument();
    // it starts at about half, and the pages leave room after the last one for as much as it covers
    expect(room()).toBe('55dvh');
    expect(pages()).toHaveClass('after:h-[calc(var(--sheet-shown)+12px)]');
  });

  test('a long Main text never pushes the page list out of reach', async () => {
    await outline(docOf(m()));
    const list = within(sheet()).getByRole('region', { name: 'Outline' });
    expect(list).toHaveClass('max-h-[40dvh]', 'overflow-y-auto');
    expect(after(list, within(sheet()).getByRole('region', { name: 'Selected block' }))).toBe(true);
  });

  test('choosing a part in the list shows its block in the sheet', async () => {
    await outline(docOf(m(), n()));
    act(() => select(null));
    expect(within(sheet()).queryByRole('textbox', { name: 'Main text, all pages' })).toBeNull();
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Main text, part 2 of 2' }));
    expect(within(sheet()).getByRole('textbox', { name: 'Main text, all pages' })).toBeInTheDocument();
    expect(within(sheet()).getByText('Page 2 starts here')).toBeInTheDocument();
  });

  test('a tapped word’s caret goes to the sheet’s editor, scrolled into view', async () => {
    await outline(docOf(m(), n()));
    act(() => select('n'));
    // ProseMirror scrolls to the caret only while the page's selection is in the editor (jsdom can't lay
    // it out, so note where that selection is each time it is asked to).
    const scrolls: boolean[] = [];
    vi.spyOn(EditorView.prototype as unknown as { scrollToSelection(): void }, 'scrollToSelection').mockImplementation(function (this: EditorView) {
      const at = document.getSelection()?.focusNode ?? null;
      scrolls.push(!!at && this.dom.contains(at));
    });
    act(() => placeCaret('m', 6)); // what a tap on “line2” on the handwritten page asks for
    const ed = await within(sheet()).findByRole('textbox', { name: 'Main text, all pages' });
    await waitFor(() => expect(ed).toHaveFocus());
    const e = editorOf(ed);
    expect(offsetAt(e.state.doc, get().doc.boxes[0].text, e.state.selection.head)).toBe(6);
    expect(scrolls).toContain(true);
  });

  test('the sheet rests as low as 148 px, and opens up to just below the Write bar', async () => {
    expect(OUTLINE_PEEK).toBe(148);
    // The pages and the sheet start 137 px down, below the top bar, its stage switcher and the Write bar
    // (jsdom's window is 768 px tall).
    const rect = HTMLElement.prototype.getBoundingClientRect;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.style.getPropertyValue('--sheet-shown') ? new DOMRect(0, 137, 390, 631) : rect.call(this);
    });
    try {
      await outline(docOf(m()));
      handle().focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(sheet().style.getPropertyValue('--snap-point-height')).toBe('137px'));
      expect(room()).toBe('631px');
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(room()).toBe('148px'));
    } finally { spy.mockRestore(); }
  });

  test('dragging a page or a block in the sheet’s list leaves the sheet where it is', async () => {
    // The stage starts 137 px down; the sheet is where vaul has moved it (the browser reports a matrix).
    const rect = HTMLElement.prototype.getBoundingClientRect, css = window.getComputedStyle;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.style.getPropertyValue('--sheet-shown') ? new DOMRect(0, 137, 390, 631) : rect.call(this);
    });
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, p) => {
      const real = css.call(window, el, p);
      if (!(el instanceof HTMLElement && el.dataset.slot === 'drawer-content')) return real;
      return new Proxy(real, { get: (t, k) => {
        const v = k === 'transform' ? 'matrix(1, 0, 0, 1, 0, 137)' : Reflect.get(t, k, t);
        return typeof v === 'function' ? v.bind(t) : v;
      } });
    });
    await outline({ ...docOf(m(), n()), pageCount: 3 });
    handle().focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(room()).toBe('631px'));
    // (vaul moves the sheet in an effect of its own, after the height the pages make room for has changed)
    await waitFor(() => expect(sheet().style.transform).toBe('translate3d(0px, 137px, 0px)'));
    const at = sheet().style.transform;
    /**
     * A mouse drag that starts on `el`, whose capture of the pointer takes it out of `el`, and drops on
     * `over`. The sheet neither follows it nor moves when it ends.
     */
    const drag = async (el: HTMLElement, over: Element) => {
      await act(() => new Promise(r => setTimeout(r, 600))); // (vaul holds off a drag for 500 ms after reaching a height)
      const to = (y: number) => ({ ...mouse, buttons: 1, clientX: 10, clientY: y });
      fireEvent.pointerDown(el, to(50));
      fireEvent.pointerMove(el, to(62));
      expect(sheet().style.transform).toBe(at);
      fireEvent.pointerOut(el, to(62));
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(over);
      fireEvent.pointerMove(document, to(70));
      fireEvent.pointerUp(document, to(70));
      await act(() => new Promise(r => setTimeout(r, 50)));
      expect(sheet().style.transform).toBe(at);
      expect(room()).toBe('631px');
    };
    await drag(item('Answers, own style'), within(section(2)).getByText('Drop a block here'));
    expect(lastToast()).toBe('Moved “Answers” to page 3.');
    await drag(within(sheet()).getByRole('img', { name: 'Drag to move page 1' }), within(section(1)).getByText('Page 2'));
    expect(lastToast()).toMatch(/^Moved page 1 to position 2\./);
  });

  test('a page’s grip in the sheet is something to tap, so a finger on it isn’t moved onto the heading or block beside it', async () => {
    await outline(docOf(m(), n()));
    const grip = within(sheet()).getByRole('img', { name: 'Drag to move page 1' });
    // Chromium moves a touch onto the nearest thing it counts as tappable (its touch adjustment): the page's heading
    // (it can take the focus) or a block's item. A style while pressed makes the grip count; hover styles don't on a phone.
    expect(grip).toHaveClass('active:text-fg', 'touch-none');
    expect(grip).toHaveAttribute('data-vaul-no-drag');
  });

  test('the sheet goes with the stage and the view, and Tab goes on out of it, both ways', async () => {
    await outline(docOf(m()));
    const controls = [...sheet().querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')];
    controls[controls.length - 1].focus();
    await userEvent.tab();
    expect(sheet()).not.toContainElement(document.activeElement as HTMLElement);
    handle().focus();
    await userEvent.tab({ shift: true });
    expect(sheet()).not.toContainElement(document.activeElement as HTMLElement);
    await userEvent.click(within(screen.getByRole('group', { name: 'Write view' })).getByRole('button', { name: 'Pages' }));
    expect(screen.queryByRole('dialog', { name: 'Outline', hidden: true })).toBeNull();
    await userEvent.click(within(screen.getByRole('group', { name: 'Write view' })).getByRole('button', { name: 'Outline' }));
    expect(await screen.findByRole('dialog', { name: 'Outline' })).toBeInTheDocument();
    // another stage hides Outline's, and its sheet with it; Write comes back to Outline
    const stageButton = (name: string) => within(screen.getByRole('navigation', { name: 'Stages' })).getByRole('button', { name: new RegExp(`${name}$`) });
    await userEvent.click(stageButton('Style'));
    expect(await screen.findByRole('dialog', { name: 'Style' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Outline', hidden: true })).toBeNull();
    await userEvent.click(stageButton('Write'));
    expect(await screen.findByRole('dialog', { name: 'Outline' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Style' })).toBeNull();
  });
});
