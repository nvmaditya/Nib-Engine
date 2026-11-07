// The page count notice in Style's header: what a change did to the page count, and Fit back.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import type { Stage } from '@/app/route';
import { clearMeasureCache, loadFont } from '@/engine/core.js';
import type { EngineDoc } from '@/engine/types';
import { setV } from '@/features/doc/actions';
import { StageHost } from '@/features/doc/StageHost';
import { flushSave, openDocument, update } from '@/store/editor';
import { box, docOf, get, open, rec } from '@/test/docs';
import { paragraphs, realFonts } from '@/test/fonts';
import { PageCountNotice } from './PageCountNotice';
import { ScopeBar } from './ScopeBar';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

beforeAll(async () => { realFonts(); expect(await loadFont('labelle')).toBe(true); });
afterAll(() => vi.unstubAllGlobals());
beforeEach(async () => { await flushSave(); vi.mocked(sonner).mockClear(); });

const para = (n: number): EngineDoc => docOf(box({ id: 'm', name: 'Main text', text: paragraphs(n) }));
const status = () => screen.getByText(/^Now /).parentElement!;
const fitButton = () => screen.getByRole('button', { name: 'Fit back to 2 pages' });

test('a change that adds a page shows the notice, and Fit back fits it again', async () => {
  open(para(7));
  const { rerender } = render(<PageCountNotice pages={2} />);
  expect(screen.queryByText(/^Now /)).toBeNull();
  act(() => setV({ size: 36 }));
  rerender(<PageCountNotice pages={3} />);
  expect(status()).toHaveTextContent('Now 3 pages (was 2)');
  expect(status()).toHaveClass('bg-primary-soft', 'text-[13px]');
  await userEvent.click(fitButton());
  expect(get().S.size).toBe(34);
  rerender(<PageCountNotice pages={2} />);
  expect(screen.queryByText(/^Now /)).toBeNull();
});

test('fewer pages is said too, without Fit back', () => {
  open(para(7));
  const { rerender } = render(<PageCountNotice pages={2} />);
  rerender(<PageCountNotice pages={1} />);
  expect(status()).toHaveTextContent('Now 1 page (was 2)');
  expect(screen.queryByRole('button', { name: /Fit back/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
});

test('Dismiss keeps the new count', async () => {
  open(para(7));
  const { rerender } = render(<PageCountNotice pages={2} />);
  rerender(<PageCountNotice pages={3} />);
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByText(/^Now /)).toBeNull();
  rerender(<PageCountNotice pages={4} />);
  expect(status()).toHaveTextContent('Now 4 pages (was 3)');
  expect(screen.getByRole('button', { name: 'Fit back to 3 pages' })).toBeEnabled();
});

const Host = ({ stage, pages }: { stage: Stage; pages: number }) => (
  <StageHost stage={stage} render={s => (s === 'style' ? <PageCountNotice pages={pages} /> : <p>Pages</p>)} />
);

test('the count starts again each time Style is shown', () => {
  open(para(7));
  const { rerender } = render(<Host stage="style" pages={2} />);
  rerender(<Host stage="write" pages={3} />);
  expect(screen.queryByText(/^Now /)).toBeNull(); // nothing while the stage is hidden
  rerender(<Host stage="style" pages={3} />);
  expect(screen.queryByText(/^Now /)).toBeNull();
  rerender(<Host stage="style" pages={4} />);
  expect(status()).toHaveTextContent('Now 4 pages (was 3)');
});

test('the count starts once there are pages to count', () => {
  open(para(7));
  const { rerender } = render(<PageCountNotice pages={null} />);
  expect(screen.queryByText(/^Now /)).toBeNull();
  rerender(<PageCountNotice pages={3} />);
  expect(screen.queryByText(/^Now /)).toBeNull();
  rerender(<PageCountNotice pages={null} />);
  expect(screen.queryByText(/^Now /)).toBeNull();
  rerender(<PageCountNotice pages={4} />);
  expect(status()).toHaveTextContent('Now 4 pages (was 3)');
});

test('the count starts again when another document is opened', () => {
  open(para(7));
  const { rerender } = render(<PageCountNotice pages={2} />);
  rerender(<PageCountNotice pages={3} />);
  expect(status()).toHaveTextContent('Now 3 pages (was 2)');
  act(() => openDocument(rec('B', para(7))));
  expect(screen.queryByText(/^Now /)).toBeNull();
});

test('Fit back waits for a hand that is still arriving', async () => {
  open(para(7));
  update(s => { s.S.font = 'zeyada'; }, { history: false });
  const { rerender } = render(<PageCountNotice pages={2} />);
  rerender(<PageCountNotice pages={3} />);
  expect(fitButton()).toBeDisabled();
  expect(fitButton()).toHaveAttribute('title', 'Waiting for the handwriting to load');
  // Once the file arrives (the document view bumps fontTick), it can be pressed.
  expect(await loadFont('zeyada')).toBe(true);
  act(() => update(s => { s.fontTick++; clearMeasureCache(); }, { save: false }));
  expect(fitButton()).toBeEnabled();
  expect(fitButton()).not.toHaveAttribute('title');
});

test('Fit back and Dismiss move focus to the Style heading', async () => {
  open(para(7));
  const view = (n: number) => <ScopeBar notice={<PageCountNotice pages={n} />} />;
  const { rerender } = render(view(2));
  rerender(view(3));
  await userEvent.click(fitButton());
  expect(screen.getByRole('heading', { name: 'Style' })).toHaveFocus();
  (document.activeElement as HTMLElement).blur();
  rerender(view(4));
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.getByRole('heading', { name: 'Style' })).toHaveFocus();
});

test('when nothing fits, Fit back leaves focus on itself', async () => {
  open(para(40));
  const view = (n: number) => <ScopeBar notice={<PageCountNotice pages={n} />} />;
  const { rerender } = render(view(2));
  rerender(view(3));
  await userEvent.click(fitButton());
  expect(fitButton()).toHaveFocus();
});
