// The size estimate: one real page drawn at Standard size after a pause, encoded three ways, and kept.
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { PAGE_W } from '@/engine/config.js';
import { loadFont } from '@/engine/core.js';
import { StageHost } from '@/features/doc/StageHost';
import type { Stage } from '@/app/route';
import { update } from '@/store/editor';
import { box, docOf, fontsLoad, lines, open } from '@/test/docs';
import { clearSizeCache, measurePage, useSizeEstimate } from './estimate';
import { encodeCanvas, freeze, renderPage } from './render';

vi.mock('./render', async orig => {
  const actual = await orig<typeof import('./render')>();
  return {
    ...actual,
    renderPage: vi.fn(() => { const c = document.createElement('canvas'); c.width = 1747; c.height = 2471; return c; }),
    encodeCanvas: vi.fn(async (_c: HTMLCanvasElement, type: string, q?: number) => new Uint8Array(type === 'image/png' ? 900 : q === 0.9 ? 300 : 420)),
  };
});
vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));

const SAMPLE = { png: 900, jpg: 300, jpgPrint: 420 };
beforeAll(async () => { fontsLoad(); await loadFont('labelle'); });
beforeEach(() => { vi.useFakeTimers(); clearSizeCache(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

test('one page is measured at Standard size, as a PNG and as a JPG at both qualities', async () => {
  open(docOf(box({ text: lines(40) })));
  expect(await measurePage(freeze(), 1)).toEqual(SAMPLE);
  expect(renderPage).toHaveBeenCalledWith(expect.anything(), 1, PAGE_W * 2.2);
  expect(encodeCanvas).toHaveBeenCalledWith(expect.anything(), 'image/jpeg', 0.95);
});

test('the measured canvas is released, even when encoding fails', async () => {
  const c = document.createElement('canvas'); c.width = 1747; c.height = 2471;
  vi.mocked(renderPage).mockReturnValueOnce(c); vi.mocked(encodeCanvas).mockRejectedValueOnce(new Error('encode'));
  open(docOf(box({ text: 'x' })));
  await expect(measurePage(freeze(), 0)).rejects.toThrow('encode');
  expect([c.width, c.height]).toEqual([0, 0]);
});

test('the measured canvas is released after a good measurement too', async () => {
  const c = document.createElement('canvas'); c.width = 1747; c.height = 2471;
  vi.mocked(renderPage).mockReturnValueOnce(c);
  open(docOf(box({ text: 'x' })));
  await measurePage(freeze(), 0);
  expect([c.width, c.height]).toEqual([0, 0]);
});

test('it waits for a pause, then measures the first chosen page once', async () => {
  open(docOf(box({ text: lines(40) })));
  const { result, rerender } = renderHook(({ p }) => useSizeEstimate(p), { initialProps: { p: 0 as number | null } });
  expect(result.current).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(599)); expect(renderPage).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1)); expect(result.current).toEqual(SAMPLE);
  rerender({ p: 0 }); act(() => update(s => { s.doc.fileName = 'typed'; }, { history: false })); await act(() => vi.advanceTimersByTimeAsync(600));
  expect(renderPage).toHaveBeenCalledTimes(1);
});

test('a new look is measured again; going back uses what was measured', async () => {
  open(docOf(box({ text: lines(40) })));
  const { result } = renderHook(() => useSizeEstimate(0));
  await act(() => vi.advanceTimersByTimeAsync(600)); expect(renderPage).toHaveBeenCalledTimes(1);
  act(() => update(s => { s.S.look = 'bw'; }, { history: false })); await act(() => vi.advanceTimersByTimeAsync(600)); expect(renderPage).toHaveBeenCalledTimes(2);
  act(() => update(s => { s.S.look = 'none'; }, { history: false }));
  expect(result.current).toEqual(SAMPLE); await act(() => vi.advanceTimersByTimeAsync(600)); expect(renderPage).toHaveBeenCalledTimes(2);
});

test('a hidden stage measures nothing', async () => {
  open(docOf(box({ text: lines(40) })));
  let stage: Stage = 'export';
  const wrapper = ({ children }: { children: ReactNode }) => <StageHost stage={stage} render={s => (s === 'export' ? children : null)} />;
  const { rerender } = renderHook(() => useSizeEstimate(0), { wrapper });
  await act(() => vi.advanceTimersByTimeAsync(300));
  stage = 'write'; rerender();
  await act(() => vi.advanceTimersByTimeAsync(2000)); expect(renderPage).not.toHaveBeenCalled();
  stage = 'export'; rerender();
  await act(() => vi.advanceTimersByTimeAsync(600)); expect(renderPage).toHaveBeenCalledTimes(1);
});

test('nothing is measured while a hand is still arriving, or with no page chosen', async () => {
  open(docOf(box({ text: 'x', style: { font: 'zeyada' } })));
  renderHook(() => useSizeEstimate(0)); renderHook(() => useSizeEstimate(null));
  await act(() => vi.advanceTimersByTimeAsync(2000)); expect(renderPage).not.toHaveBeenCalled();
});

test('a measurement that fails leaves no estimate', async () => {
  vi.mocked(encodeCanvas).mockRejectedValue(new Error('encode')); open(docOf(box({ text: 'x' })));
  const { result } = renderHook(() => useSizeEstimate(0));
  await act(() => vi.advanceTimersByTimeAsync(600)); expect(result.current).toBeNull();
});

test('an edit while a measurement is running does not start a second one', async () => {
  let release!: () => void;
  vi.mocked(encodeCanvas).mockImplementationOnce(() => new Promise(r => { release = () => r(new Uint8Array(900)); }));
  open(docOf(box({ text: lines(40) })));
  renderHook(() => useSizeEstimate(0));
  await act(() => vi.advanceTimersByTimeAsync(600)); expect(renderPage).toHaveBeenCalledTimes(1);
  act(() => update(s => { s.doc.fileName = 'a'; }, { history: false })); await act(() => vi.advanceTimersByTimeAsync(600));
  act(() => update(s => { s.doc.fileName = 'ab'; }, { history: false })); await act(() => vi.advanceTimersByTimeAsync(600));
  expect(renderPage).toHaveBeenCalledTimes(1);
  release(); await act(() => vi.advanceTimersByTimeAsync(0));
});

test('a hand that arrives after the pause is measured once it is here', async () => {
  open(docOf(box({ text: 'x', style: { font: 'zeyada' } })));
  renderHook(() => useSizeEstimate(0));
  await act(() => vi.advanceTimersByTimeAsync(600)); expect(renderPage).not.toHaveBeenCalled();
  await act(async () => { await loadFont('zeyada'); update(null, { save: false, layout: false }); });
  await act(() => vi.advanceTimersByTimeAsync(600)); expect(renderPage).toHaveBeenCalledTimes(1);
});
