// A strict ZIP reader, for tests. It reads an archive the way unzip does: the end record first (it
// must be the last 22 bytes), then the central directory it points to, then each entry's local header
// and data. Every signature, offset and size is checked on the way, and anything out of place throws.
import { crc32, inflateRawSync } from 'node:zlib';

export interface ZipHeader { versionNeeded: number; flags: number; method: number; time: number; date: number; crc: number; csize: number; size: number; extraLength: number }

export interface ReadZipEntry {
  name: string; nameBytes: Uint8Array; data: Uint8Array;
  crcOk: boolean; // zlib.crc32(data) equals both headers' CRC
  local: ZipHeader;
  central: ZipHeader & { versionMadeBy: number; commentLength: number; internalAttrs: number; externalAttrs: number; disk: number; offset: number };
}

export interface ReadZip {
  entries: ReadZipEntry[];
  commentLength: number; // the archive comment's length, from the end record
  trailing: number; // bytes no record accounts for: before the first entry, between entries, or between the last entry and the central directory
}

const LOCAL = 0x04034b50, CENTRAL = 0x02014b50, END = 0x06054b50;

export function readZip(bytes: Uint8Array): ReadZip {
  const fail = (why: string): never => { throw new Error(`readZip: ${why}`); };
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const need = (at: number, n: number, what: string) => { if (at < 0 || at + n > bytes.length) fail(`${what} runs past the end of the file`); };
  const u16 = (at: number) => v.getUint16(at, true), u32 = (at: number) => v.getUint32(at, true);

  // The end record.
  if (bytes.length < 22) fail('the file is shorter than an end record');
  const end = bytes.length - 22;
  if (u32(end) !== END) fail('the end record is not the last 22 bytes');
  const [disk, cdDisk, onDisk, count, cdSize, cdOffset, commentLength] = [u16(end + 4), u16(end + 6), u16(end + 8), u16(end + 10), u32(end + 12), u32(end + 16), u16(end + 20)];
  if (disk !== 0 || cdDisk !== 0) fail('the archive spans disks');
  if (onDisk !== count) fail(`the end record counts ${onDisk} entries on this disk but ${count} in all`);
  if (cdOffset + cdSize !== end) fail('the central directory does not end where the end record starts');

  const entries: ReadZipEntry[] = [];
  const spans: [number, number][] = []; // each entry's local header and data
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    need(p, 46, `central entry ${i + 1}`);
    if (u32(p) !== CENTRAL) fail(`central entry ${i + 1} has no signature`);
    const nameLength = u16(p + 28), extraLength = u16(p + 30), commentLen = u16(p + 32);
    const central: ReadZipEntry['central'] = {
      versionMadeBy: u16(p + 4), versionNeeded: u16(p + 6), flags: u16(p + 8), method: u16(p + 10), time: u16(p + 12), date: u16(p + 14),
      crc: u32(p + 16), csize: u32(p + 20), size: u32(p + 24), extraLength, commentLength: commentLen,
      disk: u16(p + 34), internalAttrs: u16(p + 36), externalAttrs: u32(p + 38), offset: u32(p + 42),
    };
    need(p + 46, nameLength + extraLength + commentLen, `central entry ${i + 1}'s name, extra field and comment`);
    const nameBytes = bytes.slice(p + 46, p + 46 + nameLength);
    p += 46 + nameLength + extraLength + commentLen;
    if (p > end) fail(`central entry ${i + 1} runs into the end record`);
    if (central.disk !== 0) fail(`entry ${i + 1} is on another disk`);

    // Its local header, where the central entry says it is.
    const o = central.offset;
    if (o + 30 > cdOffset) fail(`entry ${i + 1}'s local header is not before the central directory`);
    if (u32(o) !== LOCAL) fail(`entry ${i + 1} has no local header at offset ${o}`);
    const localNameLength = u16(o + 26), localExtraLength = u16(o + 28);
    const local: ZipHeader = {
      versionNeeded: u16(o + 4), flags: u16(o + 6), method: u16(o + 8), time: u16(o + 10), date: u16(o + 12),
      crc: u32(o + 14), csize: u32(o + 18), size: u32(o + 22), extraLength: localExtraLength,
    };
    if (!Buffer.from(bytes.subarray(o + 30, o + 30 + localNameLength)).equals(nameBytes)) fail(`entry ${i + 1}'s local and central names differ`);
    const descriptor = (local.flags & 0x08) !== 0;
    if (!descriptor && (local.crc !== central.crc || local.csize !== central.csize || local.size !== central.size))
      fail(`entry ${i + 1}'s local header and central entry disagree on its CRC or sizes`);
    for (const k of ['versionNeeded', 'flags', 'method', 'time', 'date'] as const)
      if (local[k] !== central[k]) fail(`entry ${i + 1}'s local header and central entry disagree on ${k}`);

    const start = o + 30 + localNameLength + localExtraLength, stop = start + central.csize;
    if (stop > cdOffset) fail(`entry ${i + 1}'s data runs into the central directory`);
    const raw = bytes.slice(start, stop);
    let data: Uint8Array;
    if (central.method === 0) {
      if (central.csize !== central.size) fail(`stored entry ${i + 1} has different sizes`);
      data = raw;
    } else if (central.method === 8) {
      data = Uint8Array.from(inflateRawSync(raw));
      if (data.length !== central.size) fail(`entry ${i + 1} inflates to ${data.length} bytes, not ${central.size}`);
    } else {
      return fail(`entry ${i + 1} uses compression method ${central.method}`);
    }
    // A data descriptor after the data (optional signature, CRC and both sizes) is part of the entry.
    const after = descriptor ? (stop + 4 <= cdOffset && u32(stop) === 0x08074b50 ? 16 : 12) : 0;
    spans.push([o, stop + after]);

    const sum = crc32(data);
    const name = central.flags & 0x0800 ? new TextDecoder('utf-8', { fatal: true }).decode(nameBytes) : Buffer.from(nameBytes).toString('latin1');
    entries.push({ name, nameBytes, data, crcOk: sum === central.crc && sum === local.crc, local, central });
  }
  if (p !== end) fail('the central directory holds more than its entries');

  spans.sort((a, b) => a[0] - b[0]);
  let covered = 0;
  spans.forEach(([a, b], k) => {
    if (k > 0 && a < spans[k - 1][1]) fail('two entries overlap');
    covered += b - a;
  });
  return { entries, commentLength, trailing: cdOffset - covered };
}
