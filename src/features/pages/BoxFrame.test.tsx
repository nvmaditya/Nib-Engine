// A block's part on the page: its name tag, keys and clicks act on the right thing.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import { hitWord, segTilt, srcOffset } from '@/engine/core.js';
import { layoutFor } from '@/features/doc/model';
import { flushSave } from '@/store/editor';
import { box, docOf, fieldsOf, get, lastToast, lines, open, words } from '@/test/docs';
import { BoxFrame } from './BoxFrame';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

beforeEach(async () => { await flushSave(); vi.mocked(sonner).mockClear(); });

// A header low on page 1, so its last line runs onto page 2.
const header = () => box({ id: 'h', kind: 'header', name: 'Header', x: 446, y: 1009, w: 320, fields: fieldsOf({ name: 'A', class: 'B', date: 'C' }) });
const part = (id: string, idx: number) => layoutFor(get().S, get().doc).segs.find(s => s.box.id === id && s.idx === idx)!;
const frame = (id: string, idx: number, mode: 'write' | 'style' = 'write', parts = 2) =>
  render(<BoxFrame sg={part(id, idx)} s={1} gap={34} selected parts={parts} mode={mode} />);
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

test.each(['text', 'note'] as const)('clicking the writing of a %s block puts the caret at the word under the pointer', kind => {
  open(docOf(box({ id: 'w', kind, name: 'W', x: 300, w: 300, text: words(30) })));
  const sg = part('w', 0), s = 0.5, paper = { left: 40, top: 30 };
  // A point on the writing as the engine lays it out (untilted): the left of the second row, just above where row 3 begins.
  const ux = sg.x + sg.w * 0.15, uy = sg.rows[1].ruleY + 7;
  const flat = { ...sg, box: { ...sg.box, kind: 'text' as const } }; // the same rows without the tilt
  const want = srcOffset(sg.box.text, hitWord(flat, ux, uy)!);
  // Where that point is on the page once a margin note's frame turns with its writing.
  const t = segTilt(sg), cx = sg.x + sg.w / 2, cy = (sg.top + sg.bottom) / 2;
  const px = cx + (ux - cx) * Math.cos(t) - (uy - cy) * Math.sin(t), py = cy + (ux - cx) * Math.sin(t) + (uy - cy) * Math.cos(t);
  if (kind === 'note') expect(srcOffset(sg.box.text, hitWord(flat, px, py)!)).not.toBe(want); // the tilt matters here
  const { container } = render(<div data-paper="0"><BoxFrame sg={sg} s={s} gap={34} parts={1} selected={false} mode="write" /></div>);
  container.querySelector<HTMLElement>('[data-paper]')!.getBoundingClientRect = () => ({ ...paper, right: 440, bottom: 600, width: 400, height: 570, x: 40, y: 30, toJSON: () => ({}) }) as DOMRect;
  const at = { clientX: paper.left + px * s, clientY: paper.top + py * s };
  const f = screen.getByRole('group', { name: 'W' });
  fireEvent.pointerDown(f, { ...at, button: 0, pointerId: 1 });
  fireEvent.pointerUp(f, { ...at, pointerId: 1 });
  fireEvent.click(f, at);
  expect(get().caret).toMatchObject({ boxId: 'w', offset: want });
  expect(get().selectedId).toBe('w');
});

test('in Style a part moves with the arrow keys but Delete does nothing', async () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: lines(40) })));
  frame('m', 0, 'style', 1);
  await press('{ArrowDown}');
  expect(get().doc.boxes[0].y).toBe(144);
  await press('{Delete}');
  expect(get().doc.boxes).toHaveLength(1);
});

test('in Style, a block with its own style wears the badge', () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: 'x', style: { size: 40 } })));
  frame('m', 0, 'style', 1);
  expect(screen.getByText('Own style')).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Main text' })).toHaveClass('own');
});

test('in Write, or without its own style, there is no badge', () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: 'x', style: { size: 40 } })));
  const w = frame('m', 0, 'write', 1);
  expect(screen.queryByText('Own style')).toBeNull();
  w.unmount();
  open(docOf(box({ id: 'm', name: 'Main text', text: 'x' })));
  frame('m', 0, 'style', 1);
  expect(screen.queryByText('Own style')).toBeNull();
});

const tagSizes = (paperWidth: number) => {
  const a = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('tag') ? 140 : 0; });
  const b = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return 'paper' in this.dataset ? paperWidth : 0; });
  return () => { a.mockRestore(); b.mockRestore(); };
};
const tagOf = (name: string) => screen.getByRole('group', { name }).querySelector<HTMLElement>('.tag')!;

test('the name tag shifts left to stay inside the page when it would run past the right edge', () => {
  open(docOf(box({ id: 'n', kind: 'note', name: 'Margin note', x: 150, w: 40, text: 'x', style: { size: 40 } })));
  const restore = tagSizes(200);
  try {
    render(<div data-paper=""><BoxFrame sg={part('n', 0)} s={1} gap={34} selected parts={1} mode="style" /></div>);
    expect(tagOf('Margin note').style.left).toBe('-90px'); // 200 - 150 - 140: its right end is at the page's edge
  } finally { restore(); }
});

test('the name tag stays where it is when it fits', () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: 'x' })));
  const restore = tagSizes(794);
  try {
    render(<div data-paper=""><BoxFrame sg={part('m', 0)} s={1} gap={34} selected parts={1} mode="style" /></div>);
    expect(tagOf('Main text').style.left).toBe('');
  } finally { restore(); }
});

test('a tag that still ends past the page once the note is turned is moved in by what is left over', () => {
  open(docOf(box({ id: 'n', kind: 'note', name: 'Margin note', x: 40, w: 40, text: 'x', style: { size: 40 } })));
  const restore = tagSizes(794);
  const rect = (right: number) => ({ left: 0, top: 0, bottom: 0, width: right, height: 0, x: 0, y: 0, right, toJSON() {} }) as DOMRect;
  const r = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if ('paper' in this.dataset) return rect(200);
    if (this.classList.contains('tag')) return rect(203 + (parseFloat(this.style.left || '0'))); // 3 px past the page
    return rect(0);
  });
  try {
    render(<div data-paper=""><BoxFrame sg={part('n', 0)} s={1} gap={34} selected parts={1} mode="style" /></div>);
    expect(tagOf('Margin note').style.left).toBe('-3px');
  } finally { r.mockRestore(); restore(); }
});
