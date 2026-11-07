// Nib's own PDF writer: one A4 page for each JPEG, the picture filling the page edge to edge.
// jsPDF always writes a /Producer and a /CreationDate, so Nib writes every byte itself. The file is
// a catalog, a page tree, three objects a page, the xref and a trailer holding only /Size, /Root and
// a random /ID. There is no /Info dictionary and no /Metadata stream.

/** A baseline or progressive 3-component JPEG, as canvas encoders write them, and its size in pixels. */
export interface PdfImage { jpeg: Uint8Array; width: number; height: number }

/** An A4 page in PDF points (1/72 in). */
export const A4 = { w: 595.28, h: 841.89 } as const;

// Every string written here is ASCII, so each character is one byte.
const ascii = (s: string): Uint8Array => {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
};

/** The PDF for `pages`. `id` is the file ID, written in both halves of /ID; each file gets a new random one. */
export function writePdf(pages: PdfImage[], id: Uint8Array = crypto.getRandomValues(new Uint8Array(16))): Uint8Array<ArrayBuffer> {
  if (!pages.length) throw new RangeError('A PDF needs at least one page.');
  if (id.length !== 16) throw new RangeError('A PDF file ID is 16 bytes.');
  pages.forEach(({ jpeg, width, height }, k) => {
    if (!jpeg.length || !(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0))
      throw new RangeError(`Page ${k + 1}’s picture needs its bytes and a size in whole pixels.`);
  });

  // The file is built as a list of parts, counting the offset of each object as it is pushed.
  const parts: Uint8Array[] = [], offsets: number[] = [];
  let size = 0;
  const push = (b: Uint8Array) => { parts.push(b); size += b.length; };
  const text = (s: string) => push(ascii(s));
  const object = (dict: string, stream?: Uint8Array) => {
    offsets.push(size);
    text(`${offsets.length} 0 obj\n${dict}\n`);
    if (stream) { text('stream\n'); push(stream); text('\nendstream\n'); }
    text('endobj\n');
  };

  text('%PDF-1.4\n');
  push(Uint8Array.of(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a)); // a comment of four high bytes: the file is binary
  const w = String(A4.w), h = String(A4.h), draw = ascii(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
  object('<< /Type /Catalog /Pages 2 0 R >>');
  object(`<< /Type /Pages /Kids [${pages.map((_, k) => `${3 + 3 * k} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach(({ jpeg, width, height }, k) => {
    const p = 3 + 3 * k;
    object(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`);
    object(`<< /Length ${draw.length} >>`, draw);
    object(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  });

  const xref = size, count = offsets.length + 1;
  text(`xref\n0 ${count}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  const hex = Array.from(id, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  text(`trailer\n<< /Size ${count} /Root 1 0 R /ID [<${hex}> <${hex}>] >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(size);
  let at = 0;
  for (const b of parts) { out.set(b, at); at += b.length; }
  return out;
}
