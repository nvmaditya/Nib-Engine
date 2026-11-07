// Write it out with Add after the last page counts the pages with the hands it writes in: a hand still on its way
// (the look just chosen, its sample still loading, or a slow connection) is waited for, so the text isn't placed by
// stand-in widths and never lands on a page the document's own writing reaches.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast as sonner } from 'sonner';
import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import { loadFont } from '@/engine/core.js';
import { readDocument } from '@/engine/importers.js';
import type { ImportPlace } from '@/features/doc/build';
import { closeImport, openImport } from '@/features/doc/actions';
import { STYLE_LOOKS } from '@/features/style/looks';
import { flushSave, useEditor } from '@/store/editor';
import { box, docOf, get, lastToast, open } from '@/test/docs';
import { paragraphs, realFonts } from '@/test/fonts';
import { handsArriving } from './apply';
import { ImportDialog } from './ImportDialog';

vi.mock('@/engine/importers.js', async orig => ({ ...(await orig<typeof import('@/engine/importers.js')>()), readDocument: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn(), getToasts: vi.fn(() => []) }), Toaster: () => null }));

// The hands' real files (their widths decide where the writing ends). Those of four looks are held back until a test
// lets them arrive (`true`) or fail (`false`, as offline); the look cards ask for every hand as they are shown.
realFonts();
const answer = globalThis.fetch;
const gates = new Map<string, { arrived: Promise<boolean>; release(ok: boolean): void }>();
for (const id of ['caveat', 'patrick', 'cedarville', 'playwrite']) {
  let release!: (ok: boolean) => void;
  const arrived = new Promise<boolean>(r => { release = r; });
  gates.set(id, { arrived, release });
}
vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
  const gate = gates.get(/fonts\/([\w-]+)\.woff$/.exec(String(url))?.[1] ?? '');
  if (gate && !(await gate.arrived)) return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
  return answer(url);
}));
const arrive = (id: string, ok = true) => act(async () => { gates.get(id)!.release(ok); });

const IMPORTED = { parts: ['Imported words'], pages: 0, words: 2, name: 'Essay' };
function Open() { const o = useEditor(s => s.importOpen); return <ImportDialog open={o} file={new File(['x'], 'Essay.docx')} target="open" onClose={closeImport} />; }
const writeIt = () => screen.getByRole('button', { name: 'Write it out' });
const look = (id: string) => STYLE_LOOKS.find(l => l.id === id)!;
/**
 * A document whose Main text ends on page 1 when measured by stand-in widths, but carries on to page 2 in the
 * Journal look's own hand. The person has added a blank page 2.
 */
const endsOnPage2InItsHand = () => open({ ...docOf(box({ id: 'm', name: 'Main text', text: paragraphs(5) })), pageCount: 2 });

/** Add after the last page, in the look named, then Write it out. */
async function addAfterIn(lookName: string): Promise<void> {
  openImport(); render(<Open />); await screen.findByText('Essay.docx: 2 words.');
  await userEvent.click(screen.getByRole('radio', { name: 'Add after the last page' }));
  await userEvent.click(screen.getByRole('radio', { name: lookName }));
  await userEvent.click(writeIt());
}

beforeEach(async () => { await flushSave(); vi.mocked(sonner).mockClear(); vi.mocked(readDocument).mockReset().mockResolvedValue(IMPORTED); });
afterAll(async () => { await flushSave(); vi.unstubAllGlobals(); });

test('Write it out waits for the look’s hand, then carries on the text that ends on the last page in that hand', async () => {
  endsOnPage2InItsHand(); await addAfterIn('Journal');
  // Nothing is written while the hand is on its way: the dialog waits, and says so.
  expect([get().doc.boxes.map(b => b.name), get().importOpen]).toEqual([['Main text'], true]); expect(writeIt()).toBeDisabled();
  await arrive('caveat');
  await waitFor(() => expect(get().importOpen).toBe(false));
  expect(lastToast()).toBe('Added after the last page, carrying on “Main text”.');
  expect(get().doc.boxes.map(b => [b.name, b.text])).toEqual([['Main text', paragraphs(5) + '\n\\newpage\nImported words']]);
  expect([get().S.font, get().scrollToPage]).toEqual(['caveat', 2]);
});

test('while the hand is on its way the preview and the choices can’t be changed, and Cancel still works and writes nothing', async () => {
  endsOnPage2InItsHand(); await addAfterIn('Neat notes');
  // What was pressed is what is written: the preview, the choices and Choose another file are inert under the
  // spinner (no focus, no clicks, no typing), and a file dropped on the dialog is not read. Cancel is not.
  const inert = (el: HTMLElement) => el.closest('[inert]') !== null;
  const preview = screen.getByRole('textbox', { name: 'Imported text' });
  expect([preview, screen.getByRole('radio', { name: 'Letter' }), screen.getByRole('radio', { name: 'Replace what’s on the pages' }), screen.getByText('Choose another file')].map(inert)).toEqual([true, true, true, true]);
  expect([screen.getByRole('button', { name: 'Cancel' }), writeIt()].map(inert)).toEqual([false, false]);
  fireEvent.drop(screen.getByRole('dialog'), { dataTransfer: { files: [new File(['y'], 'Other.txt')] } });
  expect(readDocument).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await arrive('patrick');
  expect([get().importOpen, get().doc.boxes.map(b => b.text), get().S.font, get().canUndo]).toEqual([false, [paragraphs(5)], 'labelle', false]);
  expect(lastToast()).toBeUndefined();
});

test('a hand that can’t be fetched (offline) isn’t waited for: the text is written out with what there is', async () => {
  endsOnPage2InItsHand(); await addAfterIn('Letter');
  await arrive('cedarville', false);
  await waitFor(() => expect(get().importOpen).toBe(false));
  expect(get().S.font).toBe('cedarville'); expect(lastToast()).toMatch(/^Added after the last page/);
});

test('a hand that never comes is waited for 10 seconds at most', async () => {
  endsOnPage2InItsHand(); // (School copy's hand is held back for good)
  const place: ImportPlace = { where: 'append', look: look('school'), header: null };
  vi.useFakeTimers();
  try {
    let done = false; void handsArriving(place)!.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(9999); expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect(done).toBe(true);
  } finally { vi.useRealTimers(); }
});

test('with every hand here, or for Replace, there is nothing to wait for', async () => {
  await arrive('caveat'); expect([await loadFont('labelle'), await loadFont('caveat')]).toEqual([true, true]);
  open(docOf(box({ id: 'm', text: 'a' })));
  expect(handsArriving({ where: 'append', look: look('journal'), header: null })).toBeNull();
  expect(handsArriving({ where: 'append', look: null, header: null })).toBeNull();
  expect(handsArriving({ where: 'replace', look: look('school'), header: null })).toBeNull();
});
