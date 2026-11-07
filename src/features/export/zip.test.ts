// Nib's own store-only ZIP writer: each file kept exactly as it is, and nothing in the archive about
// when, where or on what it was made. Read back by a strict reader that checks every offset and CRC.
import * as zlib from 'node:zlib';
import { expect, test } from 'vitest';
import { readZip } from '@/test/zip';
import { crc32 } from './crc32';
import { DOS_DATE, DOS_TIME, writeZip } from './zip';

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31) & 255);
/** A file as the writer takes it: its bytes in a Blob, and their CRC-32 worked out while they were at hand. */
const file = (name: string, data: Uint8Array<ArrayBuffer>) => ({ name, data: new Blob([data]), crc: crc32(data) });
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const read = async (files: Parameters<typeof writeZip>[0]) => readZip(await bytesOf(writeZip(files)));
const F = [file('Notes-page-1.png', bytes(1000)), file('Notes-page-2.png', bytes(7))];

test('a ZIP holds each file as it is, in order', async () => {
  const z = await read(F);
  expect(z.entries.map(e => [e.name, e.central.method, e.central.size, e.central.csize, e.crcOk])).toEqual([['Notes-page-1.png', 0, 1000, 1000, true], ['Notes-page-2.png', 0, 7, 7, true]]);
  expect(z.entries[1].data).toEqual(bytes(7)); expect(z.trailing).toBe(0);
});

test('the ZIP is a Blob of its parts, typed as a ZIP, so no page’s bytes are copied into one array', () => {
  const z = writeZip(F);
  expect(z).toBeInstanceOf(Blob);
  expect([z.type, z.size]).toEqual(['application/zip', 2 * (30 + 46 + 2 * 16) + 1000 + 7 + 22]); // each name is in its local header and its central entry
});

test('nothing about when, where or on what it was made', async () => {
  const z = await read(F); expect(z.commentLength).toBe(0);
  for (const e of z.entries) {
    for (const h of [e.local, e.central]) expect([h.time, h.date, h.extraLength, h.flags & 0x08, h.versionNeeded]).toEqual([0, 0x21, 0, 0, 20]);
    expect([e.central.versionMadeBy, e.central.commentLength, e.central.internalAttrs, e.central.externalAttrs, e.central.disk]).toEqual([20, 0, 0, 0, 0]);
  }
  expect([DOS_TIME, DOS_DATE]).toEqual([0x0000, 0x0021]);
});

test('names outside ASCII are kept in UTF-8 and say so', async () => {
  const [e] = (await read([file('Café-page-1.png', bytes(3))])).entries;
  expect([e.name, e.nameBytes.length, e.central.flags, e.local.flags]).toEqual(['Café-page-1.png', 16, 0x0800, 0x0800]);
  expect((await read(F)).entries[0].central.flags).toBe(0);
});

test('the same files give the same bytes', async () => expect(await bytesOf(writeZip(F))).toEqual(await bytesOf(writeZip(F))));

test('a ZIP needs files, each with a name of its own', () => { expect(() => writeZip([])).toThrow(RangeError); expect(() => writeZip([file('', bytes(1))])).toThrow(RangeError); expect(() => writeZip([F[0], F[0]])).toThrow(RangeError); });

test('a ZIP holds at most 65,535 files and 4 GB, and a name fits its 16-bit length', async () => {
  const none = file('x', new Uint8Array(0)).data;
  expect(() => writeZip(Array.from({ length: 65_536 }, (_, i) => ({ name: `f${i}`, data: none, crc: 0 })))).toThrow(RangeError);
  // Only the size is read before the sizes are checked, so no 4 GB Blob is needed.
  expect(() => writeZip([{ name: 'big.png', data: { size: 0xffffffff } as Blob, crc: 0 }])).toThrow(RangeError);
  expect(() => writeZip([file('x'.repeat(0x10000), bytes(1))])).toThrow(RangeError);
  expect((await read([file('x'.repeat(0xffff), bytes(1))])).entries[0].nameBytes.length).toBe(0xffff);
});

test('the bytes are exactly the records ZIP requires, and nothing more', async () => {
  const le = (n: number, size: 2 | 4) => Array.from({ length: size }, (_, k) => (n >>> (8 * k)) & 255);
  const name = [...'a.txt'].map(c => c.charCodeAt(0)), data = [0x68, 0x69], crc = le(zlib.crc32(Uint8Array.from(data)), 4);
  const local = [0x50, 0x4b, 0x03, 0x04, ...le(20, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0x21, 2), ...crc, ...le(2, 4), ...le(2, 4), ...le(5, 2), ...le(0, 2), ...name, ...data];
  const central = [0x50, 0x4b, 0x01, 0x02, ...le(20, 2), ...le(20, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0x21, 2), ...crc, ...le(2, 4), ...le(2, 4),
    ...le(5, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(0, 4), ...name];
  const end = [0x50, 0x4b, 0x05, 0x06, ...le(0, 2), ...le(0, 2), ...le(1, 2), ...le(1, 2), ...le(central.length, 4), ...le(local.length, 4), ...le(0, 2)];
  expect([local.length, central.length, end.length]).toEqual([37, 51, 22]);
  expect(await bytesOf(writeZip([file('a.txt', Uint8Array.from(data))]))).toEqual(Uint8Array.from([...local, ...central, ...end]));
});
