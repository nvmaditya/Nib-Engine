import { describe, expect, test } from 'vitest';
import { scrubPng } from './png';
import { NO_METADATA, PNG_METADATA, latin1, pngChunk, pngChunks, pngFile, pngSize } from '../../test/images';

const types = (b: Uint8Array) => pngChunks(b).map(c => c.type);
const idats = (b: Uint8Array) => pngChunks(b).filter(c => c.type === 'IDAT');

describe('scrubPng', () => {
  test('a PNG keeps only the chunks that make the picture', () => {
    const src = pngFile({ width: 4, height: 3, before: [pngChunk('sRGB', Uint8Array.of(0)), ...PNG_METADATA], idat: 2, after: [pngChunk('tEXt', 'Comment\0Nib test after')], trailing: 'Nib test trailing' });
    const out = scrubPng(src);
    expect(types(out)).toEqual(['IHDR', 'sRGB', 'IDAT', 'IDAT', 'IEND']);
    expect(pngChunks(out).every(c => c.crcOk)).toBe(true);
    expect(latin1(out)).not.toMatch(NO_METADATA);
    expect(idats(out)).toEqual(idats(src));
  });
  test('a palette PNG keeps its palette and transparency', () => {
    const out = scrubPng(pngFile({ width: 2, height: 2, before: [pngChunk('PLTE', new Uint8Array(6)), pngChunk('tRNS', Uint8Array.of(0))] }));
    expect(types(out)).toEqual(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
  });
  test('a PNG that is already bare comes back byte for byte', () => {
    const src = pngFile({ width: 4, height: 3 });
    expect(scrubPng(src)).toEqual(src);
  });
  test('what isn’t a whole PNG is refused', () => {
    expect(() => scrubPng(new Uint8Array(20))).toThrow('not a PNG');
    const src = pngFile({ width: 4, height: 3 });
    expect(() => scrubPng(src.slice(0, src.length - 6))).toThrow('truncated PNG');
    expect(() => scrubPng(pngFile({ width: 1, height: 1, before: [pngChunk('ABCD', 'x')] }))).toThrow('unknown critical PNG chunk ABCD');
  });
  test('hostile PNGs: text between the IDATs and chunks after IEND go too', () => {
    const src = pngFile({ width: 4, height: 3, idat: 3 });
    const sizes = pngChunks(src).map(c => 12 + c.data.length);
    const mid = 8 + sizes[0] + sizes[1] + sizes[2]; // between the 2nd and 3rd IDAT
    const text = pngChunk('tEXt', 'Comment\0Nib test between');
    const spliced = new Uint8Array([...src.slice(0, mid), ...text, ...src.slice(mid)]);
    expect(types(spliced)).toEqual(['IHDR', 'IDAT', 'IDAT', 'tEXt', 'IDAT', 'IEND']);
    const afterIend = new Uint8Array([...src, ...pngChunk('tEXt', 'Comment\0Nib test after IEND'), ...pngChunk('eXIf', 'MM\0*Nib test camera')]);
    for (const hostile of [spliced, afterIend]) {
      const out = scrubPng(hostile);
      expect(types(out)).toEqual(['IHDR', 'IDAT', 'IDAT', 'IDAT', 'IEND']);
      expect(latin1(out)).not.toMatch(NO_METADATA);
      expect(idats(out)).toEqual(idats(src));
      expect(out).toEqual(src);
    }
  });
  test('an unknown critical chunk is refused wherever it sits; an unknown ancillary one is dropped', () => {
    expect(() => scrubPng(pngFile({ width: 1, height: 1, after: [pngChunk('XYZW', 'x')] }))).toThrow('unknown critical PNG chunk XYZW');
    expect(types(scrubPng(pngFile({ width: 1, height: 1, before: [pngChunk('xyzw', 'x')] })))).toEqual(['IHDR', 'IDAT', 'IEND']);
  });
  test('a PNG without IHDR first, or without any IDAT, is refused', () => {
    const src = pngFile({ width: 4, height: 3 });
    const ihdrLen = 25; // 12 + 13
    const swapped = new Uint8Array([...src.slice(0, 8), ...pngChunk('sRGB', Uint8Array.of(0)), ...src.slice(8)]);
    expect(() => scrubPng(swapped)).toThrow('not a PNG');
    const noIdat = new Uint8Array([...src.slice(0, 8 + ihdrLen), ...pngChunk('IEND', '')]);
    expect(() => scrubPng(noIdat)).toThrow('truncated PNG');
  });
  test('truncation anywhere is refused, never returned', () => {
    const src = pngFile({ width: 4, height: 3, before: PNG_METADATA });
    for (let n = 8; n < src.length; n++) expect(() => scrubPng(src.slice(0, n))).toThrow('truncated PNG');
    expect(() => scrubPng(src.slice(0, src.length - 12))).toThrow('truncated PNG'); // no IEND
  });
  test('jsdom’s canvas encoder gives a clean picture of the canvas size', async () => {
    const c = document.createElement('canvas'); c.width = 30; c.height = 20;
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
    expect(pngSize(new Uint8Array(await blob!.arrayBuffer()))).toEqual({ width: 30, height: 20 });
  });
});
