// A sample of handwriting drawn by the engine itself.
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanSettings } from '@/engine/doc.js';
import { dprNow } from '@/features/pages/Sheet';
import { fontsLoad } from '@/test/docs';

vi.mock('@/engine/core.js', async orig => ({ ...(await orig<typeof import('@/engine/core.js')>()), drawSample: vi.fn(() => 120) }));
import { drawSample } from '@/engine/core.js';
import { HandSample, paperTint } from './HandSample';

const S = cleanSettings(null, false), px = (h: number) => Math.round(h * dprNow());
beforeEach(() => { vi.mocked(drawSample).mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); });

test('a sample writes plain words with the engine', () => {
  render(<HandSample settings={S} text="# 2*3" height={30} />);
  expect(drawSample).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), S, '\\# 2\\*3', px(30));
  expect(document.querySelector('canvas')!.style.width).toBe(`${120 / dprNow()}px`);
  expect(document.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true');
});

test('text that starts with a blank line or has several lines still draws as one line', () => {
  render(<HandSample settings={S} text={'\n  Homework\nsecond'} height={30} />);
  expect(drawSample).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), S, 'Homework second', px(30));
});

test('it is drawn again only when what it shows changes', () => {
  const { rerender } = render(<HandSample settings={S} text="Homework" height={30} />);
  rerender(<HandSample settings={{ ...S }} text="Homework" height={30} />);
  expect(drawSample).toHaveBeenCalledTimes(1);
  rerender(<HandSample settings={{ ...S, mess: 90 }} text="Homework" height={30} />);
  rerender(<HandSample settings={{ ...S, mess: 90, seed: 8 }} text="Homework" height={30} />);
  expect(drawSample).toHaveBeenCalledTimes(3);
});

test('a hand whose file hasn’t arrived is drawn again once it has', async () => {
  fontsLoad();
  render(<HandSample settings={{ ...S, font: 'zeyada' }} text="Homework" height={30} />);
  await waitFor(() => expect(drawSample).toHaveBeenCalledTimes(2));
  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/fonts\/zeyada\.woff$/));
});

/** An IntersectionObserver that reports only when the test says so. */
const observers: FakeIO[] = [];
class FakeIO {
  els: Element[] = [];
  constructor(readonly cb: IntersectionObserverCallback) { observers.push(this); }
  observe(el: Element) { this.els.push(el); }
  unobserve() {}
  disconnect() { observers.splice(observers.indexOf(this), 1); }
  takeRecords() { return []; }
}
const report = (near: boolean) => act(() => {
  for (const io of [...observers]) io.cb(io.els.map(target => ({ isIntersecting: near, target }) as unknown as IntersectionObserverEntry), io as unknown as IntersectionObserver);
});

test('a sample far from view fetches no font file, and does once it comes near', async () => {
  vi.stubGlobal('IntersectionObserver', FakeIO);
  fontsLoad();
  render(<HandSample settings={{ ...S, font: 'kalam' }} text="Homework" height={30} />);
  report(false);
  expect(fetch).not.toHaveBeenCalled();
  report(true);
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/fonts\/kalam\.woff$/)));
});

test('a font file that failed to load is tried again the next time the sample comes near', async () => {
  vi.stubGlobal('IntersectionObserver', FakeIO);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })));
  render(<HandSample settings={{ ...S, font: 'patrick' }} text="Homework" height={30} />);
  report(true);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  report(false); report(true);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
});

test('nothing to write draws nothing', () => {
  render(<HandSample settings={S} text="  " height={30} />);
  expect(drawSample).not.toHaveBeenCalled();
});

test('paper tints', () => {
  expect(paperTint('yellow')).toBe('rgb(249, 238, 170)');
  expect(paperTint('nope')).toBe('rgb(251, 251, 247)');
});
