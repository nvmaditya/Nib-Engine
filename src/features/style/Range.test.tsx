// One step per real change in Style: a slider, or the colour picker, moved and moved back before it is left records nothing.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { LIMITS } from '@/engine/config.js';
import type { Settings } from '@/engine/types';
import { view } from '@/features/doc/actions';
import { flushSave, redo, undo, update, useEditor } from '@/store/editor';
import { box, docOf, get, open } from '@/test/docs';
import { PenInkSection } from './PenInkSection';
import { Range } from './Range';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));

beforeEach(async () => { await flushSave(); localStorage.clear(); });
const cleanups: (() => void)[] = [];
afterEach(() => { while (cleanups.length) cleanups.pop()!(); });

function Live({ id }: { id: keyof typeof LIMITS }) { useEditor(s => s.version); return <Range id={id} V={view() as Settings} />; }
function Ink() { useEditor(s => s.version); return <PenInkSection V={view() as Settings} />; }
const thumb = () => screen.getByRole('slider', { name: 'Letter size' });

test('a slider moved and moved back, then left, records nothing', async () => {
  open(docOf(box())); render(<Live id="size" />);
  act(() => thumb().focus());
  await userEvent.keyboard('{ArrowRight}{ArrowLeft}');
  act(() => thumb().blur());
  expect(get().S.size).toBe(30); expect(get().canUndo).toBe(false);
});

test('…moved once is one step', async () => {
  open(docOf(box())); render(<Live id="size" />);
  act(() => thumb().focus());
  await userEvent.keyboard('{ArrowRight}');
  act(() => thumb().blur());
  expect(get().S.size).toBe(31); expect(get().canUndo).toBe(true);
  act(() => undo()); expect(get().S.size).toBe(30); expect(get().canUndo).toBe(false);
});

test('…and moved on, then partly back, keeps the presses that were not taken back', async () => {
  open(docOf(box())); render(<Live id="size" />);
  act(() => thumb().focus());
  await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowLeft}');
  act(() => thumb().blur());
  expect(get().S.size).toBe(31);
  act(() => undo()); expect(get().S.size).toBe(30); expect(get().canUndo).toBe(false);
});

test('Right, Right, Left, Left leaves none, and Redo comes back', async () => {
  open(docOf(box())); render(<Live id="size" />);
  act(() => { update(s => { s.S.size = 31; }); undo(); }); // Redo would give 31
  act(() => thumb().focus());
  await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowLeft}{ArrowLeft}');
  expect(get()).toMatchObject({ canUndo: false, canRedo: true }); // already, before the slider is left
  act(() => thumb().blur());
  expect(get().S.size).toBe(30); expect(get()).toMatchObject({ canUndo: false, canRedo: true });
  act(() => redo()); expect(get().S.size).toBe(31);
});

test('Right ×3, Left ×3 leaves none', async () => {
  open(docOf(box())); render(<Live id="size" />);
  act(() => thumb().focus());
  await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
  act(() => thumb().blur());
  expect(get().S.size).toBe(30); expect(get().canUndo).toBe(false);
});

test('another edit in between ends the joining', async () => {
  open(docOf(box())); render(<Live id="size" />);
  act(() => thumb().focus());
  await userEvent.keyboard('{ArrowRight}');
  act(() => update(s => { s.S.gap = 40; }));
  await userEvent.keyboard('{ArrowLeft}');
  act(() => thumb().blur());
  expect(get().S).toMatchObject({ size: 30, gap: 40 });
  act(() => undo()); expect(get().S).toMatchObject({ size: 31, gap: 40 });
  act(() => undo()); expect(get().S.gap).toBe(34);
  act(() => undo()); expect(get().S.size).toBe(30); expect(get().canUndo).toBe(false); // three steps
});

test('…but the presses after it can be taken back, as each is the newest step', async () => {
  open(docOf(box())); render(<Live id="size" />);
  act(() => thumb().focus());
  await userEvent.keyboard('{ArrowRight}');
  act(() => update(s => { s.S.gap = 40; }));
  await userEvent.keyboard('{ArrowLeft}{ArrowRight}');
  act(() => thumb().blur());
  expect(get().S).toMatchObject({ size: 31, gap: 40 });
  act(() => undo()); expect(get().S).toMatchObject({ size: 31, gap: 34 });
  act(() => undo()); expect(get().S.size).toBe(30); expect(get().canUndo).toBe(false); // two steps: the first Right, and the gap
});

test('a slider dragged and brought back to where it began, then let go, records nothing', () => {
  open(docOf(box())); render(<Live id="size" />);
  // jsdom has no layout or pointer capture: the slider is as many pixels wide as Letter size has steps (18–44).
  const root = thumb().closest<HTMLElement>('[data-slot="slider"]')!;
  root.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 26, height: 20, right: 26, bottom: 20, toJSON: () => ({}) });
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  for (const m of ['setPointerCapture', 'releasePointerCapture']) proto[m] = () => {};
  proto.hasPointerCapture = () => true;
  cleanups.push(() => { for (const m of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) delete proto[m]; });
  fireEvent.pointerDown(root, { pointerId: 1, clientX: 31 - 18 }); expect(get().S.size).toBe(31);
  fireEvent.pointerMove(root, { pointerId: 1, clientX: 36 - 18 }); expect(get().S.size).toBe(36);
  fireEvent.pointerMove(root, { pointerId: 1, clientX: 30 - 18 }); fireEvent.pointerUp(root, { pointerId: 1, clientX: 30 - 18 });
  expect(get().S.size).toBe(30); expect(get()).toMatchObject({ canUndo: false, canRedo: false }); // at once, with the slider still focused
  act(() => undo()); expect(get()).toMatchObject({ canUndo: false, canRedo: false }); // so Undo has nothing to turn into a Redo
  act(() => thumb().blur());
  expect(get().S.size).toBe(30); expect(get().canUndo).toBe(false);
});

test('the colour picker set back to the colour it began with, then left, records nothing', () => {
  open(docOf(box())); update(s => { s.S.ink = 'custom'; s.S.customInk = '#112233'; }, { history: false });
  render(<Ink />);
  const c = screen.getByLabelText('Pick any ink colour');
  fireEvent.input(c, { target: { value: '#445566' } });
  fireEvent.input(c, { target: { value: '#112233' } });
  fireEvent.blur(c);
  expect(get().S.customInk).toBe('#112233'); expect(get().canUndo).toBe(false);
});
