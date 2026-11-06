// The handwritten pages: drawn only near the viewport, coloured name tags, click-a-word, drops and nudges.
import type { ReactNode } from 'react';
import { act, render, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import { cleanSettings, sampleDoc } from '@/engine/doc.js';
import type { Seg } from '@/engine/types';
import { StageHost } from '@/features/doc/StageHost';
import { layoutFor } from '@/features/doc/model';
import { flushSave, update } from '@/store/editor';
import { box, docOf, get, lastToast, layoutOf, lines, open, words } from '@/test/docs';
import { PageView, type PageLayout } from './PageView';
import { dropPart, nudge, wordClick } from './drag';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

// jsdom does no layout: the pages column is 1000 px wide, everything else 0.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) { return this.hasAttribute('data-pages') ? 1000 : 0; },
  });
});
afterAll(() => { delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth; });
beforeEach(async () => { await flushSave(); vi.mocked(sonner).mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); });

/** An IntersectionObserver that reports only when the test says so. */
const observers: FakeIO[] = [];
class FakeIO {
  els: Element[] = [];
  constructor(private cb: IntersectionObserverCallback) { observers.push(this); }
  observe(el: Element) { this.els.push(el); }
  unobserve() {}
  disconnect() { observers.splice(observers.indexOf(this), 1); }
  takeRecords() { return []; }
  fire(isIntersecting: boolean) {
    this.cb(this.els.map(target => ({ isIntersecting, target }) as unknown as IntersectionObserverEntry), this as unknown as IntersectionObserver);
  }
}
const report = (near: boolean) => act(() => { for (const io of [...observers]) io.fire(near); });

const pageLayout = (): PageLayout => ({ ...layoutFor(get().S, get().doc), tick: 't' });
const pages = (mode: 'write' | 'style' | 'export' = 'write', tagMenu?: (sg: Seg) => ReactNode) =>
  render(<PageView layout={pageLayout()} mode={mode} tagMenu={tagMenu} />);
const frame = (id: string) => document.querySelector<HTMLElement>(`.block-frame[data-id="${id}"]`)!;
const inkCanvases = (el: ParentNode = document) => el.querySelectorAll('.ink-layer canvas');
const m = () => box({ id: 'm', name: 'Main text', text: lines(40) });
const part = (i: number) => layoutFor(get().S, get().doc).segs.find(s => s.box.id === 'm' && s.idx === i)!;

test('a sheet far from view draws nothing', () => {
  vi.stubGlobal('IntersectionObserver', FakeIO);
  open(sampleDoc(cleanSettings(null, false)));
  pages();
  report(false);
  expect(inkCanvases()).toHaveLength(0);
  const paper = document.querySelector<HTMLCanvasElement>('.paper-bg')!;
  expect([paper.width, paper.height, paper.dataset.k]).toEqual([0, 0, undefined]);
  report(true);
  expect(inkCanvases().length).toBeGreaterThan(0);
  expect(paper.dataset.k).toBeTruthy();
  report(false);
  expect(inkCanvases()).toHaveLength(0);
  expect([paper.width, paper.height, paper.dataset.k]).toEqual([0, 0, undefined]);
});

test('an inactive stage draws nothing but keeps its pages, and draws what changed meanwhile when shown again', () => {
  open(sampleDoc(cleanSettings(null, false)));
  const view = (stage: 'style' | 'export') => (
    <StageHost stage={stage} render={s => <PageView layout={pageLayout()} mode={s === 'export' ? 'export' : 'style'} />} />
  );
  const { rerender } = render(view('style'));
  const style = document.querySelector<HTMLElement>('[data-stage="style"]')!;
  const mainInk = () => style.querySelector<HTMLCanvasElement>('.ink-layer canvas[data-id="b1:0"]')?.dataset.k;
  const before = mainInk();
  expect(before).toBeTruthy();
  rerender(view('export'));
  expect(style).not.toBeVisible();
  expect(style).toHaveAttribute('inert');
  expect(inkCanvases(style)).toHaveLength(0);
  expect(style.querySelectorAll('.sheet').length).toBeGreaterThan(0);
  expect(inkCanvases(document.querySelector('[data-stage="export"]')!).length).toBeGreaterThan(0);
  act(() => update(s => { s.doc.boxes[1].text = 'Changed while Style was hidden.'; }));
  rerender(view('export'));
  rerender(view('style'));
  expect(mainInk()).toBeTruthy();
  expect(mainInk()).not.toBe(before);
});

test('blocks wear their colour and name tag', () => {
  open(sampleDoc(cleanSettings(null, false)));
  pages();
  expect(frame('b2:0').style.getPropertyValue('--bc')).toBe('#7A4DF0');
  expect(frame('b1:0').style.getPropertyValue('--bc')).toBe('#0B8F8A');
  expect(within(frame('b1:0')).getByText('Main text')).toBeInTheDocument();
  expect(within(frame('b1:0')).getByRole('button', { name: 'Move Main text' })).toBeInTheDocument();
  expect(within(frame('b2:0')).getByText('Header')).toBeInTheDocument();
});

test('a continuation’s tag says which part it is', () => {
  open(docOf(m()));
  pages();
  expect(within(frame('m:1')).getByText('2 of 2')).toBeInTheDocument();
  expect(within(frame('m:0')).getByText('1 of 2')).toBeInTheDocument();
});

test('the tag’s menu shows while writing, not in Style, and Export shows no frames', () => {
  open(docOf(m()));
  const menu = (sg: Seg) => <button type="button">Options for {sg.box.name}</button>;
  const { unmount } = pages('write', menu);
  expect(within(frame('m:0')).getByRole('button', { name: 'Options for Main text' })).toBeInTheDocument();
  unmount();
  const style = pages('style', menu);
  expect(within(frame('m:0')).getByText('Main text')).toBeInTheDocument();
  expect(within(frame('m:0')).queryByRole('button', { name: 'Options for Main text' })).toBeNull();
  style.unmount();
  pages('export', menu);
  expect(document.querySelector('.block-frame')).toBeNull();
  expect(inkCanvases().length).toBeGreaterThan(0);
});

test('a margin note’s frame turns with its writing', () => {
  open(docOf(box({ id: 'n', kind: 'note', name: 'Margin note', text: 'A note to self.' })));
  pages();
  expect(frame('n:0').style.rotate).toMatch(/^-0\.0\d+rad$/);
});

test('clicking a word asks for the caret there', () => {
  const b = box({ id: 'w', text: words(30) });
  open(docOf(b));
  wordClick(layoutOf(docOf(b)).segs[0], 216, 139);
  expect(get().selectedId).toBe('w');
  expect(get().caret).toMatchObject({ boxId: 'w', offset: 10 });
});

test('a continuation dropped on another page stays and says why', () => {
  open(docOf(m()));
  dropPart(part(1), 0, 112, 110);
  expect(lastToast()).toBe('Part 2 of Main text always follows the part before it. Split it off first to move it on its own.');
  expect(get().doc.boxes[0].frames).toEqual({});
  expect(get().canUndo).toBe(false);
});

test('a part dropped on its own page moves there; a first part dropped on another page goes with it', () => {
  open({ ...docOf(m()), pageCount: 3 });
  dropPart(part(1), 1, 150, 212);
  expect(get().doc.boxes[0].frames).toEqual({ 1: { x: 150, y: 212 } });
  dropPart(part(0), 2, 140, 178);
  expect(get().doc.boxes[0]).toMatchObject({ page: 2, x: 140, y: 178 });
  expect(part(1).page).toBe(3);
});

test('arrow keys move a pushed block from where it was put', () => {
  open(docOf(box({ id: 'a', text: lines(10) }), box({ id: 'b', y: 178, text: 'below' })));
  const segB = () => layoutFor(get().S, get().doc).segs.find(s => s.box.id === 'b')!;
  expect(segB()).toMatchObject({ top: 450, storedTop: 178, pushed: true });
  nudge(segB(), 'ArrowDown');
  expect(get().doc.boxes[1].y).toBe(212);
  nudge(segB(), 'ArrowRight');
  expect(get().doc.boxes[1].x).toBe(116);
});
