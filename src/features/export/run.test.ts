// Download and Share: the files made from the document as it was when the button was pressed, saved
// through a link to each, or handed to the system share sheet, with one message saying what happened.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import { flushSave, openDocument, update } from '@/store/editor';
import { box, docOf, get, lastToast, lastToastAction, lines, rec } from '@/test/docs';
import { NO_METADATA, latin1, stubCanvasEncoder } from '@/test/images';
import { PDF_METADATA_KEYS, readPdf } from '@/test/pdf';
import { freeze } from './render';
import { canShareFiles, currentPlan, download, saveFiles, share } from './run';
import { DEFAULT_PREFS, IDLE_RUN, setChoose, setExportPrefs, togglePage, useExportPick, useExportPrefs, useExportRun, type ExportRun } from './state';

vi.mock('@/store/documents', async orig => ({ ...await orig<typeof import('@/store/documents')>(), putDoc: vi.fn(async () => {}), setPref: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

// jsdom can't make an object URL or follow a download link: each link's address is a stand-in for its
// Blob, and a click records the name it would save under. These stay in place for the whole file, so a
// 30 s revoke that is still waiting when a test ends always finds them.
const blobs = new Map<string, Blob>();
let made = 0;
const createObjectURL = vi.fn((b: Blob) => { const url = `blob:nib/${++made}`; blobs.set(url, b); return url; });
const revokeObjectURL = vi.fn((_url: string) => {});
Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });
const saved: string[] = [];
const links: { href: string; download: string; rel: string; inPage: boolean }[] = [];

beforeEach(async () => {
  await flushSave(); vi.clearAllMocks();
  saved.length = 0; links.length = 0; blobs.clear();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push(this.download);
    links.push({ href: this.href, download: this.download, rel: this.rel, inPage: this.isConnected });
  });
  stubCanvasEncoder();
  useExportPrefs.setState({ ...DEFAULT_PREFS }); useExportPick.setState({ choose: false, out: [] }); useExportRun.setState({ ...IDLE_RUN });
  openDocument(rec('Seeded', docOf(box({ id: 'm', text: lines(40) }))));
});
afterEach(() => {
  vi.restoreAllMocks(); vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'share'); Reflect.deleteProperty(navigator, 'canShare');
});

/**
 * A browser that can share files: `canShare` accepts the one-byte `page.pdf` it is probed with, and
 * the real files when `canShareReal`. `share` resolves, after rejecting once with `rejectOnce` if given.
 */
function stubShare(rejectOnce?: unknown, canShareReal = true): void {
  const probe = (d?: ShareData) => d?.files?.length === 1 && d.files[0].name === 'page.pdf' && d.files[0].size === 1;
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn((d?: ShareData) => probe(d) || canShareReal) });
  const fn = vi.fn(async (_d?: ShareData) => {});
  if (rejectOnce !== undefined) fn.mockRejectedValueOnce(rejectOnce);
  Object.defineProperty(navigator, 'share', { configurable: true, value: fn });
}
const shared = (k = 0): File[] => vi.mocked(navigator.share).mock.calls[k][0]!.files!;
const settle = () => new Promise(r => setTimeout(r, 0));

test('the plan is the device’s choices and the page choice, for the frozen copy', () => {
  setExportPrefs({ format: 'jpg', quality: 'print', zip: false }); setChoose(true); togglePage(1);
  update(s => { s.doc.fileName = 'Week 1'; }, { history: false });
  expect(currentPlan(freeze())).toEqual({ format: 'jpg', quality: 'print', zip: false, pages: [0], pageCount: 2, base: 'Week 1' });
});
test('Download saves the PDF under the document’s name and says so', async () => { await download(); expect(saved).toEqual(['Seeded.pdf']); expect(lastToast()).toBe('Saved Seeded.pdf'); });
test('what is saved is the file that was made, with nothing added', async () => {
  vi.mocked(HTMLCanvasElement.prototype.toBlob).mockRestore(); stubCanvasEncoder({ metadata: true });
  await download();
  const b = blobs.get(createObjectURL.mock.results[0].value as string)!;
  expect(b.type).toBe('application/pdf');
  const bytes = new Uint8Array(await b.arrayBuffer()), r = readPdf(bytes);
  expect([r.xrefOk, r.pageCount]).toEqual([true, 2]);
  for (const k of PDF_METADATA_KEYS) expect(r.outside).not.toContain(k);
  expect(latin1(bytes)).not.toMatch(NO_METADATA);
});
test('a typed file name wins', async () => { update(s => { s.doc.fileName = 'Week 1'; }, { history: false }); await download(); expect(saved).toEqual(['Week 1.pdf']); });
test('several images without a ZIP are saved one by one', async () => { setExportPrefs({ format: 'png', zip: false }); await download(); expect(saved).toEqual(['Seeded-page-1.png', 'Seeded-page-2.png']); expect(lastToast()).toBe('Saved 2 images'); });
test('several images in a ZIP are one file', async () => { setExportPrefs({ format: 'jpg' }); await download(); expect(saved).toEqual(['Seeded.zip']); expect(lastToast()).toBe('Saved Seeded.zip'); });
test('only the chosen pages are made', async () => { setExportPrefs({ format: 'png' }); setChoose(true); togglePage(0); await download(); expect(saved).toEqual(['Seeded.png']); });
test('with no page chosen, Download does nothing', async () => {
  setChoose(true); togglePage(0); togglePage(1);
  await download();
  expect([saved, lastToast()]).toEqual([[], undefined]);
  expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled();
  expect(useExportRun.getState()).toEqual(IDLE_RUN);
});
test('while it works the run says how far it has got, and a second Download meanwhile does nothing', async () => { const p = download(); expect(useExportRun.getState()).toMatchObject({ kind: 'download', total: 2 }); await download(); await p; expect(saved).toHaveLength(1); expect(useExportRun.getState()).toEqual(IDLE_RUN); });
test('the run counts the pages as they are made, then goes back to idle', async () => {
  const states: ExportRun[] = [], stop = useExportRun.subscribe(s => { states.push({ ...s }); });
  await download(); stop();
  expect(states).toEqual([{ kind: 'download', done: 0, total: 2 }, { kind: 'download', done: 1, total: 2 }, { kind: 'download', done: 2, total: 2 }, IDLE_RUN]);
});
test('a download keeps the document as it was when Download was pressed, even if another one is opened', async () => {
  const p = download();
  openDocument(rec('Other', docOf(box({ text: 'x' }))));
  await p;
  expect(saved).toEqual(['Seeded.pdf']); expect(lastToast()).toBe('Saved Seeded.pdf');
});
test('Download and Share change nothing in the document or its history', async () => {
  stubShare();
  const before = { json: JSON.stringify({ S: get().S, doc: get().doc }), version: get().version, undo: [get().canUndo, get().canRedo] };
  await download(); await share();
  expect({ json: JSON.stringify({ S: get().S, doc: get().doc }), version: get().version, undo: [get().canUndo, get().canRedo] }).toEqual(before);
});
test('a file Nib can’t make says so and saves nothing', async () => { vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(cb => cb(null)); await download(); expect(saved).toEqual([]); expect(lastToast()).toBe('Nib couldn’t make the PDF. Try again.'); expect(useExportRun.getState()).toEqual(IDLE_RUN); });
test('…and at print quality, it suggests Standard', async () => { setExportPrefs({ quality: 'print' }); vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(cb => cb(null)); await download(); expect(lastToast()).toBe('Nib couldn’t make the PDF at print quality. Try Standard quality.'); });
test('an image the scrubber refuses stops the export: nothing unscrubbed is saved', async () => {
  vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(cb => cb(new Blob([Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)]))); // no frame, no scan
  await download();
  expect(saved).toEqual([]); expect(createObjectURL).not.toHaveBeenCalled();
  expect(lastToast()).toBe('Nib couldn’t make the PDF. Try again.');
  expect(useExportRun.getState()).toEqual(IDLE_RUN);
});

test('each file is saved through a link to its bytes, about a quarter of a second apart, and each address is let go after 30 s', async () => {
  vi.useFakeTimers();
  const p = saveFiles([
    { name: 'a.png', type: 'image/png', bytes: Uint8Array.of(1, 2, 3) },
    { name: 'b.jpg', type: 'image/jpeg', bytes: Uint8Array.of(4, 5) },
  ]);
  expect(saved).toEqual(['a.png']);
  await vi.advanceTimersByTimeAsync(240); expect(saved).toEqual(['a.png']);
  await vi.advanceTimersByTimeAsync(20); expect(saved).toEqual(['a.png', 'b.jpg']);
  await p;
  expect(links).toEqual([
    { href: 'blob:nib/' + (made - 1), download: 'a.png', rel: 'noopener', inPage: true },
    { href: 'blob:nib/' + made, download: 'b.jpg', rel: 'noopener', inPage: true },
  ]);
  expect(document.querySelectorAll('a').length).toBe(0); // each link is gone once clicked
  const [a, b] = links.map(l => blobs.get(l.href)!);
  expect([a.type, new Uint8Array(await a.arrayBuffer())]).toEqual(['image/png', Uint8Array.of(1, 2, 3)]);
  expect([b.type, new Uint8Array(await b.arrayBuffer())]).toEqual(['image/jpeg', Uint8Array.of(4, 5)]);
  await vi.advanceTimersByTimeAsync(29_700); expect(revokeObjectURL).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(100); expect(revokeObjectURL.mock.calls).toEqual([[links[0].href]]);
  await vi.advanceTimersByTimeAsync(300); expect(revokeObjectURL.mock.calls).toEqual([[links[0].href], [links[1].href]]);
});

test('Share is offered only where the browser can share files', () => {
  expect(canShareFiles()).toBe(false); stubShare(); expect(canShareFiles()).toBe(true);
  expect(vi.mocked(navigator.canShare).mock.calls[0][0]!.files![0]).toMatchObject({ name: 'page.pdf', type: 'application/pdf', size: 1 });
  vi.mocked(navigator.canShare).mockReturnValue(false); expect(canShareFiles()).toBe(false);
  vi.mocked(navigator.canShare).mockImplementation(() => { throw new TypeError('no'); }); expect(canShareFiles()).toBe(false);
  Reflect.deleteProperty(navigator, 'share'); vi.mocked(navigator.canShare).mockReturnValue(true); expect(canShareFiles()).toBe(false);
});
test('a browser that can’t make a File isn’t offered Share, and asking doesn’t throw', () => {
  stubShare(); vi.stubGlobal('File', undefined);
  try { expect(canShareFiles()).toBe(false); } finally { vi.unstubAllGlobals(); }
  expect(canShareFiles()).toBe(true);
});
test('Share sends the PDF to the share sheet, and nothing else', async () => { stubShare(); await share(); expect(navigator.share).toHaveBeenCalledWith({ files: [expect.objectContaining({ name: 'Seeded.pdf', type: 'application/pdf' })] }); });
test('the shared file is the file that was made', async () => {
  vi.mocked(HTMLCanvasElement.prototype.toBlob).mockRestore(); stubCanvasEncoder({ metadata: true }); stubShare();
  await share();
  const r = readPdf(new Uint8Array(await shared()[0].arrayBuffer()));
  expect([r.xrefOk, r.pageCount]).toEqual([true, 2]);
  for (const k of PDF_METADATA_KEYS) expect(r.outside).not.toContain(k);
  expect(saved).toEqual([]); // and nothing is downloaded
});
test('images are shared as images, not in a ZIP', async () => {
  stubShare(); setExportPrefs({ format: 'png' }); await share();
  expect(shared().map(f => [f.name, f.type])).toEqual([['Seeded-page-1.png', 'image/png'], ['Seeded-page-2.png', 'image/png']]);
  expect(useExportPrefs.getState().zip).toBe(true); // the device’s choice is left as it was
});
test('while it shares the run says so, and Download meanwhile does nothing', async () => {
  stubShare(); const p = share();
  expect(useExportRun.getState()).toMatchObject({ kind: 'share', done: 0, total: 2 });
  await download(); await p;
  expect(saved).toEqual([]); expect(navigator.share).toHaveBeenCalledTimes(1);
  expect(useExportRun.getState()).toEqual(IDLE_RUN);
});
test('a file Nib can’t make for sharing says so and shares nothing', async () => {
  stubShare(); setExportPrefs({ format: 'png' }); vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(cb => cb(null));
  await share();
  expect(navigator.share).not.toHaveBeenCalled(); expect(lastToast()).toBe('Nib couldn’t make the images. Try again.');
  expect(useExportRun.getState()).toEqual(IDLE_RUN);
});
test('the run ends as the share sheet opens, so Download works while it is open', async () => {
  stubShare();
  let close!: () => void;
  vi.mocked(navigator.share).mockImplementationOnce(() => new Promise<void>(r => { close = r; }));
  const states: ExportRun[] = [], stop = useExportRun.subscribe(s => { states.push({ ...s }); });
  const p = share();
  await vi.waitFor(() => expect(navigator.share).toHaveBeenCalled());
  expect(states.at(-1)).toEqual(IDLE_RUN); // already idle when the sheet was asked for
  expect(useExportRun.getState()).toEqual(IDLE_RUN);
  const d = download(); expect(useExportRun.getState().kind).toBe('download');
  close(); await p;
  expect(useExportRun.getState().kind).toBe('download'); // the sheet closing doesn't end the download’s run
  await d; stop();
  expect(saved).toEqual(['Seeded.pdf']); expect(useExportRun.getState()).toEqual(IDLE_RUN);
});
test('closing the share sheet says nothing', async () => { stubShare(new DOMException('', 'AbortError')); await share(); expect(lastToast()).toBeUndefined(); expect(useExportRun.getState()).toEqual(IDLE_RUN); });
test('when the browser wants a fresh tap, the message offers Share with the same files', async () => {
  stubShare(new DOMException('', 'NotAllowedError')); await share(); expect(lastToast()).toBe('Ready to share.');
  expect(vi.mocked(sonner).mock.calls.at(-1)![1]).toMatchObject({ action: { label: 'Share' }, duration: 15_000 }); // long enough to tap on a phone, which can't pause it
  expect(useExportRun.getState()).toEqual(IDLE_RUN);
  const made = vi.mocked(HTMLCanvasElement.prototype.toBlob).mock.calls.length;
  lastToastAction()!(); // the tap: the sheet is asked for at once, inside it
  expect(navigator.share).toHaveBeenCalledTimes(2);
  expect(vi.mocked(navigator.share).mock.calls[1][0]).toBe(vi.mocked(navigator.share).mock.calls[0][0]);
  await settle();
  expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(made); // nothing is made again
  expect(lastToast()).toBe('Ready to share.'); expect(vi.mocked(sonner)).toHaveBeenCalledTimes(1);
});
test('the fresh tap’s share is handled the same way', async () => {
  stubShare(new DOMException('', 'NotAllowedError')); await share();
  vi.mocked(navigator.share).mockRejectedValueOnce(new DOMException('', 'NotAllowedError'));
  lastToastAction()!(); await settle();
  expect(vi.mocked(sonner)).toHaveBeenCalledTimes(2); expect(lastToast()).toBe('Ready to share.');
  vi.mocked(navigator.share).mockRejectedValueOnce(new DOMException('', 'AbortError'));
  lastToastAction()!(); await settle();
  expect(vi.mocked(sonner)).toHaveBeenCalledTimes(2);
  vi.mocked(navigator.share).mockRejectedValueOnce(new Error('x'));
  lastToastAction()!(); await settle();
  expect(lastToast()).toBe('Nib couldn’t share that. Use Download instead.');
  expect(vi.mocked(navigator.share).mock.calls.every(c => c[0] === vi.mocked(navigator.share).mock.calls[0][0])).toBe(true);
});
test('the fresh tap’s share runs outside any run: idle while its sheet is open, and a download’s run left alone', async () => {
  stubShare(new DOMException('', 'NotAllowedError')); await share();
  let close!: () => void;
  vi.mocked(navigator.share).mockImplementationOnce(() => new Promise<void>(r => { close = r; }));
  lastToastAction()!();
  expect(navigator.share).toHaveBeenCalledTimes(2); expect(useExportRun.getState()).toEqual(IDLE_RUN);
  close(); await settle();
  const d = download(); lastToastAction()!(); // a tap on the message while a download is being made
  expect(navigator.share).toHaveBeenCalledTimes(3); expect(useExportRun.getState().kind).toBe('download');
  await settle(); expect(useExportRun.getState().kind).toBe('download');
  await d; expect(useExportRun.getState()).toEqual(IDLE_RUN);
});
test('files this browser can’t share are said so', async () => { stubShare(undefined, false); await share(); expect(lastToast()).toBe('This browser can’t share these files. Use Download instead.'); expect(navigator.share).not.toHaveBeenCalled(); });
test('another share failure says so', async () => { stubShare(new Error('x')); await share(); expect(lastToast()).toBe('Nib couldn’t share that. Use Download instead.'); expect(useExportRun.getState()).toEqual(IDLE_RUN); });
test('with no page chosen, Share does nothing', async () => { stubShare(); setChoose(true); togglePage(0); togglePage(1); await share(); expect(navigator.share).not.toHaveBeenCalled(); expect(lastToast()).toBeUndefined(); });
