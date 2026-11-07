// The Export panel: format, ZIP, pages, how it looks, quality and the file name, then Download with
// what it makes and its size, and Share… where the browser can share files.
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { loadFont } from '@/engine/core.js';
import { layoutFor } from '@/features/doc/model';
import { SETTING_CONTROLS } from '@/features/style/controls';
import { flushSave, openDocument, undo, useEditor } from '@/store/editor';
import { box, docOf, fontsLoad, get, lines, open, rec } from '@/test/docs';
import { ExportPanel, chooseLook, chooseTilt } from './ExportPanel';
import { canShareFiles, download, share } from './run';
import { DEFAULT_PREFS, IDLE_RUN, setChoose, togglePage, useExportPick, useExportPrefs, useExportRun } from './state';

const SAMPLE = { png: 900_000, jpg: 300_000, jpgPrint: 420_000 };
const prefs = vi.hoisted(() => new Map<string, unknown>());

vi.mock('./estimate', () => ({ useSizeEstimate: () => SAMPLE }));
vi.mock('./run', () => ({ download: vi.fn(async () => {}), share: vi.fn(async () => {}), canShareFiles: vi.fn(() => false) }));
vi.mock('@/store/documents', async orig => ({
  ...await orig<typeof import('@/store/documents')>(),
  putDoc: vi.fn(async () => {}),
  getPref: vi.fn(async (k: string) => prefs.get(k)),
  setPref: vi.fn(async (k: string, v: unknown) => { prefs.set(k, v); }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }), Toaster: () => null }));

beforeAll(async () => { fontsLoad(); await loadFont('labelle'); });
afterAll(() => { vi.unstubAllGlobals(); });
beforeEach(async () => {
  await flushSave();
  prefs.clear();
  vi.mocked(download).mockClear(); vi.mocked(share).mockClear(); vi.mocked(canShareFiles).mockReset().mockReturnValue(false);
  useExportPrefs.setState({ ...DEFAULT_PREFS }); useExportPick.setState({ choose: false, out: [] }); useExportRun.setState({ ...IDLE_RUN });
});

/** The panel with the open document's page count, drawn again on every change, as the stage does. */
function Live() {
  useEditor(s => s.version);
  return <ExportPanel pages={layoutFor(get().S, get().doc).pages} />;
}
/** A 3-page document titled A. */
const three = () => open(docOf(box({ id: 'm', text: lines(60) })));
const dl = () => screen.getByRole('button', { name: /^(Download|Choose|Making)/ });

test('the panel, top to bottom', () => {
  three(); render(<Live />);
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Export');
  expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Format', 'Pages', 'How it looks', 'Quality', 'File name']);
  expect(screen.getByText('Made on this device. Nothing is uploaded.')).toBeInTheDocument();
});

test('the header says the pages are shown as they will download, on wide screens only', () => {
  three(); render(<Live />);
  const line = screen.getByText('The pages are shown exactly as they will download.');
  expect(line).toHaveClass('hidden', 'wide:block');
  expect(screen.getByRole('region', { name: 'Export' })).toHaveClass('flex', 'min-h-0', 'flex-1', 'flex-col');
});

test('a new document downloads a PDF of every page, As written, without tilt, at Standard', () => {
  three(); render(<Live />);
  expect(screen.getByRole('button', { name: 'PDF' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('radio', { name: 'All pages (3)' })).toBeChecked(); expect(screen.getByRole('radio', { name: 'As written' })).toBeChecked();
  expect(screen.getByRole('switch', { name: 'Slight camera tilt' })).not.toBeChecked(); expect(screen.getByRole('button', { name: 'Standard' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('1747 × 2471 pixels a page, for screens and uploads.')).toBeInTheDocument();
  expect(screen.getByText('Turned a fraction of a degree and cropped a little unevenly, like a quick photo.')).toBeInTheDocument();
  expect(dl()).toHaveAccessibleName('Download PDF · 3 pages ~902 KB'); // 900,000 + 300 + 3 × 480
});

test('the looks, in M1’s order', () => {
  three(); render(<Live />);
  expect(screen.getAllByRole('radio').map(r => r.getAttribute('aria-label') ?? r.closest('label')!.textContent))
    .toEqual(['All pages (3)', 'Choose pages', 'As written', 'Scanned', 'Greyscale scan', 'Black and white']);
});

test('several PNGs go in one ZIP unless you say not', async () => {
  three(); render(<Live />); await userEvent.click(screen.getByRole('button', { name: 'PNG' }));
  expect(screen.getByRole('switch', { name: 'Put the images in one ZIP' })).toBeChecked(); expect(screen.getByText('One file to send or upload, instead of 3.')).toBeInTheDocument();
  expect(dl()).toHaveAccessibleName('Download ZIP · 3 PNGs ~2.7 MB'); expect(screen.getByText('.zip')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('switch', { name: 'Put the images in one ZIP' }));
  expect(dl()).toHaveAccessibleName('Download 3 PNGs ~2.7 MB'); expect(screen.getByText('-page-1.png')).toBeInTheDocument(); expect(useExportPrefs.getState().zip).toBe(false);
});

test('no ZIP switch for a PDF, or for one image', async () => {
  three(); render(<Live />); expect(screen.queryByRole('switch', { name: 'Put the images in one ZIP' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'JPG' }));
  act(() => { setChoose(true); togglePage(0); togglePage(1); });
  expect(screen.queryByRole('switch', { name: 'Put the images in one ZIP' })).toBeNull(); expect(dl()).toHaveAccessibleName('Download JPG ~300 KB');
});

test('Print quality', async () => {
  three(); render(<Live />); await userEvent.click(screen.getByRole('button', { name: 'Print quality' }));
  expect(screen.getByText('2480 × 3508 pixels a page (300 dpi), for printing.')).toBeInTheDocument();
  expect(screen.queryByText('1747 × 2471 pixels a page, for screens and uploads.')).toBeNull();
  expect(dl()).toHaveAccessibleName('Download PDF · 3 pages ~2.5 MB');
});

test('How it looks is the document’s: one undo step each, and choosing it again records nothing', async () => {
  three(); render(<Live />); await userEvent.click(screen.getByRole('radio', { name: 'As written' })); expect(get().canUndo).toBe(false);
  await userEvent.click(screen.getByRole('radio', { name: 'Black and white' })); expect(get().S.look).toBe('bw');
  await userEvent.click(screen.getByRole('switch', { name: 'Slight camera tilt' })); expect(get().S.tilt).toBe(true);
  act(() => undo()); expect(get().S.tilt).toBe(false); act(() => undo()); expect(get().S.look).toBe('none'); expect(get().canUndo).toBe(false);
});

test('the panel itself records nothing for the look or the tilt already chosen', () => {
  // (The radio list and the switch only ever report a change, so this calls what they call directly.)
  three();
  chooseLook('none'); chooseTilt(false); expect(get().canUndo).toBe(false);
  chooseLook('bw'); chooseLook('bw'); chooseTilt(true); chooseTilt(true);
  undo(); expect(get().S).toMatchObject({ look: 'bw', tilt: false });
  undo(); expect(get().S.look).toBe('none'); expect(get().canUndo).toBe(false);
});

test('the look and the tilt change no layout (the pages keep their count)', async () => {
  three(); render(<Live />);
  const tick = get().layoutTick;
  await userEvent.click(screen.getByRole('radio', { name: 'Scanned' }));
  await userEvent.click(screen.getByRole('switch', { name: 'Slight camera tilt' }));
  expect(get().layoutTick).toBe(tick);
});

test('the file name shows its ending, starts as the title, and one edit is one undo step', async () => {
  three(); render(<Live />); const f = screen.getByRole('textbox', { name: 'File name' });
  expect(f).toHaveValue(''); expect(f).toHaveAttribute('placeholder', 'A'); expect(screen.getByText('.pdf')).toBeInTheDocument();
  expect(f).toHaveAttribute('maxlength', '80'); expect(f).toHaveAttribute('spellcheck', 'false'); expect(f).toHaveAttribute('autocomplete', 'off');
  await userEvent.click(f); await userEvent.tab(); expect(get().canUndo).toBe(false); // looked at, not changed
  await userEvent.type(f, 'Week 1/notes.pdf'); await userEvent.tab(); expect(get().doc.fileName).toBe('Week 1 notes');
  act(() => undo()); expect(get().doc.fileName).toBe(''); expect(get().canUndo).toBe(false);
});

test('Enter leaves the file name field, cleaned', async () => {
  three(); render(<Live />); const f = screen.getByRole('textbox', { name: 'File name' });
  await userEvent.type(f, 'notes: final{Enter}');
  expect(f).not.toHaveFocus(); expect(get().doc.fileName).toBe('notes final');
  // A second edit is a second step.
  await userEvent.type(f, '!'); await userEvent.tab();
  act(() => undo()); expect(get().doc.fileName).toBe('notes final'); act(() => undo()); expect(get().doc.fileName).toBe(''); expect(get().canUndo).toBe(false);
});

test('the file name placeholder follows the title, cleaned', () => {
  openDocument(rec('Week 3: forces/motion', docOf(box({ text: 'x' })))); render(<Live />);
  expect(screen.getByRole('textbox', { name: 'File name' })).toHaveAttribute('placeholder', 'Week 3 forces motion');
});

test('Choose pages: the count and the label follow what is chosen', async () => {
  three(); render(<Live />); await userEvent.click(screen.getByRole('radio', { name: 'Choose pages' }));
  expect(screen.getByText('Click a page to leave it out or put it back. 3 of 3 chosen.')).toBeInTheDocument();
  act(() => togglePage(1)); expect(screen.getByText('Click a page to leave it out or put it back. 2 of 3 chosen.')).toBeInTheDocument(); expect(dl()).toHaveAccessibleName(/^Download PDF · 2 pages ~/);
  act(() => { togglePage(0); togglePage(2); }); expect(dl()).toHaveAccessibleName('Choose at least one page'); expect(dl()).toBeDisabled();
  expect(dl()).not.toHaveAttribute('title');
  await userEvent.click(screen.getByRole('radio', { name: 'All pages (3)' })); expect(dl()).toHaveAccessibleName(/^Download PDF · 3 pages/);
  expect(screen.queryByText(/^Click a page/)).toBeNull();
});

test('when the document gets shorter, a page left out past its end is forgotten', () => {
  three(); act(() => { setChoose(true); togglePage(2); });
  const { rerender } = render(<ExportPanel pages={3} />); expect(dl()).toHaveAccessibleName(/^Download PDF · 2 pages/);
  rerender(<ExportPanel pages={2} />); expect(dl()).toHaveAccessibleName(/^Download PDF · 2 pages/);
  expect(screen.getByText('Click a page to leave it out or put it back. 2 of 2 chosen.')).toBeInTheDocument();
});

test('format, ZIP and quality stay on the device, not in the document', async () => {
  three(); render(<Live />);
  await userEvent.click(screen.getByRole('button', { name: 'JPG' })); await userEvent.click(screen.getByRole('button', { name: 'Print quality' }));
  expect(get().canUndo).toBe(false);
  act(() => openDocument(rec('B', docOf(box()))));
  expect(screen.getByRole('button', { name: 'JPG' })).toHaveAttribute('aria-pressed', 'true');
});

test('the device’s choices are read when the panel first shows', async () => {
  prefs.set('export', { format: 'png', zip: false, quality: 'print' });
  three(); render(<Live />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'PNG' })).toHaveAttribute('aria-pressed', 'true'));
  expect(screen.getByRole('button', { name: 'Print quality' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('switch', { name: 'Put the images in one ZIP' })).not.toBeChecked();
});

test('Download and Share wait for the handwriting to load', () => {
  vi.mocked(canShareFiles).mockReturnValue(true);
  open(docOf(box({ text: 'x', style: { font: 'zeyada' } }))); render(<Live />);
  for (const b of [dl(), screen.getByRole('button', { name: 'Share…' })]) { expect(b).toBeDisabled(); expect(b).toHaveAttribute('title', 'Waiting for the handwriting to load'); }
});

test('Share… shows only where the browser can share files', async () => {
  three(); const { unmount } = render(<Live />); expect(screen.queryByRole('button', { name: 'Share…' })).toBeNull(); unmount();
  vi.mocked(canShareFiles).mockReturnValue(true); render(<Live />);
  await userEvent.click(screen.getByRole('button', { name: 'Share…' })); expect(share).toHaveBeenCalled(); expect(download).not.toHaveBeenCalled();
});

test('Share… is disabled whenever Download is', () => {
  vi.mocked(canShareFiles).mockReturnValue(true);
  three(); render(<Live />);
  const shareButton = screen.getByRole('button', { name: 'Share…' });
  expect(shareButton).toBeEnabled(); expect(shareButton).toHaveAttribute('title', 'Share…');
  act(() => { setChoose(true); togglePage(0); togglePage(1); togglePage(2); }); expect(dl()).toBeDisabled(); expect(shareButton).toBeDisabled();
  act(() => { setChoose(false); useExportRun.setState({ kind: 'share', done: 0, total: 3 }); }); expect(dl()).toBeDisabled(); expect(shareButton).toBeDisabled();
});

test('Download makes the files; while they are made, the button says how far it has got', async () => {
  three(); render(<Live />); await userEvent.click(dl()); expect(download).toHaveBeenCalled();
  act(() => useExportRun.setState({ kind: 'download', done: 0, total: 3 })); expect(dl()).toHaveAccessibleName('Making page 1 of 3…'); expect(dl()).toBeDisabled();
  act(() => useExportRun.setState({ kind: 'download', done: 1, total: 3 })); expect(dl()).toHaveAccessibleName('Making page 2 of 3…'); expect(dl()).toBeDisabled();
  expect(dl()).not.toHaveAttribute('title');
});

test('the button pressed has the focus again once the files are made', async () => {
  vi.mocked(canShareFiles).mockReturnValue(true);
  three(); render(<Live />);
  for (const b of [dl(), screen.getByRole('button', { name: 'Share…' })]) {
    await userEvent.click(b); expect(b).toHaveFocus();
    // While the run goes the button is disabled, and a browser takes the focus off it (jsdom doesn't).
    act(() => useExportRun.setState({ kind: 'download', done: 0, total: 3 })); act(() => b.blur());
    expect(document.body).toHaveFocus();
    act(() => useExportRun.setState({ ...IDLE_RUN }));
    expect(b).toHaveFocus();
  }
});

test('focus that went somewhere else during the run stays there', async () => {
  three(); render(<Live />);
  await userEvent.click(dl());
  act(() => useExportRun.setState({ kind: 'download', done: 0, total: 3 }));
  const f = screen.getByRole('textbox', { name: 'File name' }); act(() => f.focus());
  act(() => useExportRun.setState({ ...IDLE_RUN }));
  expect(f).toHaveFocus();
});

test('once every page is made, the button says what it makes again while the files are saved', () => {
  // (Separate images are saved about 250 ms apart: the run lasts that long after the last page.)
  three(); render(<Live />);
  act(() => useExportRun.setState({ kind: 'download', done: 3, total: 3 }));
  expect(dl()).toHaveAccessibleName('Download PDF · 3 pages ~902 KB'); expect(dl()).toBeDisabled();
  act(() => useExportRun.setState({ ...IDLE_RUN })); expect(dl()).toBeEnabled();
});

test('every setting set in Export is in the Export panel', () => {
  three(); render(<Live />);
  for (const c of Object.values(SETTING_CONTROLS)) {
    if (c.kind !== 'export') continue;
    expect(screen.queryByRole('switch', { name: c.label }) ?? screen.queryByRole('radiogroup', { name: c.label })).toBeInTheDocument();
  }
});
