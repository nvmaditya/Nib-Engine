// One step per real change in Style: a slider, or the colour picker, moved and moved back before it is left records nothing.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { LIMITS } from '@/engine/config.js';
import type { Settings } from '@/engine/types';
import { view } from '@/features/doc/actions';
import { flushSave, undo, update, useEditor } from '@/store/editor';
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

test('a slider dragged and brought back to where it began, then left, records nothing', () => {
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
