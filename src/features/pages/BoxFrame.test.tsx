// A block's part on the page: its name tag and keys act on the right thing.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import { layoutFor } from '@/features/doc/model';
import { flushSave } from '@/store/editor';
import { box, docOf, get, lastToast, lines, open } from '@/test/docs';
import { BoxFrame } from './BoxFrame';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

beforeEach(async () => { await flushSave(); vi.mocked(sonner).mockClear(); });

// A header low on page 1, so its last line runs onto page 2.
const header = () => box({ id: 'h', kind: 'header', name: 'Header', x: 446, y: 1009, w: 320, fields: { name: 'A', class: 'B', date: 'C' } });
const part = (id: string, idx: number) => layoutFor(get().S, get().doc).segs.find(s => s.box.id === id && s.idx === idx)!;
const frame = (id: string, idx: number, mode: 'write' | 'style' = 'write') =>
  render(<BoxFrame sg={part(id, idx)} s={1} gap={34} selected parts={2} mode={mode} />);
const press = async (key: string) => { screen.getByRole('group').focus(); await userEvent.keyboard(key); };

test('the name tag holds the Move grip, the name and which part it is', () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: lines(40) })));
  frame('m', 1);
  expect(screen.getByRole('button', { name: 'Move Main text' })).toBeInTheDocument();
  expect(screen.getByText('Main text')).toBeInTheDocument();
  expect(screen.getByText('2 of 2')).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Main text, part 2 of 2' })).toBeInTheDocument();
});

test('the Delete key on a header’s later part deletes the header', async () => {
  open(docOf(header()));
  frame('h', 1);
  await press('{Delete}');
  expect([get().doc.boxes.length, lastToast()]).toEqual([0, 'Deleted “Header”.']);
});

test('the Delete key on a text block’s later part removes only that page’s part', async () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: lines(40) })));
  frame('m', 1);
  await press('{Delete}');
  expect([get().doc.boxes[0].text, lastToast()]).toEqual([lines(28), 'Removed the page 2 part of “Main text”. The text after it moves up.']);
});

test('Enter on a part asks for the caret where that part’s text starts', async () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: lines(40) })));
  frame('m', 1);
  await press('{Enter}');
  expect(get().caret).toMatchObject({ boxId: 'm', offset: lines(40).indexOf('line29') });
});

test('in Style a part moves with the arrow keys but Delete does nothing', async () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: lines(40) })));
  frame('m', 0, 'style');
  await press('{ArrowDown}');
  expect(get().doc.boxes[0].y).toBe(144);
  await press('{Delete}');
  expect(get().doc.boxes).toHaveLength(1);
});
