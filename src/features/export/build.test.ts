// Making the files: each chosen page drawn by the engine from the frozen copy, encoded by the browser
// (here a stand-in that adds every kind of metadata), scrubbed down to the picture, and wrapped as one
// PDF, one ZIP, or one file a page. The tests read the bytes back with readers that don't trust Nib's.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PAGE_W } from '@/engine/config.js';
import { settings } from '@/engine/core.js';
import { flushSave, update } from '@/store/editor';
import { box, docOf, get, lines, open } from '@/test/docs';
import { JFIF_BARE, NO_METADATA, jpegSegments, latin1, pngChunk, pngChunks, pngFile, pngSize, stubCanvasEncoder } from '@/test/images';
import { PDF_METADATA_KEYS, readPdf } from '@/test/pdf';
import { readZip } from '@/test/zip';
import { buildExport, type ExportFile } from './build';
import type { ExportPlan, Format } from './plan';
import { freeze, renderPage } from './render';

const seen = vi.hoisted(() => [] as string[]);
vi.mock('@/engine/core.js', async orig => {
  const actual = await orig<typeof import('@/engine/core.js')>();
  return {
    ...actual,
    get settings() { return actual.settings; }, // the engine's live S, not a copy taken when the mock was made
    applyLook: vi.fn((c: HTMLCanvasElement, i: number) => { seen.push(actual.settings.look); return actual.applyLook(c, i); }),
  };
});
vi.mock('./render', async orig => {
  const actual = await orig<typeof import('./render')>();
  return { ...actual, renderPage: vi.fn(actual.renderPage) };
});
vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

const { renderPage: renderAt } = await vi.importActual<typeof import('./render')>('./render'); // the real one

const plan = (p: Partial<ExportPlan> = {}): ExportPlan => ({ format: 'pdf', quality: 'standard', zip: true, pages: [0, 1], pageCount: 2, base: 'Notes', ...p });

beforeEach(async () => {
  await flushSave(); vi.clearAllMocks(); seen.length = 0;
  stubCanvasEncoder({ metadata: true });
  open(docOf(box({ id: 'm', text: lines(40) })));
});
afterEach(() => { vi.restoreAllMocks(); vi.mocked(renderPage).mockReset(); });

/** A JPEG's size as its frame header (SOF0) says. */
const sofSize = (jpeg: Uint8Array) => {
  const d = jpegSegments(jpeg).find(s => s.marker === 0xc0)!.data;
  return [(d[3] << 8) | d[4], (d[1] << 8) | d[2]];
};
const BARE_JPEG = [0xe0, 0xdb, 0xc0, 0xc4, 0xda, 0xd9];

test('a PDF: one A4 page per chosen page, at full size, and nothing but the pictures', async () => {
  const [f, ...rest] = await buildExport(plan(), freeze()); expect(rest).toEqual([]);
  expect([f.name, f.type]).toEqual(['Notes.pdf', 'application/pdf']);
  const r = readPdf(f.bytes);
  expect([r.xrefOk, r.pageCount]).toEqual([true, 2]);
  expect(r.pages.map(p => [p.image.width, p.image.height])).toEqual([[1747, 2471], [1747, 2471]]);
  for (const k of PDF_METADATA_KEYS) expect(r.outside).not.toContain(k);
  for (const p of r.pages) {
    expect(jpegSegments(p.image.bytes).map(s => s.marker)).toEqual(BARE_JPEG);
    expect(p.image.bytes.slice(2, 20)).toEqual(JFIF_BARE);
    expect(latin1(p.image.bytes)).not.toMatch(NO_METADATA);
    expect(sofSize(p.image.bytes)).toEqual([p.image.width, p.image.height]);
  }
});
test('Print quality is A4 at 300 dpi', async () => {
  const r = readPdf((await buildExport(plan({ quality: 'print', pages: [1] }), freeze()))[0].bytes);
  expect(r.pages.map(p => [p.image.width, p.image.height])).toEqual([[2480, 3508]]);
  expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.95);
});
test('each page is drawn by the engine at the quality’s size, in order, from the frozen copy', async () => {
  const f = freeze();
  await buildExport(plan({ pages: [0, 1] }), f); await buildExport(plan({ quality: 'print', pages: [1] }), f);
  expect(vi.mocked(renderPage).mock.calls).toEqual([[f, 0, PAGE_W * 2.2], [f, 1, PAGE_W * 2.2], [f, 1, 2480]]);
  expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
});
test('the PDF says each picture is the size its page was drawn at', async () => {
  // writePdf doesn't read the JPEG's own header, so the size it writes must be the canvas's.
  vi.mocked(renderPage).mockImplementationOnce(() => Object.assign(document.createElement('canvas'), { width: 1700, height: 2400 }));
  const r = readPdf((await buildExport(plan(), freeze()))[0].bytes);
  expect(r.pages.map(p => [p.image.width, p.image.height])).toEqual([[1700, 2400], [1747, 2471]]);
  expect(r.pages.map(p => sofSize(p.image.bytes))).toEqual([[1700, 2400], [1747, 2471]]);
});
test('a ZIP of PNGs: one per chosen page, named by page, and nothing but the pictures', async () => {
  const [z] = await buildExport(plan({ format: 'png' }), freeze()); expect([z.name, z.type]).toEqual(['Notes.zip', 'application/zip']);
  const r = readZip(z.bytes); expect(r.entries.map(e => e.name)).toEqual(['Notes-page-1.png', 'Notes-page-2.png']);
  for (const e of r.entries) {
    expect(e.crcOk).toBe(true);
    expect(pngChunks(e.data).map(c => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(pngSize(e.data)).toEqual({ width: 1747, height: 2471 });
    expect(latin1(e.data)).not.toMatch(NO_METADATA);
  }
});
test('JPGs, each on its own, carry only a bare JFIF header', async () => {
  const files = await buildExport(plan({ format: 'jpg', zip: false }), freeze());
  expect(files.map(f => [f.name, f.type])).toEqual([['Notes-page-1.jpg', 'image/jpeg'], ['Notes-page-2.jpg', 'image/jpeg']]);
  for (const f of files) { expect(f.bytes.slice(2, 20)).toEqual(JFIF_BARE); expect(latin1(f.bytes)).not.toMatch(NO_METADATA); }
});
test('one image is named after the document', async () => expect((await buildExport(plan({ format: 'png', pages: [1] }), freeze())).map(f => f.name)).toEqual(['Notes.png']));
test('a left-out page keeps the others’ numbers', async () => {
  open(docOf(box({ id: 'm', text: lines(60) }))); const f = freeze(); expect(f.pages).toBe(3);
  const [z] = await buildExport(plan({ format: 'jpg', pages: [0, 2], pageCount: 3 }), f);
  expect(readZip(z.bytes).entries.map(e => e.name)).toEqual(['Notes-page-1.jpg', 'Notes-page-3.jpg']);
  expect(vi.mocked(renderPage).mock.calls.map(c => c[1])).toEqual([0, 2]);
});

/** Every check the metadata guarantees make of a file, by what it is. */
function expectClean(f: ExportFile): void {
  expect(latin1(f.bytes)).not.toMatch(NO_METADATA);
  const image = (b: Uint8Array, format: Format) => {
    expect(latin1(b)).not.toMatch(NO_METADATA);
    if (format === 'png') expect(pngChunks(b).map(c => [c.type, c.crcOk])).toEqual([['IHDR', true], ['IDAT', true], ['IEND', true]]);
    else { expect(jpegSegments(b).map(s => s.marker)).toEqual(BARE_JPEG); expect(b.slice(2, 20)).toEqual(JFIF_BARE); }
  };
  if (f.type === 'application/pdf') {
    const r = readPdf(f.bytes);
    expect(r.xrefOk).toBe(true);
    expect(r.trailerKeys.sort()).toEqual(['/ID', '/Root', '/Size']);
    for (const k of PDF_METADATA_KEYS) expect(r.outside).not.toContain(k);
    for (const p of r.pages) image(p.image.bytes, 'jpg');
  } else if (f.type === 'application/zip') {
    const r = readZip(f.bytes);
    expect([r.commentLength, r.trailing]).toEqual([0, 0]);
    for (const e of r.entries) {
      expect([e.crcOk, e.local.extraLength, e.central.commentLength, e.central.externalAttrs]).toEqual([true, 0, 0, 0]);
      image(e.data, e.name.endsWith('.png') ? 'png' : 'jpg');
    }
  } else image(f.bytes, f.type === 'image/png' ? 'png' : 'jpg');
}

test.each([
  ['a PDF', { format: 'pdf' }, ['Notes.pdf']],
  ['a one-page PDF', { format: 'pdf', pages: [1] }, ['Notes.pdf']],
  ['a ZIP of PNGs', { format: 'png' }, ['Notes.zip']],
  ['a ZIP of JPGs', { format: 'jpg' }, ['Notes.zip']],
  ['separate PNGs', { format: 'png', zip: false }, ['Notes-page-1.png', 'Notes-page-2.png']],
  ['separate JPGs', { format: 'jpg', zip: false }, ['Notes-page-1.jpg', 'Notes-page-2.jpg']],
  ['one PNG', { format: 'png', pages: [0] }, ['Notes.png']],
  ['one JPG', { format: 'jpg', pages: [0] }, ['Notes.jpg']],
  ['a PDF at print quality', { format: 'pdf', quality: 'print', pages: [0] }, ['Notes.pdf']],
  ['a PNG at print quality', { format: 'png', quality: 'print', pages: [0] }, ['Notes.png']],
] as [string, Partial<ExportPlan>, string[]][])('%s carries no metadata at all', async (_, p, names) => {
  const files = await buildExport(plan(p), freeze());
  expect(files.map(f => f.name)).toEqual(names);
  for (const f of files) expectClean(f);
});

test('edits made while the files are being made don’t get into them', async () => {
  const f = freeze();
  await buildExport(plan({ format: 'png' }), f, done => { if (done === 1) update(s => { s.S.look = 'bw'; }, { history: false }); });
  expect(seen).toEqual(['none', 'none']);
  expect(settings).toBe(get().S); // and the engine is on the open document again
});
test('pages are made one at a time, saying how far it has got', async () => { const onPage = vi.fn(); await buildExport(plan(), freeze(), onPage); expect(onPage.mock.calls).toEqual([[1, 2], [2, 2]]); });
test('between pages the browser gets a turn, so the page stays responsive and the progress can show', async () => {
  let turns = 0;
  const onPage = () => { setTimeout(() => turns++, 0); };
  const drawnAfter: number[] = [];
  vi.mocked(renderPage).mockImplementation((...a) => { drawnAfter.push(turns); return renderAt(...a); });
  await buildExport(plan({ format: 'png' }), freeze(), onPage);
  expect(drawnAfter).toEqual([0, 1]);
});
test('each page’s canvas is let go as soon as it is encoded, before the next page is drawn', async () => {
  const canvases: HTMLCanvasElement[] = [], before: number[][][] = [];
  vi.mocked(renderPage).mockImplementation((...a) => {
    before.push(canvases.map(c => [c.width, c.height]));
    const c = renderAt(...a); canvases.push(c); return c;
  });
  const [z] = await buildExport(plan({ format: 'png' }), freeze());
  expect(before).toEqual([[], [[0, 0]]]);
  expect(canvases.map(c => [c.width, c.height])).toEqual([[0, 0], [0, 0]]);
  expect(readZip(z.bytes).entries.map(e => pngSize(e.data))).toEqual([{ width: 1747, height: 2471 }, { width: 1747, height: 2471 }]); // encoded at full size first
});
test('a page that fails to encode still lets its canvas go', async () => {
  const canvases: HTMLCanvasElement[] = [];
  vi.mocked(renderPage).mockImplementation((...a) => { const c = renderAt(...a); canvases.push(c); return c; });
  vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce(cb => cb(null));
  await expect(buildExport(plan(), freeze())).rejects.toThrow('encode');
  expect(canvases.map(c => [c.width, c.height])).toEqual([[0, 0]]);
});
test('an image the browser can’t make fails the whole export', async () => { vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce(cb => cb(null)); await expect(buildExport(plan(), freeze())).rejects.toThrow('encode'); });
test('a failure on the last page still gives nothing, not the pages before it', async () => {
  vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce(function (this: HTMLCanvasElement, cb, type) { cb(new Blob([pngFile({ width: this.width, height: this.height })], { type })); }).mockImplementationOnce(cb => cb(null));
  await expect(buildExport(plan({ format: 'png', zip: false }), freeze())).rejects.toThrow('encode');
  expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(2);
});
test('a PNG the scrubber refuses fails the export: its bytes are never handed over as they are', async () => {
  vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce(cb => cb(new Blob([pngFile({ width: 4, height: 4, before: [pngChunk('NIBX', 'Nib test')] })]))); // an unknown critical chunk
  await expect(buildExport(plan({ format: 'png', pages: [0] }), freeze())).rejects.toThrow('unknown critical PNG chunk');
});
test('a JPEG the scrubber refuses fails the export too', async () => {
  vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(cb => cb(new Blob([Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)]))); // no frame, no scan
  await expect(buildExport(plan({ format: 'jpg', pages: [0] }), freeze())).rejects.toThrow('not a JPEG');
  await expect(buildExport(plan(), freeze())).rejects.toThrow('not a JPEG');
});
test('with no page chosen there is nothing to make', async () => {
  for (const format of ['pdf', 'png', 'jpg'] as const) await expect(buildExport(plan({ format, pages: [] }), freeze())).rejects.toThrow(RangeError);
  expect(renderPage).not.toHaveBeenCalled();
});

