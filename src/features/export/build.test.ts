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
import { crc32 } from './crc32';
import { scrubJpeg } from './jpeg';
import type { ExportPlan, Format } from './plan';
import { scrubPng } from './png';
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
vi.mock('./png', async orig => { const actual = await orig<typeof import('./png')>(); return { ...actual, scrubPng: vi.fn(actual.scrubPng) }; });
vi.mock('./jpeg', async orig => { const actual = await orig<typeof import('./jpeg')>(); return { ...actual, scrubJpeg: vi.fn(actual.scrubJpeg) }; });
vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

const { renderPage: renderAt } = await vi.importActual<typeof import('./render')>('./render'); // the real one

const bytesOf = async (f: ExportFile) => new Uint8Array(await f.blob.arrayBuffer());

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
  expect([f.name, f.blob.type]).toEqual(['Notes.pdf', 'application/pdf']);
  const r = readPdf(await bytesOf(f));
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
  const r = readPdf(await bytesOf((await buildExport(plan({ quality: 'print', pages: [1] }), freeze()))[0]));
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
  const r = readPdf(await bytesOf((await buildExport(plan(), freeze()))[0]));
  expect(r.pages.map(p => [p.image.width, p.image.height])).toEqual([[1700, 2400], [1747, 2471]]);
  expect(r.pages.map(p => sofSize(p.image.bytes))).toEqual([[1700, 2400], [1747, 2471]]);
});
test('a ZIP of PNGs: one per chosen page, named by page, and nothing but the pictures', async () => {
  const [z] = await buildExport(plan({ format: 'png' }), freeze()); expect([z.name, z.blob.type]).toEqual(['Notes.zip', 'application/zip']);
  const r = readZip(await bytesOf(z)); expect(r.entries.map(e => e.name)).toEqual(['Notes-page-1.png', 'Notes-page-2.png']);
  for (const e of r.entries) {
    expect(e.crcOk).toBe(true);
    expect(pngChunks(e.data).map(c => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(pngSize(e.data)).toEqual({ width: 1747, height: 2471 });
    expect(latin1(e.data)).not.toMatch(NO_METADATA);
  }
});
test('JPGs, each on its own, carry only a bare JFIF header', async () => {
  const files = await buildExport(plan({ format: 'jpg', zip: false }), freeze());
  expect(files.map(f => [f.name, f.blob.type])).toEqual([['Notes-page-1.jpg', 'image/jpeg'], ['Notes-page-2.jpg', 'image/jpeg']]);
  for (const f of files) { const b = await bytesOf(f); expect(b.slice(2, 20)).toEqual(JFIF_BARE); expect(latin1(b)).not.toMatch(NO_METADATA); }
});
test('one image is named after the document', async () => expect((await buildExport(plan({ format: 'png', pages: [1] }), freeze())).map(f => f.name)).toEqual(['Notes.png']));
test('a left-out page keeps the others’ numbers', async () => {
  open(docOf(box({ id: 'm', text: lines(60) }))); const f = freeze(); expect(f.pages).toBe(3);
  const [z] = await buildExport(plan({ format: 'jpg', pages: [0, 2], pageCount: 3 }), f);
  expect(readZip(await bytesOf(z)).entries.map(e => e.name)).toEqual(['Notes-page-1.jpg', 'Notes-page-3.jpg']);
  expect(vi.mocked(renderPage).mock.calls.map(c => c[1])).toEqual([0, 2]);
});

/** Every check the metadata guarantees make of a file, by what it is. */
async function expectClean(f: ExportFile): Promise<void> {
  const bytes = await bytesOf(f);
  expect(latin1(bytes)).not.toMatch(NO_METADATA);
  const image = (b: Uint8Array, format: Format) => {
    expect(latin1(b)).not.toMatch(NO_METADATA);
    if (format === 'png') expect(pngChunks(b).map(c => [c.type, c.crcOk])).toEqual([['IHDR', true], ['IDAT', true], ['IEND', true]]);
    else { expect(jpegSegments(b).map(s => s.marker)).toEqual(BARE_JPEG); expect(b.slice(2, 20)).toEqual(JFIF_BARE); }
  };
  if (f.blob.type === 'application/pdf') {
    const r = readPdf(bytes);
    expect(r.xrefOk).toBe(true);
    expect(r.trailerKeys.sort()).toEqual(['/ID', '/Root', '/Size']);
    for (const k of PDF_METADATA_KEYS) expect(r.outside).not.toContain(k);
    for (const p of r.pages) image(p.image.bytes, 'jpg');
  } else if (f.blob.type === 'application/zip') {
    const r = readZip(bytes);
    expect([r.commentLength, r.trailing]).toEqual([0, 0]);
    for (const e of r.entries) {
      expect([e.crcOk, e.local.extraLength, e.central.commentLength, e.central.externalAttrs]).toEqual([true, 0, 0, 0]);
      image(e.data, e.name.endsWith('.png') ? 'png' : 'jpg');
    }
  } else image(bytes, f.blob.type === 'image/png' ? 'png' : 'jpg');
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
  for (const f of files) await expectClean(f);
});

// ---- The files are held as Blobs, and their bytes are still exactly what they were ----

// The writers as they were at 20d8938, when each file was made as one Uint8Array, kept here only to show
// that holding the pages as Blobs changed how the bytes are held and not one byte of them.
const ascii = (t: string): Uint8Array<ArrayBuffer> => Uint8Array.from(t, c => c.charCodeAt(0));
const concat = (parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of parts) { out.set(b, at); at += b.length; }
  return out;
};
function pdfAsItWas(pages: { jpeg: Uint8Array; width: number; height: number }[], id: Uint8Array): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [], offsets: number[] = [];
  let size = 0;
  const push = (b: Uint8Array) => { parts.push(b); size += b.length; };
  const text = (t: string) => push(ascii(t));
  const object = (dict: string, stream?: Uint8Array) => {
    offsets.push(size);
    text(`${offsets.length} 0 obj\n${dict}\n`);
    if (stream) { text('stream\n'); push(stream); text('\nendstream\n'); }
    text('endobj\n');
  };
  text('%PDF-1.4\n');
  push(Uint8Array.of(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a));
  const w = '595.28', h = '841.89', draw = ascii(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
  object('<< /Type /Catalog /Pages 2 0 R >>');
  object(`<< /Type /Pages /Kids [${pages.map((_, k) => `${3 + 3 * k} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach(({ jpeg, width, height }, k) => {
    const p = 3 + 3 * k;
    object(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`);
    object(`<< /Length ${draw.length} >>`, draw);
    object(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  });
  const xref = size, count = offsets.length + 1;
  text(`xref\n0 ${count}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  const hex = Array.from(id, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  text(`trailer\n<< /Size ${count} /Root 1 0 R /ID [<${hex}> <${hex}>] >>\nstartxref\n${xref}\n%%EOF\n`);
  return concat(parts);
}
function zipAsItWas(files: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let size = 0;
  const push = (b: Uint8Array) => { parts.push(b); size += b.length; };
  const shared = (v: DataView, at: number, flags: number, crc: number, length: number, nameLength: number) => {
    v.setUint16(at, 20, true); v.setUint16(at + 2, flags, true); v.setUint16(at + 4, 0, true); v.setUint16(at + 6, 0, true); v.setUint16(at + 8, 0x21, true);
    v.setUint32(at + 10, crc, true); v.setUint32(at + 14, length, true); v.setUint32(at + 18, length, true); v.setUint16(at + 22, nameLength, true); v.setUint16(at + 24, 0, true);
  };
  files.forEach(({ name: n, data }) => {
    const name = new TextEncoder().encode(n), flags = name.some(b => b >= 0x80) ? 0x0800 : 0, crc = crc32(data), offset = size;
    const local = new Uint8Array(30), l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); shared(l, 4, flags, crc, data.length, name.length);
    push(local); push(name); push(data);
    const entry = new Uint8Array(46), c = new DataView(entry.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); shared(c, 6, flags, crc, data.length, name.length); c.setUint32(42, offset, true);
    central.push(entry, name);
  });
  const cdOffset = size;
  for (const b of central) push(b);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size - cdOffset, true); e.setUint32(16, cdOffset, true);
  push(end);
  return concat(parts);
}

test.each([
  ['a PDF', { format: 'pdf' }],
  ['a PDF at print quality', { format: 'pdf', quality: 'print' }],
  ['a ZIP of PNGs', { format: 'png' }],
  ['a ZIP of JPGs', { format: 'jpg' }],
  ['a single PNG', { format: 'png', pages: [1] }],
  ['a single JPG', { format: 'jpg', pages: [0] }],
] as [string, Partial<ExportPlan>][])('%s has exactly the bytes it had when each file was made as one array', async (_, p) => {
  const ID = Uint8Array.from({ length: 16 }, (_, i) => 0xa0 + i);
  const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(a: T): T => { (a as unknown as Uint8Array).set(ID); return a; });
  const pl = plan(p), [f, ...rest] = await buildExport(pl, freeze());
  // The pages exactly as the scrubbers gave them, in order.
  const pages = [...vi.mocked(scrubPng).mock.results, ...vi.mocked(scrubJpeg).mock.results].map(r => r.value as Uint8Array);
  expect(pages).toHaveLength(pl.pages.length);
  const [w, h] = pl.quality === 'print' ? [2480, 3508] : [1747, 2471];
  const before = pl.format === 'pdf' ? pdfAsItWas(pages.map(jpeg => ({ jpeg, width: w, height: h })), ID)
    : pl.pages.length > 1 ? zipAsItWas(pages.map((data, k) => ({ name: `Notes-page-${pl.pages[k] + 1}.${pl.format}`, data })))
      : pages[0];
  expect(rest).toEqual([]);
  expect(await bytesOf(f)).toEqual(before);
  if (pl.format === 'pdf') expect(random).toHaveBeenCalledTimes(1);
});
test('separate images each have exactly the bytes the scrubber gave', async () => {
  const files = await buildExport(plan({ format: 'png', zip: false }), freeze());
  expect(await Promise.all(files.map(bytesOf))).toEqual(vi.mocked(scrubPng).mock.results.map(r => r.value));
  expect(files.map(f => f.blob.type)).toEqual(['image/png', 'image/png']);
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
  expect(readZip(await bytesOf(z)).entries.map(e => pngSize(e.data))).toEqual([{ width: 1747, height: 2471 }, { width: 1747, height: 2471 }]); // encoded at full size first
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

