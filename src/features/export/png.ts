// Strips a PNG down to the chunks that make the picture. Text, EXIF, XMP, ICC, time, density and any
// private chunk go, and so does anything after IEND. Kept chunks are copied byte for byte (CRCs included).

export const PNG_KEEP = ['IHDR', 'PLTE', 'tRNS', 'sRGB', 'IDAT', 'IEND'] as const;

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function scrubPng(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (bytes.length < 8 || SIGNATURE.some((v, i) => bytes[i] !== v)) throw new Error('not a PNG');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let size = 8, at = 8, ended = false;
  while (!ended) {
    if (at + 12 > bytes.length) throw new Error('truncated PNG');
    const length = dv.getUint32(at), end = at + 12 + length;
    if (end > bytes.length) throw new Error('truncated PNG');
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    if ((PNG_KEEP as readonly string[]).includes(type)) {
      kept.push(bytes.subarray(at, end));
      size += end - at;
      ended = type === 'IEND';
    } else if (bytes[at + 4] >= 0x41 && bytes[at + 4] <= 0x5a) {
      throw new Error(`unknown critical PNG chunk ${type}`);
    }
    at = end;
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const k of kept) { out.set(k, o); o += k.length; }
  return out;
}
