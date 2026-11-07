import { describe, expect, test } from 'vitest';
import { JFIF_APP0, scrubJpeg } from './jpeg';
import { JFIF_BARE, JPEG_METADATA, NO_METADATA, jpegFile, jpegScans, jpegSegments, latin1 } from '../../test/images';

const markers = (b: Uint8Array) => jpegSegments(b).map(s => s.marker);
const dht = () => Uint8Array.of(0xff, 0xc4, 0x00, 0x1f, 0x00, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);

describe('scrubJpeg', () => {
  test('JFIF_APP0 is the bare header', () => expect(JFIF_APP0).toEqual(JFIF_BARE));
  test('a JPEG keeps a bare JFIF header and the picture, nothing else', () => {
    const src = jpegFile({ width: 8, height: 8, head: JPEG_METADATA, trailing: 'Nib test trailing' });
    const out = scrubJpeg(src);
    expect(markers(out)).toEqual([0xe0, 0xdb, 0xc0, 0xc4, 0xda, 0xd9]);
    expect(out.slice(2, 20)).toEqual(JFIF_BARE);
    expect(latin1(out)).not.toMatch(NO_METADATA);
    expect(jpegScans(out)).toEqual(jpegScans(src));
    expect([...out.slice(-2)]).toEqual([0xff, 0xd9]);
  });
  test('a JPEG without JFIF gets the bare one', () => expect(scrubJpeg(jpegFile({ width: 8, height: 8, head: [] })).slice(2, 20)).toEqual(JFIF_BARE));
  test('a bare JPEG comes back byte for byte', () => {
    const src = jpegFile({ width: 8, height: 8 });
    expect(scrubJpeg(src)).toEqual(src);
  });
  test('comments and APPn between the scans of a progressive JPEG go too', () => {
    // COM, APP1 Exif, APP1 XMP, APP2 ICC, then a table the second scan needs
    const src = jpegFile({ width: 8, height: 8, between: [JPEG_METADATA[7], JPEG_METADATA[2], JPEG_METADATA[3], JPEG_METADATA[4], dht()] });
    const out = scrubJpeg(src);
    expect(markers(out)).toEqual([0xe0, 0xdb, 0xc0, 0xc4, 0xda, 0xc4, 0xda, 0xd9]);
    expect(jpegScans(out)).toHaveLength(2);
    expect(jpegScans(out)).toEqual(jpegScans(src));
    expect(latin1(out)).not.toMatch(NO_METADATA);
  });
  test('fill bytes before a marker are skipped', () => {
    const src = jpegFile({ width: 8, height: 8 });
    const i = src.indexOf(0xdb) - 1;
    expect(scrubJpeg(new Uint8Array([...src.slice(0, i), 0xff, 0xff, ...src.slice(i)]))).toEqual(src);
    const e = src.length - 2; // fill between the scan and EOI
    expect(scrubJpeg(new Uint8Array([...src.slice(0, e), 0xff, 0xff, ...src.slice(e)]))).toEqual(src);
  });
  test('everything after EOI is dropped, even another picture', () => {
    const src = jpegFile({ width: 8, height: 8 });
    const second = jpegFile({ width: 2, height: 2, head: JPEG_METADATA, trailing: 'Nib test' });
    expect(scrubJpeg(new Uint8Array([...src, ...second]))).toEqual(src);
  });
  test('what isn’t a whole JPEG is refused', () => {
    expect(() => scrubJpeg(new Uint8Array(10))).toThrow('not a JPEG');
    const src = jpegFile({ width: 8, height: 8 });
    expect(() => scrubJpeg(src.slice(0, 30))).toThrow('truncated JPEG');
  });
  test('a JPEG with no frame header or no scan is refused', () => {
    const src = jpegFile({ width: 8, height: 8 });
    const at = (m: number) => src.findIndex((v, i) => v === 0xff && src[i + 1] === m);
    const noSof = new Uint8Array([...src.slice(0, at(0xc0)), ...src.slice(at(0xc4))]);
    expect(() => scrubJpeg(noSof)).toThrow('not a JPEG');
    const noSos = new Uint8Array([...src.slice(0, at(0xda)), 0xff, 0xd9]);
    expect(() => scrubJpeg(noSos)).toThrow('not a JPEG');
  });
  test('truncation anywhere is refused, never returned', () => {
    const src = jpegFile({ width: 8, height: 8, head: JPEG_METADATA, between: [JPEG_METADATA[7]] });
    for (let n = 2; n < src.length; n++) expect(() => scrubJpeg(src.slice(0, n))).toThrow('truncated JPEG');
  });
});
