// Real PNG and JPEG bytes for the export tests, built (and read back) independently of the scrubbers,
// so the tests don't trust the code they check. Tests run in Node (tsconfig.test.json gives them its types).
import { crc32, deflateSync } from 'node:zlib';
import { vi, type MockInstance } from 'vitest';

export const latin1 = (b: Uint8Array): string => Array.from(b, c => String.fromCharCode(c)).join('');
const fromLatin1 = (s: string): Uint8Array => Uint8Array.from(s, c => c.charCodeAt(0) & 0xff);
const concat = (parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const u32 = (n: number): Uint8Array => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
const u16 = (n: number): Uint8Array => Uint8Array.of(n >> 8, n & 0xff);
const bytes = (...n: number[]): Uint8Array => Uint8Array.from(n);

/** Anything a picture's metadata could leave behind. */
export const NO_METADATA = /Nib test|Exif|ICC_PROFILE|Photoshop|ns\.adobe\.com|Adobe|JFXX|Display P3/;

// ---- PNG ----

const SIGNATURE = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

export function pngChunk(type: string, data: Uint8Array | string): Uint8Array {
  const body = typeof data === 'string' ? fromLatin1(data) : data;
  const typed = concat([fromLatin1(type), body]);
  return concat([u32(body.length), typed, u32(crc32(typed))]);
}

export const PNG_METADATA: Uint8Array[] = [
  pngChunk('tEXt', 'Software\0Nib test'),
  pngChunk('iTXt', 'XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta>Nib test</x:xmpmeta>'),
  pngChunk('zTXt', concat([fromLatin1('Comment\0\0'), deflateSync(fromLatin1('Nib test'))])),
  pngChunk('eXIf', 'MM\0*Nib test camera'),
  pngChunk('tIME', bytes(0x07, 0xea, 11, 7, 12, 30, 15)),
  pngChunk('iCCP', concat([fromLatin1('Display P3\0\0'), deflateSync(new Uint8Array(16))])),
  pngChunk('pHYs', bytes(0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1)),
  pngChunk('gAMA', bytes(0, 1, 0x86, 0xa0)),
  pngChunk('cHRM', new Uint8Array(32).fill(1)),
  pngChunk('prVt', 'Nib test'),
];

export function pngFile(o: { width: number; height: number; before?: Uint8Array[]; after?: Uint8Array[]; idat?: number; trailing?: string }): Uint8Array<ArrayBuffer> {
  const ihdr = pngChunk('IHDR', concat([u32(o.width), u32(o.height), bytes(8, 6, 0, 0, 0)]));
  const idats = Array.from({ length: o.idat ?? 1 }, (_, i) => pngChunk('IDAT', deflateSync(bytes(i, 1, 2, 3, 4))));
  return concat([SIGNATURE, ihdr, ...(o.before ?? []), ...idats, ...(o.after ?? []), pngChunk('IEND', ''), fromLatin1(o.trailing ?? '')]);
}

export function pngChunks(b: Uint8Array): { type: string; data: Uint8Array; crcOk: boolean }[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), out = [];
  for (let at = 8; at + 12 <= b.length;) {
    const len = dv.getUint32(at);
    if (at + 12 + len > b.length) break; // trailing bytes that aren't a chunk
    const typed = b.slice(at + 4, at + 8 + len);
    out.push({ type: latin1(typed.slice(0, 4)), data: typed.slice(4), crcOk: crc32(typed) === dv.getUint32(at + 8 + len) });
    at += 12 + len;
  }
  return out;
}

export function pngSize(b: Uint8Array): { width: number; height: number } {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

// ---- JPEG ----

/** The bare JFIF header, written out here so the tests don't trust `JFIF_APP0`. */
export const JFIF_BARE: Uint8Array = bytes(0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00);

const segment = (marker: number, payload: Uint8Array | string): Uint8Array => {
  const body = typeof payload === 'string' ? fromLatin1(payload) : payload;
  return concat([bytes(0xff, marker), u16(body.length + 2), body]);
};

export const JPEG_METADATA: Uint8Array[] = [
  segment(0xe0, concat([fromLatin1('JFIF\0'), bytes(1, 2, 1, 0x01, 0x2c, 0x01, 0x2c, 1, 1, 1, 2, 3)])), // units 1, 300 x 300 dpi, 1 x 1 thumbnail
  segment(0xe0, 'JFXX\0\x10Nib test thumbnail'),
  segment(0xe1, 'Exif\0\0MM\0*Nib test camera'),
  segment(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Nib test</x:xmpmeta>'),
  segment(0xe2, concat([fromLatin1('ICC_PROFILE\0'), bytes(1, 1, 9, 9, 9, 9)])),
  segment(0xed, 'Photoshop 3.0\0Nib test'),
  segment(0xee, concat([fromLatin1('Adobe'), bytes(0, 100, 0, 0, 0, 0, 1)])),
  segment(0xfe, 'Nib test machine'),
];

const dqt = (): Uint8Array => segment(0xdb, concat([bytes(0), new Uint8Array(64).fill(8)]));
const sof0 = (w: number, h: number): Uint8Array => segment(0xc0, concat([bytes(8), u16(h), u16(w), bytes(3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1)]));
const dhtSeg = (): Uint8Array => segment(0xc4, concat([bytes(0), bytes(0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0), bytes(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11)]));
const sos = (): Uint8Array => segment(0xda, bytes(3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0));
const SCAN = bytes(0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0x9a, 0xff, 0x00);

export function jpegFile(o: { width: number; height: number; head?: Uint8Array[]; between?: Uint8Array[]; trailing?: string }): Uint8Array<ArrayBuffer> {
  const parts = [bytes(0xff, 0xd8), ...(o.head ?? [JFIF_BARE]), dqt(), sof0(o.width, o.height), dhtSeg(), sos(), SCAN];
  if (o.between) parts.push(...o.between, sos(), SCAN);
  parts.push(bytes(0xff, 0xd9), fromLatin1(o.trailing ?? ''));
  return concat(parts);
}

/** Where entropy-coded data ends: at the first `FF` before a marker that is not stuffing (`00`) or a restart (`D0–D7`). */
function scanEnd(b: Uint8Array, from: number): number {
  for (let i = from; i < b.length; i++) {
    if (b[i] !== 0xff) continue;
    let j = i;
    while (b[j + 1] === 0xff) j++;
    const n = b[j + 1];
    if (n === 0 || (n >= 0xd0 && n <= 0xd7)) { i = j + 1; continue; }
    return i;
  }
  throw new Error('no end of scan');
}

function walkJpeg(b: Uint8Array): { marker: number; data: Uint8Array; scan?: Uint8Array }[] {
  const out = [];
  for (let at = 2; at < b.length;) {
    while (b[at] === 0xff && b[at + 1] === 0xff) at++;
    const marker = b[at + 1];
    if (marker === 0xd9) { out.push({ marker, data: new Uint8Array(0) }); break; }
    const len = (b[at + 2] << 8) | b[at + 3];
    const data = b.slice(at + 4, at + 2 + len);
    at += 2 + len;
    if (marker === 0xda) { const end = scanEnd(b, at); out.push({ marker, data, scan: b.slice(at, end) }); at = end; } else out.push({ marker, data });
  }
  return out;
}

/** Every marker after SOI up to and including EOI; `data` is the payload without the length. */
export const jpegSegments = (b: Uint8Array): { marker: number; data: Uint8Array }[] => walkJpeg(b).map(({ marker, data }) => ({ marker, data }));
/** Each scan's entropy-coded data. */
export const jpegScans = (b: Uint8Array): Uint8Array[] => walkJpeg(b).flatMap(s => (s.scan ? [s.scan] : []));

// ---- canvas encoder for jsdom, which can't encode a canvas ----

/** What a browser's `canvas.toBlob(cb, type)` would give, in bytes: a picture of the canvas's size, with metadata only when asked. */
export function encodeCanvas(canvas: HTMLCanvasElement, type?: string, metadata = false): Blob {
  if (type === 'image/jpeg') {
    return new Blob([jpegFile({ width: canvas.width, height: canvas.height, head: metadata ? JPEG_METADATA : undefined })], { type: 'image/jpeg' });
  }
  const png = pngFile({ width: canvas.width, height: canvas.height, before: metadata ? PNG_METADATA : [], after: metadata ? [pngChunk('tEXt', 'Comment\0Nib test')] : [] });
  return new Blob([png], { type: 'image/png' });
}

/** Replaces `toBlob` with the encoder above, recording `(type, quality)` in the spy's calls. Callers restore the spy. */
export function stubCanvasEncoder(o: { metadata?: boolean } = {}): MockInstance {
  return vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback, type?: string) {
    queueMicrotask(() => cb(encodeCanvas(this, type, o.metadata ?? false)));
  });
}
