// The Style panel's header: the scope switch, its line, Match document and New variation.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import { resetBoxStyle, select } from '@/features/doc/actions';
import { flushSave, undo, update } from '@/store/editor';
import { box, docOf, get, lastToast, open } from '@/test/docs';
import { ScopeBar, ownStyleLine } from './ScopeBar';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

beforeEach(async () => { await flushSave(); vi.mocked(sonner).mockClear(); });

// Select a block and set the panel to it alone.
const styleBox = (id: string) => act(() => { select(id); update(s => { s.scope = 'box'; }, { save: false, layout: false }); });

test('with no block selected, changes go to the whole document', () => {
  open(docOf(box({ name: 'Main text' })));
  act(() => select(null));
  render(<ScopeBar />);
  expect(screen.getByText('Changes apply to the whole document. Click a block on the page to style it on its own.')).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Apply changes to' })).toBeNull();
});

test('the switch names the selected block', async () => {
  open(docOf(box({ id: 'n', name: 'Main text' })));
  act(() => select('n'));
  render(<ScopeBar />);
  expect(screen.getByRole('button', { name: 'Whole document' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Changes apply to the whole document.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Only “Main text”' }));
  expect(get().scope).toBe('box');
  expect(screen.getByText('Changes here affect only this block.')).toBeInTheDocument();
  expect(get().canUndo).toBe(false);
});

test('blocks with their own style are named', () => {
  expect(ownStyleLine(['A'])).toBe('“A” keeps its own style.');
  expect(ownStyleLine(['A', 'B'])).toBe('“A” and “B” keep their own style.');
  expect(ownStyleLine(['A', 'B', 'C'])).toBe('“A”, “B” and “C” keep their own style.');
  expect(ownStyleLine([])).toBe('');
});

test('the whole-document line names blocks that keep their own style', () => {
  open(docOf(box({ id: 'a', name: 'A', style: { size: 40 } }), box({ id: 'b', name: 'B' })));
  act(() => select('b'));
  render(<ScopeBar />);
  expect(screen.getByText('“A” keeps its own style.')).toBeInTheDocument();
});

test('Match document takes away the block’s own style, as one step with Undo', async () => {
  open(docOf(box({ id: 'n', name: 'Margin note', style: { size: 40 }, shuffle: 3 })));
  styleBox('n');
  render(<ScopeBar />);
  expect(screen.getByText('This block has its own style.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Match document' }));
  expect([get().doc.boxes[0].style, get().doc.boxes[0].shuffle]).toEqual([{}, 0]);
  expect(lastToast()).toBe('This block matches the document again.');
  act(() => undo());
  expect(get().doc.boxes[0].style).toEqual({ size: 40 });
});

test('New variation re-rolls the document, or only the block', async () => {
  open(docOf(box({ id: 'n' })));
  act(() => select('n'));
  render(<ScopeBar />);
  const seed = get().S.seed;
  await userEvent.click(screen.getByRole('button', { name: /New variation/ }));
  expect(get().S.seed).not.toBe(seed);
  expect(get().doc.boxes[0].shuffle).toBe(0);
  styleBox('n');
  const s2 = get().S.seed;
  await userEvent.click(screen.getByRole('button', { name: /New variation/ }));
  expect(get().S.seed).toBe(s2);
  expect(get().doc.boxes[0].shuffle).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /New variation/ })).toHaveAttribute('title', 'Draw this block with new random shapes');
  act(() => undo());
  expect(get().doc.boxes[0].shuffle).toBe(0);
});

test('Match document on a block with no own style records nothing', () => {
  open(docOf(box({ id: 'n' })));
  styleBox('n');
  act(() => resetBoxStyle());
  expect(get().canUndo).toBe(false);
  expect(lastToast()).toBeUndefined();
});

test('New variation for the whole document is one step; Undo restores the seed', async () => {
  open(docOf(box({ id: 'n' })));
  render(<ScopeBar />);
  const seed = get().S.seed;
  await userEvent.click(screen.getByRole('button', { name: /New variation/ }));
  expect(get().S.seed).not.toBe(seed);
  act(() => undo());
  expect(get().S.seed).toBe(seed);
});

test('the page notice sits right under the title row, above the scope switch', () => {
  open(docOf(box({ id: 'n', name: 'Main text' })));
  act(() => select('n'));
  render(<ScopeBar notice={<p>Now 3 pages (was 2)</p>} />);
  const after = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const notice = screen.getByText('Now 3 pages (was 2)');
  expect(after(screen.getByRole('button', { name: /New variation/ }), notice)).toBe(true);
  expect(after(notice, screen.getByRole('group', { name: 'Apply changes to' }))).toBe(true);
});
