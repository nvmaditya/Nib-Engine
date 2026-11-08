// The header field editor on its own: a list held the way a header holds it, and every change it asks for.
import { useMemo, useRef, useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HEADER_LIMITS, headerLabel } from '@/engine/doc.js';
import type { HeaderField } from '@/engine/types';
import { FieldEditor, type FieldOps } from './HeaderFields';

const F = (...labels: string[]): HeaderField[] => labels.map((label, i) => ({ id: 'i' + i, label, value: '' }));

/** Every change the editor asked for, in order. */
let calls: unknown[][] = [];
/** Changes the list from outside the editor, as Undo or another tab would. */
let outside: (fn: (list: HeaderField[]) => HeaderField[]) => void = () => {};

/** The list in state, changed the way a header changes it. */
function Harness({ start, compact }: { start: HeaderField[]; compact?: boolean }) {
  const [list, setList] = useState(start);
  const live = useRef(list);
  const added = useRef(0);
  const ops = useMemo((): FieldOps => {
    const change = (next: HeaderField[]) => { live.current = next; setList(next); };
    outside = fn => change(fn(live.current));
    return {
      setValue(id, value) { calls.push(['setValue', id, value]); change(live.current.map(f => (f.id === id ? { ...f, value } : f))); },
      add(field) {
        calls.push(['add', field]);
        if (live.current.length >= HEADER_LIMITS.fields) return null;
        const id = `n${++added.current}`;
        change([...live.current, { id, label: headerLabel(field.label), value: field.today ? '7 November 2026' : '', ...(field.today && { today: true as const }) }]);
        return id;
      },
      rename(id, label) { calls.push(['rename', id, label]); change(live.current.map(f => (f.id === id ? { ...f, label: headerLabel(label) } : f))); },
      remove(id) { calls.push(['remove', id]); if (live.current.length > 1) change(live.current.filter(f => f.id !== id)); },
      move(id, to) {
        calls.push(['move', id, to]);
        const next = [...live.current], i = next.findIndex(f => f.id === id);
        if (i < 0) return;
        next.splice(to, 0, ...next.splice(i, 1));
        change(next);
      },
    };
  }, []);
  return <FieldEditor fields={list} ops={ops} compact={compact} />;
}

beforeEach(() => { calls = []; });
afterEach(() => { vi.restoreAllMocks(); });

const items = () => within(screen.getByRole('menu')).getAllByRole('menuitem').map(e => e.textContent);
const item = (name: string) => screen.getByRole('menuitem', { name });
const button = (name: string) => screen.getByRole('button', { name });
const box = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;
/** The rows' labels, top to bottom. */
const labels = () => [...document.querySelectorAll<HTMLElement>('[data-field-value]')].map(e => e.getAttribute('aria-label'));
/** Lets the moment pass in which a closed menu would put the focus back on its button. */
const settle = () => act(() => new Promise(r => setTimeout(r, 0)));
/** Chooses `name` from the menu `menu` opens. */
async function choose(menu: string, name: string) {
  await userEvent.click(button(menu));
  await userEvent.click(item(name));
  await settle();
}

test('Tab goes name, value, ⋯ along each row, then Add field; each has a focus ring', async () => {
  render(<Harness start={F('Name', 'Class')} />);
  const order = ['Rename “Name”', 'Name', 'More for “Name”', 'Rename “Class”', 'Class', 'More for “Class”', 'Add field'];
  for (const name of order) { await userEvent.tab(); expect(document.activeElement).toHaveAccessibleName(name); }
  expect(screen.getByRole('button', { name: 'Rename “Name”' })).toHaveClass('focus-visible:ring-2');
  expect(screen.getByRole('img', { name: 'Move “Name”' })).toBeInTheDocument();
  for (const el of [button('Rename “Name”'), box('Name'), button('More for “Name”'), button('Add field')]) {
    expect(el).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-ring/50');
  }
});

test('Remove: the focus goes to the next row’s value, or the previous one’s when it was the last', async () => {
  render(<Harness start={F('Name', 'Class', 'Date')} />);
  await userEvent.click(screen.getByRole('button', { name: 'More for “Class”' })); await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
  await settle();
  expect(screen.getByRole('textbox', { name: 'Date' })).toHaveFocus();
  await userEvent.click(screen.getByRole('button', { name: 'More for “Date”' })); await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
  await settle();
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  expect(calls).toEqual([['remove', 'i1'], ['remove', 'i2']]);
  expect(labels()).toEqual(['Name']);
});

test('rename: clicking the name opens it in place, selected; Enter keeps it and gives the focus back to the name', async () => {
  render(<Harness start={F('Name', 'Class', 'Date')} />);
  await userEvent.click(button('Rename “Class”'));
  const input = box('Field name');
  expect(input).toHaveFocus();
  expect([input.value, input.selectionStart, input.selectionEnd, input.maxLength]).toEqual(['Class', 0, 5, 30]);
  await userEvent.keyboard('Section{Enter}');
  expect(calls).toEqual([['rename', 'i1', 'Section']]);
  expect(button('Rename “Section”')).toHaveFocus();
  expect(screen.queryByRole('textbox', { name: 'Field name' })).toBeNull();
  expect(labels()).toEqual(['Name', 'Section', 'Date']);
});

test('Esc puts the old name back, and the key goes no further', async () => {
  const seen = vi.fn((e: KeyboardEvent) => e.key);
  document.addEventListener('keydown', seen);
  try {
    render(<Harness start={F('Name', 'Class', 'Date')} />);
    await userEvent.click(button('Rename “Class”'));
    await userEvent.keyboard('Sec{Escape}');
    expect(seen.mock.results.map(r => r.value)).not.toContain('Escape');
    expect(calls).toEqual([]);
    expect(button('Rename “Class”')).toHaveFocus();
    expect(screen.queryByRole('textbox', { name: 'Field name' })).toBeNull();
  } finally {
    document.removeEventListener('keydown', seen);
  }
});

test('an empty name becomes Field; leaving the name keeps what was typed', async () => {
  render(<Harness start={F('Name', 'Class')} />);
  await userEvent.click(button('Rename “Class”'));
  await userEvent.keyboard('{Backspace}{Enter}');
  expect(calls).toEqual([['rename', 'i1', '']]);
  expect(button('Rename “Field”')).toHaveFocus();
  await userEvent.click(button('Rename “Name”'));
  await userEvent.keyboard('Student');
  await userEvent.tab();
  expect(calls).toEqual([['rename', 'i1', ''], ['rename', 'i0', 'Student']]);
  expect(screen.queryByRole('textbox', { name: 'Field name' })).toBeNull();
  expect(box('Student')).toHaveFocus(); // where Tab went: leaving the name doesn't move the focus
  expect(labels()).toEqual(['Student', 'Field']);
});

test('the row menu: Rename, Move up, Move down, Remove; the first row can’t go up and the last can’t go down', async () => {
  render(<Harness start={F('Name', 'Class', 'Date')} />);
  await userEvent.click(button('More for “Name”'));
  expect(items()).toEqual(['Rename', 'Move up', 'Move down', 'Remove']);
  expect(item('Move up')).toHaveAttribute('aria-disabled', 'true');
  expect(item('Move down')).not.toHaveAttribute('aria-disabled');
  await userEvent.keyboard('{Escape}');
  await userEvent.click(button('More for “Date”'));
  expect(item('Move up')).not.toHaveAttribute('aria-disabled');
  expect(item('Move down')).toHaveAttribute('aria-disabled', 'true');
  expect(item('Remove')).not.toHaveAttribute('aria-disabled');
  await userEvent.keyboard('{Escape}');
  await choose('More for “Date”', 'Rename');
  const input = box('Field name');
  expect([input, input.value, input.selectionStart, input.selectionEnd]).toEqual([document.activeElement, 'Date', 0, 4]);
  expect(calls).toEqual([]);
});

test('Move up and Move down keep the focus on the moved row’s ⋯', async () => {
  render(<Harness start={F('Name', 'Class', 'Date')} />);
  await choose('More for “Class”', 'Move up');
  expect(labels()).toEqual(['Class', 'Name', 'Date']);
  expect(button('More for “Class”')).toHaveFocus();
  await choose('More for “Class”', 'Move down');
  expect(labels()).toEqual(['Name', 'Class', 'Date']);
  expect(button('More for “Class”')).toHaveFocus();
  await choose('More for “Class”', 'Move down');
  expect(labels()).toEqual(['Name', 'Date', 'Class']);
  expect(button('More for “Class”')).toHaveFocus();
  expect(calls).toEqual([['move', 'i1', 0], ['move', 'i1', 1], ['move', 'i1', 2]]);
});

test('the last field can’t be removed, and says why', async () => {
  render(<Harness start={F('Name')} />);
  await userEvent.click(button('More for “Name”'));
  const remove = item('Remove');
  expect(remove).toHaveAttribute('aria-disabled', 'true');
  expect(remove).toHaveAttribute('title', 'A header needs at least one field.');
  expect(remove).toHaveClass('data-[disabled]:pointer-events-auto');
  expect(item('Move up')).toHaveAttribute('aria-disabled', 'true');
  expect(item('Move down')).toHaveAttribute('aria-disabled', 'true');
  await userEvent.click(remove);
  expect(calls).toEqual([]);
});

test('Add field offers the common fields the header doesn’t have, then Custom field…', async () => {
  render(<Harness start={F('Name', ' class ', 'Date')} />);
  await userEvent.click(button('Add field'));
  expect(items()).toEqual(['Section', 'Subject', 'Roll no.', 'Registration no.', 'Teacher', 'School', 'Custom field…']);
  const menu = screen.getByRole('menu'), seps = within(menu).getAllByRole('separator', { hidden: true });
  expect(seps).toHaveLength(1);
  expect(seps[0].nextElementSibling).toBe(item('Custom field…'));
  await userEvent.keyboard('{Escape}');
});

test('with every common field there, Add field offers only Custom field…, with no separator', async () => {
  render(<Harness start={F('NAME', 'Class', 'Section', 'Subject', 'Roll no.', 'Registration no.', 'Date', 'Teacher', 'school')} />);
  await userEvent.click(button('Add field'));
  expect(items()).toEqual(['Custom field…']);
  expect(within(screen.getByRole('menu')).queryAllByRole('separator', { hidden: true })).toHaveLength(0);
  await userEvent.keyboard('{Escape}');
});

test('Adding a common field focuses its value; Date comes marked as today', async () => {
  render(<Harness start={F('Name', 'Class')} />);
  await choose('Add field', 'Registration no.');
  expect(calls).toStrictEqual([['add', { label: 'Registration no.' }]]);
  expect(box('Registration no.')).toHaveFocus();
  await choose('Add field', 'Date');
  expect(calls[1]).toStrictEqual(['add', { label: 'Date', today: true }]);
  expect(box('Date')).toHaveFocus();
  expect(labels()).toEqual(['Name', 'Class', 'Registration no.', 'Date']);
});

test('Custom field… adds Field with its name open and selected', async () => {
  render(<Harness start={F('Name', 'Class')} />);
  await choose('Add field', 'Custom field…');
  expect(calls).toStrictEqual([['add', { label: 'Field' }]]);
  const input = box('Field name');
  expect(input).toHaveFocus();
  expect([input.value, input.selectionStart, input.selectionEnd]).toEqual(['Field', 0, 5]);
  await userEvent.keyboard('Teacher’s name{Enter}');
  expect(calls[1]).toEqual(['rename', 'n1', 'Teacher’s name']);
  expect(button('Rename “Teacher’s name”')).toHaveFocus();
  expect(labels()).toEqual(['Name', 'Class', 'Teacher’s name']);
});

test('at 12 fields Add field is off and says why', async () => {
  render(<Harness start={F(...'abcdefghijk')} />);
  expect(button('Add field')).toBeEnabled();
  expect(button('Add field')).not.toHaveAttribute('title');
  await choose('Add field', 'Name');
  expect(labels()).toHaveLength(12);
  const add = button('Add field');
  expect(add).toBeDisabled();
  expect(add).toHaveAttribute('title', 'A header holds up to 12 fields.');
  expect(add).toHaveClass('disabled:pointer-events-auto');
  // A press still reaches it (it keeps its pointer events for the tooltip, and Chromium sends a disabled button
  // pointer events): it opens nothing.
  fireEvent.pointerDown(add, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  expect(screen.queryByRole('menu')).toBeNull();
});

/**
 * Lays the rows out `h` px tall from the top of the window, and finds what is under a point by them: a row's value,
 * or with `squares` (a phone's typed page, lines closer together than the 44 px squares) what Chromium finds in the
 * grip column (x < 20): the next row's grip, whose square is on top over the whole line, and on the last line its
 * own; past the first and last lines (within `reach` px) the square of the row next to the end.
 */
function layRows(h: number, { squares = false, reach = 0 } = {}): HTMLElement[] {
  const rows = [...document.querySelectorAll<HTMLElement>('[data-drop-field]')];
  rows.forEach((el, i) => {
    el.getBoundingClientRect = () => ({ x: 0, y: i * h, top: i * h, bottom: i * h + h, left: 0, right: 300, width: 300, height: h, toJSON: () => ({}) }) as DOMRect;
  });
  const grip = (i: number) => rows[i].querySelector('[role="img"]');
  vi.spyOn(document, 'elementFromPoint').mockImplementation((x, y) => {
    const i = Math.floor(y / h), last = rows.length - 1;
    if (squares && x < 20) {
      if (y < 0) return y >= -reach ? grip(Math.min(1, last)) : null;
      if (i > last) return y < rows.length * h + reach ? grip(last) : null;
      return grip(Math.min(i + 1, last));
    }
    return i >= 0 && i <= last ? rows[i].querySelector('input') : null;
  });
  return rows;
}

test('dragging a row’s grip onto another row moves it there', async () => {
  render(<Harness start={F('Name', 'Class', 'Date')} />);
  const rows = layRows(30); // Name 0–30, Class 30–60, Date 60–90
  box('Class').focus();
  const grip = screen.getByRole('img', { name: 'Move “Name”' });
  const user = userEvent.setup(); // one pointer, pressed in one call and released in another
  const drag = (y: number) => user.pointer([
    { keys: '[MouseLeft>]', target: grip, coords: { clientX: 5, clientY: 15 } },
    { target: grip, coords: { clientX: 5, clientY: 15 + (y - 15) / 2 } },
    { target: grip, coords: { clientX: 5, clientY: y } },
  ]);
  const release = (y: number) => user.pointer({ keys: '[/MouseLeft]', target: grip, coords: { clientX: 5, clientY: y } });

  await drag(22); // back on its own row
  expect(document.body.lastElementChild).toHaveTextContent('Name'); // the ghost
  expect(rows[0].dataset.drop).toBe('after');
  await release(22);
  expect(calls).toEqual([]);

  await drag(80); // below Date's middle
  expect([rows[0].dataset.drop, rows[2].dataset.drop]).toEqual([undefined, 'after']);
  await release(80);
  expect(calls).toEqual([['move', 'i0', 2]]);
  expect(labels()).toEqual(['Class', 'Date', 'Name']);
  expect(rows[2].dataset.drop).toBeUndefined();
  expect(box('Class')).toHaveFocus();
  await settle(); // the click the drag ended with is swallowed for this moment only
});

test('on a phone’s typed page, a press in a grip’s or ⋯’s 44 px square is for the row whose line it is on', async () => {
  render(<Harness start={F('Name', 'Class', 'Date')} compact />);
  layRows(15); // lines closer together than the squares: Class's squares reach over Name's line and Date's
  const user = userEvent.setup();
  await user.pointer({ keys: '[MouseLeft]', target: button('More for “Class”'), coords: { clientX: 290, clientY: 7 } });
  // (an open menu hides the rest from the accessibility tree)
  expect(screen.getByRole('button', { name: 'More for “Name”', hidden: true })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: 'More for “Class”', hidden: true })).toHaveAttribute('aria-expanded', 'false');
  expect(item('Move up')).toHaveAttribute('aria-disabled', 'true'); // Name's menu: the first row's
  await user.keyboard('{Escape}');
  await settle();
  await user.pointer({ keys: '[MouseLeft]', target: button('More for “Class”'), coords: { clientX: 290, clientY: 22 } });
  expect(screen.getByRole('button', { name: 'More for “Class”', hidden: true })).toHaveAttribute('aria-expanded', 'true'); // on its own line, its own
  await user.keyboard('{Escape}');
  await settle();
  const grip = screen.getByRole('img', { name: 'Move “Class”' });
  await user.pointer([
    { keys: '[MouseLeft>]', target: grip, coords: { clientX: 5, clientY: 7 } },
    { target: grip, coords: { clientX: 5, clientY: 25 } },
    { target: grip, coords: { clientX: 5, clientY: 40 } },
    { keys: '[/MouseLeft]', target: grip, coords: { clientX: 5, clientY: 40 } },
  ]);
  expect(calls).toEqual([['move', 'i0', 2]]); // Name's line: Name went below Date
  await settle();
});

test('on a phone’s typed page, a grip drag drops on the row whose line the pointer is on, not the square on top there', async () => {
  render(<Harness start={F('Name', 'Class', 'Date')} compact />);
  const rows = layRows(15, { squares: true }); // Name 0–15, Class 15–30, Date 30–45
  const user = userEvent.setup();
  const grip = screen.getByRole('img', { name: 'Move “Name”' });
  const drag = (from: number, to: number) => user.pointer([
    { keys: '[MouseLeft>]', target: grip, coords: { clientX: 5, clientY: from } },
    { target: grip, coords: { clientX: 5, clientY: (from + to) / 2 } },
    { target: grip, coords: { clientX: 5, clientY: to } },
  ]);
  const release = (y: number) => user.pointer({ keys: '[/MouseLeft]', target: grip, coords: { clientX: 5, clientY: y } });
  await drag(7, 18); // Name onto Class's upper half (where Date's square is on top): before Class, where it is
  expect(rows.map(r => r.dataset.drop)).toEqual([undefined, 'before', undefined]);
  await release(18);
  expect(calls).toEqual([]);
  await settle();
  await drag(37, 3); // Date onto Name's line (where Class's square is on top): to the top
  expect(rows.map(r => r.dataset.drop)).toEqual(['before', undefined, undefined]);
  await release(3);
  expect(calls).toEqual([['move', 'i2', 0]]);
  expect(labels()).toEqual(['Date', 'Name', 'Class']);
  await settle();
});

test('a press just past the first or last line is for the row at that end', async () => {
  render(<Harness start={F('Name', 'Class', 'Date')} compact />);
  layRows(10, { squares: true, reach: 7 }); // lines so close that Class's squares reach past Name's line and Date's
  const user = userEvent.setup();
  const expanded = () => screen.getAllByRole('button', { name: /^More for/, hidden: true }).filter(b => b.getAttribute('aria-expanded') === 'true')
    .map(b => b.getAttribute('aria-label'));
  await user.pointer({ keys: '[MouseLeft]', target: button('More for “Class”'), coords: { clientX: 290, clientY: -4 } });
  expect(expanded()).toEqual(['More for “Name”']);
  await user.keyboard('{Escape}');
  await settle();
  await user.pointer({ keys: '[MouseLeft]', target: button('More for “Class”'), coords: { clientX: 290, clientY: 33 } });
  expect(expanded()).toEqual(['More for “Date”']);
  await user.keyboard('{Escape}');
  await settle();
  const grip = screen.getByRole('img', { name: 'Move “Class”' });
  await user.pointer([
    { keys: '[MouseLeft>]', target: grip, coords: { clientX: 5, clientY: 33 } },
    { target: grip, coords: { clientX: 5, clientY: 15 } },
    { target: grip, coords: { clientX: 5, clientY: -4 } },
    { keys: '[/MouseLeft]', target: grip, coords: { clientX: 5, clientY: -4 } },
  ]);
  expect(calls).toEqual([['move', 'i2', 0]]); // Date, pressed past the last line, dropped past the first
  await settle();
});

test('a name being typed is kept when the editor goes, and nothing happens when its field went first', async () => {
  const { unmount } = render(<Harness start={F('Name', 'Class')} />);
  await userEvent.click(button('Rename “Class”'));
  await userEvent.keyboard('Sec');
  unmount();
  expect(calls).toEqual([['rename', 'i1', 'Sec']]);

  calls = [];
  render(<Harness start={F('Name', 'Class')} />);
  await userEvent.click(button('Rename “Class”'));
  await userEvent.keyboard('Sec');
  act(() => outside(list => list.filter(f => f.id !== 'i1')));
  expect(calls).toEqual([]);
  expect(labels()).toEqual(['Name']);
  expect(screen.queryByRole('textbox', { name: 'Field name' })).toBeNull();
  // The same field coming back (Redo, say) comes back as a row, not with its name open.
  act(() => outside(list => [...list, { id: 'i1', label: 'Class', value: '' }]));
  expect(labels()).toEqual(['Name', 'Class']);
  expect(screen.queryByRole('textbox', { name: 'Field name' })).toBeNull();
});

test('on phones the ⋯ and the grip are 44 px', () => {
  const { unmount } = render(<Harness start={F('Name')} />);
  expect(button('More for “Name”')).toHaveClass('size-11', 'wide:size-7');
  const grip = screen.getByRole('img', { name: 'Move “Name”' });
  expect(grip).toHaveClass('size-11', 'wide:size-[26px]', 'touch-none');
  expect(grip).toHaveAttribute('data-vaul-no-drag');
  unmount();
  render(<Harness start={F('Name')} compact />);
  for (const el of [button('More for “Name”'), screen.getByRole('img', { name: 'Move “Name”' })]) {
    expect(el).toHaveClass('size-[1em]', 'before:size-11', 'wide:before:hidden', 'before:absolute', 'relative');
  }
  expect(screen.getByRole('img', { name: 'Move “Name”' })).toHaveClass('touch-none');
  expect(screen.getByRole('img', { name: 'Move “Name”' })).toHaveAttribute('data-vaul-no-drag');
  // A style while pressed makes Chromium count the grip as something to tap, so a touch on it isn't moved onto the
  // label beside it (its touch adjustment); hover styles don't count on a phone.
  expect(screen.getByRole('img', { name: 'Move “Name”' })).toHaveClass('active:text-fg');
  // The squares stop at the header's first and last lines, so a block under the header keeps its taps: the rows'
  // grid clips them (keeping 3 px for the focus rings, and room at the sides).
  expect(document.querySelector('[data-drop-field]')!.parentElement).toHaveClass('[clip-path:inset(-3px_-24px)]');
});

test('the squares are only clipped on the typed page', () => {
  render(<Harness start={F('Name')} />);
  expect(document.querySelector('[data-drop-field]')!.parentElement).not.toHaveClass('[clip-path:inset(-3px_-24px)]');
});

test('a long label is cut short with an ellipsis, its full name its title; on the typed page the value keeps at least 55% of the row', () => {
  const long = 'Registration number for school'; // 30 characters, the most a label holds
  for (const compact of [false, true]) {
    const { unmount } = render(<Harness start={F(long, 'Name')} compact={compact} />);
    const label = button(`Rename “${long}”`); // (the name it is pressed by is unchanged)
    expect(label).toHaveTextContent(long);
    expect(label).toHaveAttribute('title', long);
    expect(label).toHaveClass('min-w-0', 'truncate');
    unmount();
  }
  // On the typed page the label column is at most 45% of what the label and the value share: the row less the grip,
  // the ⋯ (1em each) and the three gaps between the four columns (0.4em each).
  render(<Harness start={F(long, 'Name')} compact />);
  const grid = document.querySelector('[data-drop-field]')!.parentElement!;
  expect(grid).toHaveClass('grid-cols-[auto_fit-content(calc((100%_-_3.2em)*0.45))_minmax(0,1fr)_auto]', 'gap-x-[0.4em]');
  expect(screen.getByRole('img', { name: `Move “${long}”` })).toHaveClass('size-[1em]');
  expect(button(`More for “${long}”`)).toHaveClass('size-[1em]');
});

test('compact: Add field sits just under the fields, shown while they have the focus or the pointer, or the header is selected', () => {
  const { container } = render(<Harness start={F('Name', 'Class')} compact />);
  expect(container.firstElementChild).toHaveClass('relative', 'group/fields');
  expect(button('Add field')).toHaveClass('absolute', 'top-full', 'left-0', 'invisible', 'group-focus-within/fields:visible', 'group-hover/fields:visible',
    'data-[state=open]:visible', 'in-[.selected]:visible');
  expect(button('Add field')).toHaveClass('h-6', 'wide:h-5'); // 24 px to press on a phone (WCAG 2.5.8), the name tag's 20 px from wide up
  // The grip and the ⋯ show on hover or focus, and always where there is no hover.
  for (const el of [button('More for “Name”'), screen.getByRole('img', { name: 'Move “Name”' })]) {
    expect(el).toHaveClass('opacity-0', '[@media(hover:none)]:opacity-100');
  }
});
