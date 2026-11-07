// Strips a JPEG down to a bare JFIF header and the picture: quantisation and Huffman tables, the frame
// header, restart interval and the scans. EXIF, XMP, ICC, thumbnails, comments and any other APPn go,
// wherever they sit (including between the scans of a progressive JPEG), and so does anything after EOI.

export const JFIF_APP0: Uint8Array = Uint8Array.of(0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00);

const SOI = 0xd8, EOI = 0xd9, SOS = 0xda;

const keeps = (m: number): boolean =>
  m === 0xdb || m === 0xc4 || m === 0xcc || m === 0xdd || m === 0xdc || m === SOS ||
  (m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf);

/** The index of the `FF` that starts the marker ending entropy-coded data begun at `from`. */
function scanEnd(b: Uint8Array, from: number): number {
  for (let i = from; i < b.length; i++) {
    if (b[i] !== 0xff) continue;
    let j = i;
    while (b[j + 1] === 0xff) j++; // fill bytes
    if (j + 1 >= b.length) throw new Error('truncated JPEG');
    const n = b[j + 1];
    if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) { i = j + 1; continue; } // stuffed byte, restart marker
    return i;
  }
  throw new Error('truncated JPEG');
}

export function scrubJpeg(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== SOI) throw new Error('not a JPEG');
  const kept: Uint8Array[] = [];
  let size = 2 + JFIF_APP0.length + 2, at = 2, ended = false, sof = false, sos = false;
  while (!ended) {
    if (at >= bytes.length) throw new Error('truncated JPEG');
    if (bytes[at] !== 0xff) throw new Error('not a JPEG');
    while (bytes[at + 1] === 0xff) at++; // fill bytes before a marker
    if (at + 1 >= bytes.length) throw new Error('truncated JPEG');
    const m = bytes[at + 1];
    if (m === EOI) { if (!sof || !sos) throw new Error('not a JPEG'); ended = true; break; }
    if (m === 0x00) throw new Error('not a JPEG');
    if (m === SOI || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { at += 2; continue; } // markers with no length
    if (at + 4 > bytes.length) throw new Error('truncated JPEG');
    const end = at + 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
    if (end > bytes.length || end < at + 4) throw new Error('truncated JPEG');
    const stop = m === SOS ? scanEnd(bytes, end) : end;
    if (m === SOS) sos = true;
    else if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) sof = true;
    if (keeps(m)) { kept.push(bytes.subarray(at, stop)); size += stop - at; }
    at = stop;
  }
  const out = new Uint8Array(size);
  out[0] = 0xff; out[1] = SOI;
  out.set(JFIF_APP0, 2);
  let o = 2 + JFIF_APP0.length;
  for (const k of kept) { out.set(k, o); o += k.length; }
  out[o] = 0xff; out[o + 1] = EOI;
  return out;
}
