// Nib's own store-only ZIP writer: each file kept exactly as it is, and nothing in the archive about
// when, where or on what it was made. Read back by a strict reader that checks every offset and CRC.
import * as zlib from 'node:zlib';
import { expect, test } from 'vitest';
import { readZip } from '@/test/zip';
import { DOS_DATE, DOS_TIME, writeZip } from './zip';

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31) & 255);
const F = [{ name: 'Notes-page-1.png', data: bytes(1000) }, { name: 'Notes-page-2.png', data: bytes(7) }];

test('a ZIP holds each file as it is, in order', () => {
  const z = readZip(writeZip(F));
  expect(z.entries.map(e => [e.name, e.central.method, e.central.size, e.central.csize, e.crcOk])).toEqual([['Notes-page-1.png', 0, 1000, 1000, true], ['Notes-page-2.png', 0, 7, 7, true]]);
  expect(z.entries[1].data).toEqual(F[1].data); expect(z.trailing).toBe(0);
});

test('nothing about when, where or on what it was made', () => {
  const z = readZip(writeZip(F)); expect(z.commentLength).toBe(0);
  for (const e of z.entries) {
    for (const h of [e.local, e.central]) expect([h.time, h.date, h.extraLength, h.flags & 0x08, h.versionNeeded]).toEqual([0, 0x21, 0, 0, 20]);
    expect([e.central.versionMadeBy, e.central.commentLength, e.central.internalAttrs, e.central.externalAttrs, e.central.disk]).toEqual([20, 0, 0, 0, 0]);
  }
  expect([DOS_TIME, DOS_DATE]).toEqual([0x0000, 0x0021]);
});

test('names outside ASCII are kept in UTF-8 and say so', () => {
  const [e] = readZip(writeZip([{ name: 'Café-page-1.png', data: bytes(3) }])).entries;
  expect([e.name, e.nameBytes.length, e.central.flags, e.local.flags]).toEqual(['Café-page-1.png', 16, 0x0800, 0x0800]);
  expect(readZip(writeZip(F)).entries[0].central.flags).toBe(0);
});

test('the same files give the same bytes', () => expect(writeZip(F)).toEqual(writeZip(F)));

test('a ZIP needs files, each with a name of its own', () => { expect(() => writeZip([])).toThrow(RangeError); expect(() => writeZip([{ name: '', data: bytes(1) }])).toThrow(RangeError); expect(() => writeZip([F[0], F[0]])).toThrow(RangeError); });

test('a ZIP holds at most 65,535 files and 4 GB, and a name fits its 16-bit length', () => {
  expect(() => writeZip(Array.from({ length: 65_536 }, (_, i) => ({ name: `f${i}`, data: new Uint8Array(0) })))).toThrow(RangeError);
  // Only the length is read before the sizes are checked, so no 4 GB buffer is needed.
  expect(() => writeZip([{ name: 'big.png', data: { length: 0xffffffff } as Uint8Array }])).toThrow(RangeError);
  expect(() => writeZip([{ name: 'x'.repeat(0x10000), data: bytes(1) }])).toThrow(RangeError);
  expect(readZip(writeZip([{ name: 'x'.repeat(0xffff), data: bytes(1) }])).entries[0].nameBytes.length).toBe(0xffff);
});

test('the bytes are exactly the records ZIP requires, and nothing more', () => {
  const le = (n: number, size: 2 | 4) => Array.from({ length: size }, (_, k) => (n >>> (8 * k)) & 255);
  const name = [...'a.txt'].map(c => c.charCodeAt(0)), data = [0x68, 0x69], crc = le(zlib.crc32(Uint8Array.from(data)), 4);
  const local = [0x50, 0x4b, 0x03, 0x04, ...le(20, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0x21, 2), ...crc, ...le(2, 4), ...le(2, 4), ...le(5, 2), ...le(0, 2), ...name, ...data];
  const central = [0x50, 0x4b, 0x01, 0x02, ...le(20, 2), ...le(20, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0x21, 2), ...crc, ...le(2, 4), ...le(2, 4),
    ...le(5, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(0, 4), ...name];
  const end = [0x50, 0x4b, 0x05, 0x06, ...le(0, 2), ...le(0, 2), ...le(1, 2), ...le(1, 2), ...le(central.length, 4), ...le(local.length, 4), ...le(0, 2)];
  expect([local.length, central.length, end.length]).toEqual([37, 51, 22]);
  expect(writeZip([{ name: 'a.txt', data: Uint8Array.from(data) }])).toEqual(Uint8Array.from([...local, ...central, ...end]));
});
