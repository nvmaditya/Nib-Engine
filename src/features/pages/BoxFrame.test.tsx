// A block's part on the page: its tools act on the right thing.
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
const frame = (id: string, idx: number) => render(<BoxFrame sg={part(id, idx)} s={1} gap={34} selected touched={false} multi />);

test('a header on two pages has no Separate, and Delete deletes the header', async () => {
  open(docOf(header()));
  frame('h', 1);
  expect(screen.queryByRole('button', { name: 'Separate' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect([get().doc.boxes.length, lastToast()]).toEqual([0, 'Deleted “Header”.']);
});

test('the Delete key on a header’s later part deletes the header', async () => {
  open(docOf(header()));
  frame('h', 1);
  screen.getByRole('group').focus();
  await userEvent.keyboard('{Delete}');
  expect(get().doc.boxes).toHaveLength(0);
});

test('a text block’s later part can be separated, and Delete removes only that page’s part', async () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: lines(40) })));
  const { unmount } = frame('m', 1);
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect([get().doc.boxes[0].text, lastToast()]).toEqual([lines(28), 'Removed the page 2 part of “Main text”. The text after it moves up.']);
  unmount();
  open(docOf(box({ id: 'm', name: 'Main text', text: lines(40) })));
  frame('m', 1);
  await userEvent.click(screen.getByRole('button', { name: 'Separate' }));
  expect(get().doc.boxes.map(b => b.name)).toEqual(['Main text', 'Main text (continued)']);
});
