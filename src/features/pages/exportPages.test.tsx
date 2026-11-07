// Export's pages as they will download: camera tilt in the preview, and Choose pages.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { applyLook, frameShot } from '@/engine/core.js';
import { layoutFor } from '@/features/doc/model';
import { flushSave, update } from '@/store/editor';
import { box, docOf, get, lines, open } from '@/test/docs';
import { PageView, type PageLayout } from './PageView';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));
vi.mock('@/engine/core.js', async orig => {
  const actual = await orig<typeof import('@/engine/core.js')>();
  return { ...actual, frameShot: vi.fn(actual.frameShot), applyLook: vi.fn(actual.applyLook) };
});

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) { return this.hasAttribute('data-pages') ? 1000 : 0; },
  });
});
afterAll(() => { delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth; });
beforeEach(async () => { await flushSave(); vi.mocked(frameShot).mockClear(); vi.mocked(applyLook).mockClear(); });
afterEach(() => { vi.useRealTimers(); });

const pageLayout = (): PageLayout => ({ ...layoutFor(get().S, get().doc), tick: 't' });

test('in Export, camera tilt shows on the pages, even As written', async () => {
  vi.useFakeTimers(); open(docOf(box({ text: 'x' }))); update(s => { s.S.tilt = true; }, { history: false });
  const { container } = render(<PageView layout={pageLayout()} mode="export" />);
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(frameShot).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 0);
  expect(container.querySelector('.paper')).toHaveClass('scanned');
});
test('As written without tilt shows the pages as drawn, and turning tilt off takes the tilted preview away', async () => {
  vi.useFakeTimers(); open(docOf(box({ text: 'x' }))); update(s => { s.S.tilt = true; }, { history: false });
  const { container, rerender } = render(<PageView layout={pageLayout()} mode="export" />);
  await act(() => vi.advanceTimersByTimeAsync(500));
  act(() => update(s => { s.S.tilt = false; }, { history: false })); rerender(<PageView layout={pageLayout()} mode="export" />);
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(container.querySelector('.paper')).not.toHaveClass('scanned');
});
test('Write and Style never show the download’s tilt', async () => {
  vi.useFakeTimers(); open(docOf(box({ text: 'x' }))); update(s => { s.S.tilt = true; }, { history: false });
  render(<PageView layout={pageLayout()} mode="style" />);
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(frameShot).not.toHaveBeenCalled();
});
test('Choose pages: every page is a checkbox, and a left-out page is dimmed and says so', async () => {
  open(docOf(box({ text: lines(40) }))); const toggle = vi.fn();
  render(<PageView layout={pageLayout()} mode="export" pick={{ out: new Set([1]), toggle }} />);
  expect(screen.getByRole('checkbox', { name: 'Include page 1' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Include page 2' })).not.toBeChecked();
  expect(screen.getByText('Page 2 of 2 · left out').closest('figure')).toHaveClass('left-out');
  expect(screen.getByText('Page 1 of 2').closest('figure')).not.toHaveClass('left-out');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Include page 1' })); expect(toggle).toHaveBeenCalledWith(0);
  screen.getByRole('checkbox', { name: 'Include page 2' }).focus(); await userEvent.keyboard(' '); expect(toggle).toHaveBeenLastCalledWith(1);
});
test('without Choose pages, the pages are not checkboxes', () => {
  open(docOf(box({ text: lines(40) }))); render(<PageView layout={pageLayout()} mode="export" />);
  expect(screen.queryByRole('checkbox')).toBeNull();
});
test('a one-page document says Page 1 · left out', () => {
  open(docOf(box({ text: 'x' }))); render(<PageView layout={pageLayout()} mode="export" pick={{ out: new Set([0]), toggle: vi.fn() }} />);
  expect(screen.getByText('Page 1 · left out')).toBeInTheDocument();
});
