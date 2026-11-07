// Nib's own PDF writer: one A4 page per JPEG, each picture filling its page, and nothing else in the
// file. Read back three ways: by Nib's strict test reader, as raw bytes, and by pdf.js itself.
import { afterEach, expect, test, vi } from 'vitest';
import { PDF_METADATA_KEYS, readPdf } from '@/test/pdf';
import { A4, writePdf } from './pdf';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const latin1 = (b: Uint8Array): string => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('latin1');
const hex = (b: Uint8Array): string => Array.from(b, x => x.toString(16).padStart(2, '0')).join('').toUpperCase();

const jpeg = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37) & 255); // writePdf embeds the bytes; it doesn't read them
const P = [{ jpeg: new Blob([jpeg(500)]), width: 1747, height: 2471 }, { jpeg: new Blob([jpeg(300)]), width: 1747, height: 2471 }, { jpeg: new Blob([jpeg(10)]), width: 2480, height: 3508 }];
const ID = Uint8Array.from({ length: 16 }, (_, i) => i);
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const read = async (...a: Parameters<typeof writePdf>) => readPdf(await bytesOf(writePdf(...a)));

test('one A4 page per picture, each picture filling its page', async () => {
  const r = await read(P);
  expect([r.version, r.binaryLine, r.xrefOk, r.pageCount]).toEqual(['1.4', true, true, 3]);
  expect(r.pages.map(p => p.mediaBox)).toEqual(Array(3).fill([0, 0, 595.28, 841.89]));
  expect(r.pages.map(p => p.content)).toEqual(Array(3).fill('q 595.28 0 0 841.89 0 0 cm /Im0 Do Q'));
  expect(r.pages.map(p => [p.image.width, p.image.height])).toEqual([[1747, 2471], [1747, 2471], [2480, 3508]]);
  expect(r.pages[0].image.dict).toMatch(/\/Filter \/DCTDecode/); expect(r.pages[0].image.dict).toMatch(/\/ColorSpace \/DeviceRGB/); expect(r.pages[0].image.dict).toMatch(/\/BitsPerComponent 8/);
  expect(r.pages[1].image.bytes).toEqual(jpeg(300));
  expect([A4.w, A4.h]).toEqual([595.28, 841.89]);
});

test('the PDF is a Blob of its parts, typed as a PDF, so no page’s bytes are copied into one array', () => {
  const f = writePdf(P, ID);
  expect(f).toBeInstanceOf(Blob);
  expect(f.type).toBe('application/pdf');
});

test('no document information and no XMP: only the size, the root and a file ID', async () => {
  const r = await read(P);
  for (const k of PDF_METADATA_KEYS) expect(r.outside).not.toContain(k);
  expect(r.trailerKeys).toEqual(['/Size', '/Root', '/ID']);
});

test('every PDF gets a random file ID, the same in both places', async () => {
  const a = (await read(P)).id!, b = (await read(P)).id!;
  expect(a[0]).toMatch(/^[0-9A-F]{32}$/); expect(a[1]).toBe(a[0]); expect(b[0]).not.toBe(a[0]);
  expect((await read(P, ID)).id).toEqual(['000102030405060708090A0B0C0D0E0F', '000102030405060708090A0B0C0D0E0F']);
});

test('the same pictures and ID give the same bytes', async () => expect(await bytesOf(writePdf(P, ID))).toEqual(await bytesOf(writePdf(P, ID))));

test('a PDF needs a page and a 16-byte ID', () => { expect(() => writePdf([])).toThrow(RangeError); expect(() => writePdf(P, new Uint8Array(8))).toThrow(RangeError); });

test('a picture needs bytes and a size in whole pixels', () => {
  for (const bad of [{ width: 0, height: 10 }, { width: 10, height: -1 }, { width: 10.5, height: 10 }, { width: NaN, height: 10 }])
    expect(() => writePdf([{ jpeg: new Blob([jpeg(10)]), ...bad }], ID)).toThrow(RangeError);
  expect(() => writePdf([{ jpeg: new Blob([]), width: 10, height: 10 }], ID)).toThrow(RangeError);
});

test('the bytes are exactly the layout, with \\n line ends', async () => {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    '4 0 obj\n<< /Length 36 >>\nstream\nq 595.28 0 0 841.89 0 0 cm /Im0 Do Q\nendstream\nendobj\n',
    '5 0 obj\n<< /Type /XObject /Subtype /Image /Width 2 /Height 3 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 4 >>\nstream\n\xFF\xD8\xFF\xD9\nendstream\nendobj\n',
  ];
  const head = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  let at = head.length;
  const offsets = objects.map(o => { const start = at; at += o.length; return start; });
  const xref = 'xref\n0 6\n0000000000 65535 f \n' + offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R /ID [<${hex(ID)}> <${hex(ID)}>] >>\nstartxref\n${at}\n%%EOF\n`;
  expect(latin1(await bytesOf(writePdf([{ jpeg: new Blob([Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)]), width: 2, height: 3 }], ID)))).toBe(head + objects.join('') + xref + trailer);
});

test('in the bytes themselves: no /Info, no /Metadata, no Producer, no CreationDate, and one random ID written twice', async () => {
  const id = (s: string): string => {
    const m = [...s.matchAll(/\/ID \[<([0-9A-F]{32})> <([0-9A-F]{32})>\]/g)];
    expect(m).toHaveLength(1); expect(m[0][2]).toBe(m[0][1]);
    expect(s.split('/ID').length - 1).toBe(1); expect(s.split(m[0][1]).length - 1).toBe(2);
    return m[0][1];
  };
  const a = latin1(await bytesOf(writePdf(P))), b = latin1(await bytesOf(writePdf(P)));
  for (const s of [a, b]) for (const k of ['/Info', '/Metadata', 'Producer', 'CreationDate', 'Creator', 'ModDate', 'Author', 'Title']) expect(s).not.toContain(k);
  expect(id(a)).not.toBe(id(b));
});

// Two real 24 × 34 JPEGs (one baseline, one progressive), so pdf.js has pictures to decode.
const BASELINE = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAiABgDASIAAhEBAxEB/8QAGAABAQEBAQAAAAAAAAAAAAAAAAMFBAb/xAAoEAAABQMCBgIDAAAAAAAAAAAAAQIEEQNU0ROjBRIUIVGRFaEiVZL/xAAWAQEBAQAAAAAAAAAAAAAAAAAAAQL/xAAZEQEAAwEBAAAAAAAAAAAAAAAAATHwEVH/2gAMAwEAAhEDEQA/APTQ1t9g8BDW32DwIcSavXrdNOhWJqol8xrRUVJlB9uxF5+hmfBcW/b1f7XkbjnqNqGtvsHgBycLZP2Or1Drq+eI56ivxifM+foBJGhpLuKnpOA0l3FT0nAlDW32DwENbfYPAmoV0l3FT0nACUNbfYPABqHUAAMNAAAD/9k=';
const PROGRESSIVE = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wgARCAAiABgDASIAAhEBAxEB/8QAGAABAAMBAAAAAAAAAAAAAAAAAAIDBAX/xAAVAQEBAAAAAAAAAAAAAAAAAAAAAf/aAAwDAQACEAMQAAAB6avNZtUjQiiSItEoH//EABoQAAIDAQEAAAAAAAAAAAAAAAACAxEiEyD/2gAIAQEAAQUCyZMkiu68JSJHQoooyZM+P//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQMBAT8BX//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQIBAT8BX//EAB0QAAICAgMBAAAAAAAAAAAAAAAyAaESgQIRIDP/2gAIAQEABj8CWhaFo6icdn1knLllsaRpGkWhaFrx/8QAHBAAAgICAwAAAAAAAAAAAAAAABEB8RAgIUFR/9oACAEBAAE/Ic22MN23Ei2k7M/ZcDUDUDUb23//2gAMAwEAAgADAAAAECzc8wQf/8QAFBEBAAAAAAAAAAAAAAAAAAAAIP/aAAgBAwEBPxBf/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAEx8BARUf/aAAgBAgEBPxBa6MsFjP8A/8QAHxAAAQQCAgMAAAAAAAAAAAAAEQAB0fEhUSChQcHw/9oACAEBAAE/EBZhCzCFmExiYMcdg+MM2+l9f7WmmPEHZ30qyCrIKsghZhCzCFmOH//Z';
const b64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(Buffer.from(s, 'base64'));

async function pdfjsLib() {
  // pdf.js wants DOMMatrix only to draw. This test only reads, so a stand-in keeps its import from
  // warning that it couldn't polyfill one.
  if (!('DOMMatrix' in globalThis)) vi.stubGlobal('DOMMatrix', class {});
  const m = await import('pdfjs-dist/legacy/build/pdf.js');
  return (m as unknown as { default?: typeof m }).default ?? m;
}

test('pdf.js opens it: two A4 pages, a decoded picture on each, and no document information or XMP', async () => {
  const pdfjs = await pdfjsLib();
  const id = crypto.getRandomValues(new Uint8Array(16));
  const file = await bytesOf(writePdf([{ jpeg: new Blob([b64(BASELINE)]), width: 24, height: 34 }, { jpeg: new Blob([b64(PROGRESSIVE)]), width: 24, height: 34 }], id));
  const said = [vi.spyOn(console, 'log').mockImplementation(() => {}), vi.spyOn(console, 'warn').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {})];
  const task = pdfjs.getDocument({ data: file.slice(), verbosity: pdfjs.VerbosityLevel.WARNINGS, isEvalSupported: false });
  try {
    const doc = await task.promise;
    expect(doc.numPages).toBe(2);
    expect(doc.fingerprints).toEqual([hex(id).toLowerCase(), null]); // pdf.js read the /ID, and its two halves are the same
    const { info, metadata } = await doc.getMetadata();
    expect(metadata).toBeNull();
    // Only what pdf.js works out itself: no Title, Author, Subject, Keywords, Creator, Producer, dates or Custom.
    expect(info).toEqual({ PDFFormatVersion: '1.4', Language: null, EncryptFilterName: null, IsLinearized: false, IsAcroFormPresent: false, IsXFAPresent: false, IsCollectionPresent: false, IsSignaturesPresent: false });
    for (const n of [1, 2]) {
      const page = await doc.getPage(n);
      expect(page.view).toEqual([0, 0, A4.w, A4.h]);
      const ops = await page.getOperatorList();
      const drawn = ops.fnArray.map((fn, k) => [fn, ops.argsArray[k]] as const).filter(([fn]) => fn !== pdfjs.OPS.dependency);
      expect(drawn.map(([fn]) => fn)).toEqual([pdfjs.OPS.save, pdfjs.OPS.transform, pdfjs.OPS.paintImageXObject, pdfjs.OPS.restore]);
      expect(drawn[1][1]).toEqual([A4.w, 0, 0, A4.h, 0, 0]);
      const [objId, w, h] = drawn[2][1] as [string, number, number];
      expect([w, h]).toEqual([24, 34]);
      const img = await new Promise<{ width: number; height: number; data: Uint8ClampedArray }>(done => page.objs.get(objId, done));
      expect([img.width, img.height, img.data.length]).toEqual([24, 34, 24 * 34 * 3]);
    }
  } finally {
    await task.destroy();
  }
  for (const s of said) expect(s).not.toHaveBeenCalled();
});
