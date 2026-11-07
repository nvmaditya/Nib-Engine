// Making the files a download or a share hands over. Each chosen page is drawn by the engine from the
// copy frozen when the export started, encoded by the browser, and scrubbed down to the picture. A
// scrubber that refuses the encoder's bytes fails the whole export: unscrubbed bytes never go out. The
// pages are then wrapped as one PDF, one ZIP, or one file each. Each canvas is let go as soon as it is
// encoded, and each page's scrubbed bytes go into a Blob as soon as they are made, which the browser
// can keep outside the page's memory. A PDF or ZIP is a Blob of its parts, the pages' Blobs among them,
// so making one copies no page: a ZIP of print-size PNGs can hold hundreds of MB, and a phone closes a
// tab that holds a few times as much.
import { crc32 } from './crc32';
import { scrubJpeg } from './jpeg';
import { writePdf } from './pdf';
import { MIME, QUALITY, downloadNames, zipNames, zipped, type ExportPlan } from './plan';
import { scrubPng } from './png';
import { encodeCanvas, renderPage, type Frozen } from './render';
import { writeZip } from './zip';

/** A file to save or share: its name, and its bytes in a Blob typed as what the file is. */
export interface ExportFile { name: string; blob: Blob }

/** One page, scrubbed and held in a Blob; the size it was drawn at; and its CRC-32 for a ZIP (else 0). */
interface Made { blob: Blob; width: number; height: number; crc: number }

/** Give the browser a turn: it can paint the progress and answer taps between pages. */
const breathe = (): Promise<void> => new Promise(r => setTimeout(r, 0));

/**
 * Page `i`, drawn, encoded and scrubbed as `plan` says. Its canvas and its bytes are let go by the time
 * this returns: only the Blob is kept. The CRC is worked out only for a ZIP, while the bytes are here.
 */
async function makePage(plan: ExportPlan, f: Frozen, i: number, forZip: boolean): Promise<Made> {
  const q = QUALITY[plan.quality], png = plan.format === 'png';
  const c = renderPage(f, i, q.pxW);
  // The PDF writer doesn't read a JPEG's own header, so it is given the size the page was drawn at.
  const width = c.width, height = c.height;
  let encoded: Uint8Array;
  try {
    encoded = png ? await encodeCanvas(c, 'image/png') : await encodeCanvas(c, 'image/jpeg', q.jpeg);
  } finally {
    c.width = c.height = 0; // at print size a page holds about 35 MB, and phones have little canvas memory
  }
  const bytes = png ? scrubPng(encoded) : scrubJpeg(encoded);
  return { blob: new Blob([bytes], { type: png ? MIME.png : MIME.jpg }), width, height, crc: forZip ? crc32(bytes) : 0 };
}

/**
 * The files for `plan`, from the frozen copy `f`. Pages are made one at a time, in order, and
 * `onPage(done, total)` is told after each. Any failure rejects, and nothing partial is returned.
 */
export async function buildExport(plan: ExportPlan, f: Frozen, onPage?: (done: number, total: number) => void): Promise<ExportFile[]> {
  const n = plan.pages.length;
  if (!n) throw new RangeError('No page is chosen.');
  const zip = zipped(plan), made: Made[] = [];
  for (let k = 0; k < n; k++) {
    made.push(await makePage(plan, f, plan.pages[k], zip));
    onPage?.(k + 1, n);
    await breathe();
  }

  const names = downloadNames(plan);
  if (plan.format === 'pdf') return [{ name: names[0], blob: writePdf(made.map(p => ({ jpeg: p.blob, width: p.width, height: p.height }))) }];
  if (zip) {
    const entries = zipNames(plan);
    return [{ name: names[0], blob: writeZip(made.map((p, k) => ({ name: entries[k], data: p.blob, crc: p.crc }))) }];
  }
  return made.map((p, k) => ({ name: names[k], blob: p.blob }));
}
