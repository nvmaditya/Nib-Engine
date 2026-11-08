// The ⋯ menus for blocks and pages, the Add menu, the header's fields and the Write bar.
import { useLayoutEffect, useRef } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import type { Box } from '@/engine/types';
import { splitAt } from '@/features/doc/actions';
import { layoutFor } from '@/features/doc/model';
import { flushSave, undo, useEditor } from '@/store/editor';
import { box, docOf, fieldsOf, get, lastToast, lines, open } from '@/test/docs';
import { BlockMenu } from './BlockMenu';
import { HeaderFields } from './HeaderFields';
import { PageMenu } from './PageMenu';
import { PartMenu, TypedPage } from './TypedPage';
import { WriteBar } from './WriteBar';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

const m = () => box({ id: 'm', name: 'Main text', text: lines(40) }); // pages 1–2
const h = (p: Partial<Box> = {}) => box({ id: 'h', kind: 'header', name: 'Header', x: 446, y: 76, w: 320, color: 1, fields: fieldsOf({ name: '', class: '', date: '6 November 2026' }), ...p });
const n = () => box({ id: 'n', name: 'Answers', page: 1, y: 900, color: 2, text: 'x' });

/** The text of each item in the open menu (the first one, when a submenu is open too), in order. */
const items = () => within(screen.getAllByRole('menu')[0]).getAllByRole('menuitem').map(e => e.textContent);
const openMenu = (name: string) => userEvent.click(screen.getByRole('button', { name }));
const item = (name: string | RegExp) => screen.getByRole('menuitem', { name });
const boxH = () => get().doc.boxes.find(b => b.id === 'h')!;

beforeEach(async () => {
  await flushSave();
  vi.mocked(sonner).mockClear();
  open(docOf(m(), h()));
});

test('a later part’s menu', async () => {
  render(<BlockMenu boxId="m" idx={1} />);
  await openMenu('Options for Main text');
  expect(items()).toEqual(['Rename', 'Split into its own block', 'Remove the page 2 part', 'Give it its own style', 'Delete block']);
});

test('a first part offers Split from the rest and Move to page…', async () => {
  render(<BlockMenu boxId="m" idx={0} />);
  await openMenu('Options for Main text');
  expect(items()).toEqual(['Rename', 'Split from the rest', 'Remove the page 1 part', 'Move to page…', 'Give it its own style', 'Delete block']);
});

test('a split block offers Join back, and other blocks to add to', async () => {
  open(docOf(m(), h(), n()));
  act(() => splitAt('m', 1));
  const nb = get().doc.boxes.find(b => b.from === 'm')!;
  const { unmount } = render(<BlockMenu boxId={nb.id} idx={0} />);
  await openMenu('Options for Main text (continued)');
  expect(items()).toContain('Join back into “Main text”');
  expect(items()).toContain('“Answers”');
  expect(items()).not.toContain('“Main text”'); // where it came from is Join back, not Add to the end of
  await userEvent.keyboard('{Escape}');
  unmount();
  render(<BlockMenu boxId="n" idx={0} />);
  await openMenu('Options for Answers');
  expect(items()).toContain('“Main text”');
  expect(items()).toContain('“Main text (continued)”');
  expect(items()).not.toContain('“Header”');
  expect(items().some(t => t!.startsWith('Join back'))).toBe(false);
  await userEvent.click(item('“Main text”'));
  expect(lastToast()).toBe('Added “Answers” to the end of “Main text”.');
});

test('a header’s ⋯ menu has no field items', async () => {
  open(docOf(h())); // one page, so there is nowhere to move it to
  render(<BlockMenu boxId="h" idx={0} />);
  await openMenu('Options for Header');
  expect(items()).toEqual(['Rename', 'Give it its own style', 'Delete block']);
});

test('a header on two pages can’t be split or lose a part', async () => {
  open(docOf(h({ y: 1009, fields: fieldsOf({ name: 'A', class: 'B', date: 'C' }) })));
  expect(layoutFor(get().S, get().doc).segs.filter(s => s.box.id === 'h').map(s => s.page)).toEqual([0, 1]);
  render(<BlockMenu boxId="h" idx={1} />);
  await openMenu('Options for Header');
  expect(items()).toEqual(['Rename', 'Give it its own style', 'Delete block']);
});

test('Rename opens the Rename block dialog', async () => {
  render(<BlockMenu boxId="m" idx={0} />);
  await openMenu('Options for Main text');
  await userEvent.click(item('Rename'));
  const dlg = await screen.findByRole('dialog', { name: 'Rename block' });
  const field = within(dlg).getByRole('textbox', { name: 'Block name' });
  expect(field).toHaveValue('Main text');
  await waitFor(() => expect(field).toHaveFocus());
  await userEvent.clear(field);
  await userEvent.type(field, 'Answers');
  await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
  expect(get().doc.boxes[0].name).toBe('Answers');
  expect(screen.queryByRole('dialog')).toBeNull();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Options for Answers' })).toHaveFocus());
});

test('Move to page… lists the pages, the one it is on disabled', async () => {
  render(<BlockMenu boxId="m" idx={0} />);
  await openMenu('Options for Main text');
  await userEvent.click(item('Move to page…'));
  expect(await screen.findByRole('menuitem', { name: 'Page 1' })).toHaveAttribute('aria-disabled', 'true');
  await userEvent.click(item('Page 2'));
  expect(lastToast()).toBe('Moved “Main text” to page 2.');
  expect(get().doc.boxes[0].page).toBe(1);
});

test('a block on the only page has nowhere to move to', async () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: 'x' })));
  render(<BlockMenu boxId="m" idx={0} />);
  await openMenu('Options for Main text');
  expect(items()).toEqual(['Rename', 'Give it its own style', 'Delete block']);
});

test('the block menu’s items act on the part it was opened for', async () => {
  render(<BlockMenu boxId="m" idx={1} />);
  await openMenu('Options for Main text');
  await userEvent.click(item('Split into its own block'));
  expect(lastToast()).toBe('Split “Main text”: from page 2 on, it’s a block of its own.');
  act(() => open(docOf(m(), h())));
  await openMenu('Options for Main text');
  await userEvent.click(item('Remove the page 2 part'));
  expect(lastToast()).toBe('Removed the page 2 part of “Main text”. The text after it moves up.');
  await openMenu('Options for Main text');
  await userEvent.click(item('Delete block'));
  expect(lastToast()).toBe('Deleted “Main text”.');
  expect(screen.queryByRole('button', { name: 'Options for Main text' })).toBeNull();
});

test('a menu can open from the button it is given', async () => {
  render(<PageMenu page={1} pages={2} trigger={<button type="button">Page 2 tools</button>} />);
  await userEvent.click(screen.getByRole('button', { name: 'Page 2 tools' }));
  expect(items()[0]).toBe('Move up');
  await userEvent.keyboard('{Escape}');
  render(<BlockMenu boxId="m" idx={0} trigger={<button type="button">Main text tools</button>} />);
  await userEvent.click(screen.getByRole('button', { name: 'Main text tools' }));
  expect(items()[0]).toBe('Rename');
});

test('the menus work from the keyboard', async () => {
  render(<BlockMenu boxId="m" idx={0} />);
  screen.getByRole('button', { name: 'Options for Main text' }).focus();
  await userEvent.keyboard('{Enter}');
  await waitFor(() => expect(item('Rename')).toHaveFocus());
  await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowRight}');
  await waitFor(() => expect(item('Page 2')).toHaveFocus()); // Page 1 is where it is, so it is skipped
  await userEvent.keyboard('{Enter}');
  expect(lastToast()).toBe('Moved “Main text” to page 2.');
});

test('page menu', async () => {
  render(<PageMenu page={0} pages={2} />);
  await openMenu('Options for page 1');
  expect(item('Move up')).toHaveAttribute('aria-disabled', 'true');
  expect(item(/Merge into previous page/)).toHaveAttribute('aria-disabled', 'true');
  expect(item('Move down')).not.toHaveAttribute('aria-disabled');
  expect(items()).toEqual(['Move up', 'Move down', 'Merge into previous page', 'Add a page after this one', 'Delete page']);
  await userEvent.click(item('Add a page after this one'));
  expect(lastToast()).toBe('Added a blank page.');
});

test('the last page can’t move down; its menu merges and deletes it', async () => {
  render(<PageMenu page={1} pages={2} />);
  await openMenu('Options for page 2');
  expect(item('Move down')).toHaveAttribute('aria-disabled', 'true');
  expect(item('Move up')).not.toHaveAttribute('aria-disabled');
  await userEvent.click(item('Delete page'));
  expect(lastToast()).toBe('Deleted page 2 and everything on it.');
});

test('the page menu tells a pager which page to show next, only when the document changed', async () => {
  const onShow = vi.fn();
  const choose = async (page: number, name: string) => {
    await openMenu(`Options for page ${page + 1}`);
    await userEvent.click(item(name));
  };
  // Page 2 shows only Main text part 2: moving and merging it are refused, and the pager stays.
  const { unmount } = render(<PageMenu page={1} pages={2} onShow={onShow} />);
  await choose(1, 'Move up');
  await choose(1, 'Merge into previous page');
  expect(onShow).not.toHaveBeenCalled();
  await choose(1, 'Add a page after this one');
  expect(onShow).toHaveBeenLastCalledWith(2);
  unmount();
  // Page 1's Main text runs onto page 2, so the blank page goes after that: the pager turns to page 3, not 2.
  const first = render(<PageMenu page={0} pages={3} onShow={onShow} />);
  await choose(0, 'Add a page after this one');
  expect(onShow).toHaveBeenLastCalledWith(2);
  expect(layoutFor(get().S, get().doc).segs.filter(s => s.page === 2)).toEqual([]);
  first.unmount();
  const three = () => ({ ...docOf(box({ id: 'a', text: 'a' }), box({ id: 'b', page: 1, text: 'b' }), box({ id: 'c', page: 2, text: 'c' })), pageCount: 3 });
  act(() => open(three()));
  onShow.mockClear();
  const r = render(<PageMenu page={1} pages={3} onShow={onShow} />);
  await choose(1, 'Move down');
  expect(onShow).toHaveBeenLastCalledWith(2);
  await choose(1, 'Move up');
  expect(onShow).toHaveBeenLastCalledWith(0);
  await choose(1, 'Merge into previous page');
  expect(onShow).toHaveBeenLastCalledWith(0);
  await choose(1, 'Delete page');
  expect(onShow).toHaveBeenCalledTimes(3); // Delete page leaves the pager to clamp itself
  r.unmount();
});

/** The header's rows, top to bottom (each value is named by its field's label). */
const rows = () => screen.getAllByRole('textbox').map(e => e.getAttribute('aria-label'));
/** Lets the moment pass in which a closed menu would put the focus back on its button. */
const settle = () => act(() => new Promise(r => setTimeout(r, 0)));

test('header fields write the header', async () => {
  render(<HeaderFields boxId="h" />);
  expect(rows()).toEqual(['Name', 'Class', 'Date']);
  await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Riya');
  expect(boxH().fields!.find(f => f.label === 'Name')!.value).toBe('Riya');
  expect(boxH().text.split('\n')[0]).toBe('Name: Riya');
  act(() => undo());
  expect(boxH().fields!.find(f => f.label === 'Name')!.value).toBe('');
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('');
  expect(screen.queryByRole('textbox', { name: 'Subject' })).toBeNull();
});

test('the header’s fields are edited in place, each change one undo step, and the header’s text follows', async () => {
  render(<HeaderFields boxId="h" />);
  await openMenu('Add field'); await userEvent.click(item('Registration no.')); await settle();
  expect(screen.getByRole('textbox', { name: 'Registration no.' })).toHaveFocus();
  await userEvent.type(screen.getByRole('textbox', { name: 'Registration no.' }), '12');
  await userEvent.click(screen.getByRole('button', { name: 'Rename “Class”' })); await userEvent.keyboard('Section{Enter}');
  expect(boxH().text).toBe('Name:\nSection:\nDate: 6 November 2026\nRegistration no.: 12');
  await openMenu('More for “Section”'); await userEvent.click(item('Remove')); await settle();
  expect(lastToast()).toBe('Removed “Section”.');
  expect(boxH().text).toBe('Name:\nDate: 6 November 2026\nRegistration no.: 12');
  expect(rows()).toEqual(['Name', 'Date', 'Registration no.']);
  // Undo, one change at a time: the remove, the rename, the typing, the add.
  const back = [
    ['Name:\nSection:\nDate: 6 November 2026\nRegistration no.: 12', ['Name', 'Section', 'Date', 'Registration no.']],
    ['Name:\nClass:\nDate: 6 November 2026\nRegistration no.: 12', ['Name', 'Class', 'Date', 'Registration no.']],
    ['Name:\nClass:\nDate: 6 November 2026\nRegistration no.:', ['Name', 'Class', 'Date', 'Registration no.']],
    ['Name:\nClass:\nDate: 6 November 2026', ['Name', 'Class', 'Date']],
  ];
  for (const [text, labels] of back) {
    act(() => undo());
    expect([boxH().text, rows()]).toEqual([text, labels]);
  }
  expect(get().canUndo).toBe(false);
});

test('Write bar', async () => {
  const onMode = vi.fn();
  render(<WriteBar view="write" mode="side" onMode={onMode} page={0} />);
  expect(screen.getByRole('button', { name: 'Pages' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Side by side' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Typed' }));
  expect(onMode).toHaveBeenCalledWith('typed');
  await userEvent.click(screen.getByRole('button', { name: 'Outline' }));
  expect(location.hash).toMatch(/\/outline$/);
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(items()).toEqual(['Text block', 'Margin note', 'Header', 'Page']);
  await userEvent.click(item('Margin note'));
  // once the menu has closed; Main text fills page 1, so the note starts on page 2
  await waitFor(() => expect(lastToast()).toBe('Added a margin note. Page 1 has no free line, so it starts on page 2.'));
});

test('the Outline’s Write bar: no Show group or toolbar; Add and Import', async () => {
  render(<WriteBar view="outline" page={1} />);
  expect(screen.getByRole('button', { name: 'Outline' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Pages' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByRole('group', { name: 'Show' })).toBeNull();
  expect(screen.queryByRole('toolbar', { name: 'Formatting' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Pages' }));
  expect(location.hash).toMatch(/\/write$/);
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
  await userEvent.click(item('Text block'));
  await waitFor(() => expect(get().doc.boxes.at(-1)!.page).toBe(1));
  await userEvent.click(screen.getByRole('button', { name: 'Import' }));
  expect(get().importOpen).toBe(true);
});

test('without onMode the Write bar has no Show group', () => {
  render(<WriteBar view="write" page={0} />);
  expect(screen.queryByRole('group', { name: 'Show' })).toBeNull();
  expect(screen.getByRole('group', { name: 'Write view' })).toBeInTheDocument();
});

/**
 * Stands in for a new block's editor: it takes the focus as soon as a block is added, in a layout effect,
 * as BlockEditor does when it takes a caret request.
 */
function FocusOnAdd() {
  const count = useEditor(s => s.doc.boxes.length), first = useRef(count), ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { if (count > first.current) ref.current?.focus(); }, [count]);
  return <textarea aria-label="New block" ref={ref} />;
}

test('after Add, the focus stays with a new block’s editor, else it goes back to Add', async () => {
  render(<><WriteBar view="write" page={0} /><FocusOnAdd /></>);
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
  await userEvent.click(item('Page'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus());
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
  await userEvent.click(item('Text block'));
  await new Promise(r => setTimeout(r, 20));
  expect(screen.getByRole('textbox', { name: 'New block' })).toHaveFocus();
});

// A name tag's ⋯ sits at the block's left; a menu lined up with the button's right end would run off the
// window's left edge (and be pushed flush against it) whenever the block is near the left of the window.
test('a name tag’s ⋯ opens its menu from the button’s start, so it opens beside the block', async () => {
  const segs = layoutFor(get().S, get().doc).segs;
  const { unmount } = render(<TypedPage page={1} segs={segs} s={0.6} />);
  await openMenu('Options for Main text');
  expect(screen.getByRole('menu')).toHaveAttribute('data-align', 'start');
  await userEvent.keyboard('{Escape}');
  unmount();
  render(<PartMenu sg={segs.find(sg => sg.box.id === 'm' && sg.idx === 1)!} />);
  await openMenu('Options for Main text');
  expect(screen.getByRole('menu')).toHaveAttribute('data-align', 'start');
});
