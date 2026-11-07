// Making the files a download or a share hands over. Each chosen page is drawn by the engine from the
// copy frozen when the export started, encoded by the browser, and scrubbed down to the picture. A
// scrubber that refuses the encoder's bytes fails the whole export: unscrubbed bytes never go out. The
// pages are then wrapped as one PDF, one ZIP, or one file each. Only the bytes of the pages already
// made are kept: each canvas is let go as soon as it is encoded.
import { scrubJpeg } from './jpeg';
import { writePdf } from './pdf';
import { MIME, QUALITY, downloadNames, zipNames, zipped, type ExportPlan } from './plan';
import { scrubPng } from './png';
import { encodeCanvas, renderPage, type Frozen } from './render';
import { writeZip } from './zip';

export interface ExportFile { name: string; type: string; bytes: Uint8Array<ArrayBuffer> }

/** One page, scrubbed, and the size it was drawn at. */
interface Made { bytes: Uint8Array<ArrayBuffer>; width: number; height: number }

/** Give the browser a turn: it can paint the progress and answer taps between pages. */
const breathe = (): Promise<void> => new Promise(r => setTimeout(r, 0));

/**
 * The files for `plan`, from the frozen copy `f`. Pages are made one at a time, in order, and
 * `onPage(done, total)` is told after each. Any failure rejects, and nothing partial is returned.
 */
export async function buildExport(plan: ExportPlan, f: Frozen, onPage?: (done: number, total: number) => void): Promise<ExportFile[]> {
  const n = plan.pages.length;
  if (!n) throw new RangeError('No page is chosen.');
  const q = QUALITY[plan.quality], png = plan.format === 'png';
  const made: Made[] = [];
  for (let k = 0; k < n; k++) {
    const c = renderPage(f, plan.pages[k], q.pxW);
    // The PDF writer doesn't read a JPEG's own header, so it is given the size the page was drawn at.
    const width = c.width, height = c.height;
    let encoded: Uint8Array;
    try {
      encoded = png ? await encodeCanvas(c, 'image/png') : await encodeCanvas(c, 'image/jpeg', q.jpeg);
    } finally {
      c.width = c.height = 0; // at print size a page holds about 35 MB, and phones have little canvas memory
    }
    made.push({ bytes: png ? scrubPng(encoded) : scrubJpeg(encoded), width, height });
    onPage?.(k + 1, n);
    await breathe();
  }

  const names = downloadNames(plan);
  if (plan.format === 'pdf') return [{ name: names[0], type: MIME.pdf, bytes: writePdf(made.map(p => ({ jpeg: p.bytes, width: p.width, height: p.height }))) }];
  if (zipped(plan)) {
    const entries = zipNames(plan);
    return [{ name: names[0], type: MIME.zip, bytes: writeZip(made.map((p, k) => ({ name: entries[k], data: p.bytes }))) }];
  }
  const type = MIME[plan.format];
  return made.map((p, k) => ({ name: names[k], type, bytes: p.bytes }));
}
