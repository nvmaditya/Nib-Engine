// Downloads: every page drawn at print size, tilted and given the chosen look, as a PDF or a PNG.
import { computeLayout, exportPage, fileBase, use } from '@/engine/core.js';
import type { Layout } from '@/engine/types';
import { useEditor } from '@/store/editor';

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const fresh = (): Layout => { const s = useEditor.getState(); use(s.S, s.doc); return computeLayout(); };

export async function savePdf(): Promise<string> {
  const { pages } = fresh();
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  for (let i = 0; i < pages; i++) {
    if (i > 0) pdf.addPage('a4', 'portrait');
    pdf.addImage(exportPage(i).toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 595.28, 841.89, undefined, 'FAST');
    await new Promise(r => setTimeout(r, 0)); // let the page breathe between pages
  }
  const name = `${fileBase()}.pdf`;
  saveBlob(pdf.output('blob'), name);
  return name;
}

export async function savePng(i: number): Promise<string> {
  fresh();
  const c = exportPage(i);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('blob'))), 'image/png'));
  const name = `${fileBase()}-page-${i + 1}.png`;
  saveBlob(blob, name);
  return name;
}
