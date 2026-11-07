// Nib's own ZIP writer. PNG and JPEG are compressed already, so every file is stored as it is
// (method 0). The archive holds only what ZIP requires: for each file a local header, its bytes and
// a central directory entry, then the end record. There are no extra fields, comments, data
// descriptors or attributes, and every entry is dated 1980-01-01 00:00, the earliest date ZIP can
// hold, so nothing says when, where or on what the archive was made. The archive is a Blob of those
// parts, each file's own Blob among them, so no file's bytes are copied to make it.

/** Every entry's MS-DOS time and date: 00:00 on 1980-01-01. */
export const DOS_TIME = 0x0000;
export const DOS_DATE = 0x0021;

const VERSION = 20; // "needed" is 2.0, and "made by" is 2.0 on MS-DOS (its upper byte 0)
const UTF8 = 0x0800; // general purpose flag bit 11: the name is UTF-8

/**
 * A file for the archive: its bytes, held in a Blob, and their CRC-32, worked out while the bytes were
 * still at hand (a Blob's bytes can only be read by waiting for them).
 */
export interface ZipFile { name: string; data: Blob; crc: number }

/** A store-only ZIP of `files`, in order. The same files always give the same bytes. */
export function writeZip(files: ZipFile[]): Blob {
  if (!files.length) throw new RangeError('A ZIP needs at least one file.');
  if (files.length > 0xffff) throw new RangeError('A ZIP holds at most 65,535 files.');
  const encoder = new TextEncoder(), decoder = new TextDecoder(), seen = new Set<string>();
  const names = files.map(({ name }) => {
    const bytes = encoder.encode(name);
    if (!bytes.length) throw new RangeError('Every file in a ZIP needs a name.');
    if (bytes.length > 0xffff) throw new RangeError('A name in a ZIP is at most 65,535 bytes.');
    const key = decoder.decode(bytes); // the name as it will be read back
    if (seen.has(key)) throw new RangeError(`Two files in the ZIP are called “${key}”.`);
    seen.add(key);
    return bytes;
  });
  // Every size and offset must fit in 32 bits. Only the sizes are read until this is known.
  const total = files.reduce((n, { data }, k) => n + 30 + 46 + 2 * names[k].length + data.size, 22);
  if (total > 0xffffffff) throw new RangeError('A ZIP holds at most 4 GB.');

  const parts: (Uint8Array<ArrayBuffer> | Blob)[] = [], central: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  const push = (b: Uint8Array<ArrayBuffer> | Blob) => { parts.push(b); size += ArrayBuffer.isView(b) ? b.byteLength : b.size; };
  // The fields a local header and a central entry share, from "version needed" to "extra length".
  const shared = (v: DataView, at: number, flags: number, crc: number, length: number, nameLength: number) => {
    v.setUint16(at, VERSION, true);
    v.setUint16(at + 2, flags, true);
    v.setUint16(at + 4, 0, true); // stored
    v.setUint16(at + 6, DOS_TIME, true);
    v.setUint16(at + 8, DOS_DATE, true);
    v.setUint32(at + 10, crc, true);
    v.setUint32(at + 14, length, true); // compressed size
    v.setUint32(at + 18, length, true); // size
    v.setUint16(at + 22, nameLength, true);
    v.setUint16(at + 24, 0, true); // no extra field
  };

  files.forEach(({ data, crc }, k) => {
    const name = names[k], flags = name.some(b => b >= 0x80) ? UTF8 : 0, offset = size;
    const local = new Uint8Array(30), l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    shared(l, 4, flags, crc, data.size, name.length);
    push(local); push(name); push(data);

    const entry = new Uint8Array(46), c = new DataView(entry.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, VERSION, true); // made by
    shared(c, 6, flags, crc, data.size, name.length);
    // Comment length, disk, internal and external attributes are all 0.
    c.setUint32(42, offset, true);
    central.push(entry, name);
  });

  const cdOffset = size;
  for (const b of central) push(b);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true); // entries on this disk (disk numbers are 0)
  e.setUint16(10, files.length, true);
  e.setUint32(12, size - cdOffset, true);
  e.setUint32(16, cdOffset, true);
  push(end); // and no comment

  return new Blob(parts, { type: 'application/zip' });
}
