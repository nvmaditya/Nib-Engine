// CRC-32, the checksum every ZIP entry carries (and PNG chunks too), checked against the standard
// check value and against Node's zlib.
import * as zlib from 'node:zlib';
import { expect, test } from 'vitest';
import { crc32 } from './crc32';

test('CRC-32 as ZIP and PNG use it', () => {
  expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  expect(crc32(new Uint8Array(0))).toBe(0);
  const big = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 7919) & 255);
  expect(crc32(big)).toBe(zlib.crc32(big));
});

test('the CRC is unsigned, and a view into a larger buffer is read from its own start', () => {
  const all = Uint8Array.from({ length: 256 }, (_, i) => 255 - i);
  expect(crc32(all)).toBe(zlib.crc32(all));
  expect(crc32(all)).toBeGreaterThan(0x7fffffff); // this one has its top bit set
  const view = all.subarray(10, 50);
  expect(crc32(view)).toBe(zlib.crc32(Uint8Array.from(view)));
});
