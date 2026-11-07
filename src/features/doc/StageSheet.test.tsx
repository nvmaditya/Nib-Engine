// A stage's phone sheet (Style, Export, Outline): its three resting heights, and room above it for messages.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useRef, useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Stage } from '@/app/route';
import { StageHost } from './StageHost';
import { StageSheet, useSheetSnaps } from './StageSheet';

const appCss = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/app.css'), 'utf8');

const innerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')!;
let stageTop = 0;
/** A window `height` px tall, whose stage starts `top` px down (below the top bar, its stage switcher and any bar of the stage's own). */
function screenOf(height: number, top: number): void {
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
  stageTop = top;
}
beforeEach(() => {
  const rect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.dataset.testStage !== undefined ? new DOMRect(0, stageTop, 320, window.innerHeight - stageTop) : rect.call(this);
  });
});
afterEach(() => { vi.restoreAllMocks(); Object.defineProperty(window, 'innerHeight', innerHeight); });

let heights: { points: (number | string)[]; shown: string };
function Panel({ peek = '148px' }: { peek?: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const snaps = useSheetSnaps(stage, true, peek);
  heights = { points: snaps.points, shown: snaps.shown };
  return (
    <div ref={stage} data-test-stage="">
      <StageSheet title="Panel" handleLabel="Drag to show more or less of Panel" snaps={snaps}><p>In the panel</p></StageSheet>
    </div>
  );
}
const handle = () => screen.getByRole('button', { name: 'Drag to show more or less of Panel' });
const room = () => document.documentElement.style.getPropertyValue('--sheet-room');

test('about half is 55 % of the window, unless that would leave less than 200 px of the pages showing', () => {
  screenOf(844, 140); // a 390 × 844 phone in Outline, below the Write bar
  render(<Panel />);
  expect(heights.points.slice(0, 2)).toEqual(['148px', 0.55]);
  expect(heights.shown).toBe('55dvh');
});

test('on a short phone about half is lowered so 200 px of the pages show above it', () => {
  screenOf(568, 92); // 320 × 568 in Style: 55 % would leave 164 px of pages
  render(<Panel />);
  expect(heights.points).toEqual(['148px', '276px', '476px']);
  expect(heights.shown).toBe('276px');
});

test('lowered, about half stays 40 px above the peek, and never goes above 55 %', () => {
  screenOf(568, 180); // 320 × 568 in Outline, below its two-row Write bar: 568 − 180 − 200 = 188 px
  render(<Panel />);
  expect(heights.points[1]).toBe('188px');
  screenOf(390, 92); // a phone on its side
  render(<Panel />);
  expect(heights.points[1]).toBe('188px'); // (148 + 40, though only 110 px of pages show)
  screenOf(300, 92); // 148 + 40 is more than 55 % of 300: 55 % it is
  render(<Panel peek="168px" />);
  expect(heights.points[1]).toBe(0.55);
});

test('messages rise above the sheet at the peek and about half; at the top, where there is no room above it, they don’t', async () => {
  screenOf(844, 140);
  const { unmount } = render(<Panel />);
  expect(room()).toBe('calc(55dvh + 0.75rem)');
  handle().focus();
  await userEvent.keyboard('{Enter}'); // to the top
  await waitFor(() => expect(heights.shown).toBe('704px'));
  expect(room()).toBe('');
  await userEvent.keyboard('{Enter}'); // to the peek
  await waitFor(() => expect(room()).toBe('calc(148px + 0.75rem)'));
  unmount();
  expect(room()).toBe('');
  // The rule that lifts them, below 860 px (at the top, over the sheet's foot, clear of Export's pinned footer).
  expect(appCss).toMatch(/@media \(width < 53\.75rem\) \{\s*body:has\(\[data-vaul-drawer\]\) \[data-sonner-toaster\]\[data-y-position='bottom'\] \{\s*bottom: var\(--sheet-room, calc\(var\(--offset, 24px\) \+ 96px \+ env\(safe-area-inset-bottom\)\)\);\s*\}\s*\}/);
});

test('a sheet in a stage that isn’t shown leaves the messages alone', () => {
  screenOf(844, 140);
  let go!: (s: Stage) => void;
  function Stages() {
    const [stage, setStage] = useState<Stage>('style');
    go = setStage;
    return <StageHost stage={stage} render={s => (s === 'style' ? <Panel /> : <p>Export</p>)} />;
  }
  render(<Stages />);
  expect(room()).toBe('calc(55dvh + 0.75rem)');
  act(() => go('export'));
  expect(room()).toBe('');
  act(() => go('style'));
  expect(room()).toBe('calc(55dvh + 0.75rem)');
});
