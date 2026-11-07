// The Style panel's parts: folds, and sliders that make one undo step per drag or key press.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { LIMITS } from '@/engine/config.js';
import type { Settings } from '@/engine/types';
import { select, view } from '@/features/doc/actions';
import { flushSave, undo, update, useEditor } from '@/store/editor';
import { box, docOf, get, open } from '@/test/docs';
import { Fold, Group } from './parts';
import { FORMAT, Range, rangeSteps } from './Range';
import { SETTING_CONTROLS } from './controls';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));

beforeEach(async () => { await flushSave(); localStorage.clear(); });
const cleanups: (() => void)[] = [];
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); while (cleanups.length) cleanups.pop()!(); });

function Live(p: { id: keyof typeof LIMITS; step?: number }) { useEditor(s => s.version); return <Range {...p} V={view() as Settings} />; }
const styleBox = (id: string) => act(() => { select(id); update(s => { s.scope = 'box'; }, { save: false, layout: false }); });

test('a slider drag is one undo step, however long it pauses', () => {
  vi.useFakeTimers(); open(docOf(box()));
  const r = rangeSteps('size');
  r.change({ size: 31 }); vi.advanceTimersByTime(1500); r.change({ size: 36 }); r.end();
  expect(get().S.size).toBe(36);
  undo();
  expect(get().S.size).toBe(30); expect(get().canUndo).toBe(false);
});

test('the next drag is a step of its own', () => {
  open(docOf(box()));
  const r = rangeSteps('size');
  r.change({ size: 31 }); r.end(); r.change({ size: 32 }); r.end();
  undo();
  expect(get().S.size).toBe(31);
});

test('each arrow key on a slider is one step', async () => {
  open(docOf(box()));
  render(<Live id="size" />);
  screen.getByRole('slider', { name: 'Letter size' }).focus();
  await userEvent.keyboard('{ArrowRight}{ArrowRight}');
  expect(get().S.size).toBe(32);
  undo();
  expect(get().S.size).toBe(31);
});

test('a drag after a key press is a step of its own', async () => {
  open(docOf(box()));
  render(<Live id="size" />);
  const thumb = screen.getByRole('slider', { name: 'Letter size' });
  thumb.focus();
  await userEvent.keyboard('{ArrowRight}');
  // jsdom has no pointer capture, which Radix asks for when a drag starts.
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  for (const m of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) { proto[m] = () => false; }
  cleanups.push(() => { for (const m of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) delete proto[m]; });
  fireEvent.pointerDown(thumb.closest('[data-slot="slider"]')!); // jsdom has no layout, so this lands on the minimum
  expect(get().S.size).toBe(18);
  undo();
  expect(get().S.size).toBe(31);
});

test('a drag carries on as a step of its own after an undo in the middle of it', () => {
  open(docOf(box()));
  const r = rangeSteps('size');
  r.change({ size: 31 }); r.change({ size: 32 });
  undo();
  expect(get().S.size).toBe(30);
  r.change({ size: 35 }); r.change({ size: 36 });
  expect(get().S.size).toBe(36);
  undo();
  expect(get().S.size).toBe(30);
});

test('each slider spans the engine’s whole range', () => {
  open(docOf(box()));
  for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const { unmount } = render(<Live id={k} />);
    const s = screen.getByRole('slider', { name: SETTING_CONTROLS[k].label });
    expect([+s.getAttribute('aria-valuemin')!, +s.getAttribute('aria-valuemax')!]).toEqual(LIMITS[k]);
    unmount();
  }
});

test('in Only a block a slider sets that block’s own value; line spacing stays the document’s', async () => {
  open(docOf(box({ id: 'n' })));
  styleBox('n');
  render(<><Live id="size" /><Live id="gap" /></>);
  screen.getByRole('slider', { name: 'Letter size' }).focus();
  await userEvent.keyboard('{ArrowRight}');
  screen.getByRole('slider', { name: 'Line spacing' }).focus();
  await userEvent.keyboard('{ArrowRight}');
  expect(get().doc.boxes[0].style).toEqual({ size: 31 });
  expect([get().S.size, get().S.gap]).toEqual([30, 35]);
});

test('values read the way people say them', () => {
  expect([FORMAT.weight!(100), FORMAT.track!(1), FORMAT.track!(-1.5), FORMAT.track!(0), FORMAT.words!(10), FORMAT.words!(0)])
    .toEqual(['100%', '+1', '-1.5', '0', '+10%', '0%']);
});

test('a group shows its value and meta', () => {
  render(<Group title="Pen" value="Ballpoint" meta="shared by every page">x</Group>);
  expect(screen.getByRole('heading', { name: /Pen/ })).toHaveTextContent('Ballpoint');
  expect(screen.getByText('shared by every page')).toBeInTheDocument();
});

test('a fold remembers whether it was open', async () => {
  const { unmount } = render(<Fold id="fine" title="Fine-tune">inside</Fold>);
  const b = screen.getByRole('button', { name: 'Fine-tune' });
  expect(b).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(b);
  expect(screen.getByText('inside')).toBeVisible();
  unmount();
  render(<Fold id="fine" title="Fine-tune">inside</Fold>);
  expect(screen.getByRole('button', { name: 'Fine-tune' })).toHaveAttribute('aria-expanded', 'true');
  expect(JSON.parse(localStorage.getItem('nib.styleFolds')!)).toEqual({ fine: true });
});

test('a fold still opens when storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  render(<Fold id="spacing" title="Letter and word spacing">x</Fold>);
  await userEvent.click(screen.getByRole('button', { name: 'Letter and word spacing' }));
  expect(screen.getByText('x')).toBeVisible();
});
