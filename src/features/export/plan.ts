import { PAGE_H, PAGE_W } from '@/engine/config.js';
import { cleanName } from '@/engine/core.js';
import type { Seg } from '@/engine/types';
import { pagesWord } from '@/features/style/fit';

export type Format = 'pdf' | 'png' | 'jpg';
export type Quality = 'standard' | 'print';

/** The two download sizes: the engine draws at `pxW` and nothing is scaled afterwards. */
export const QUALITY: Record<Quality, { pxW: number; w: number; h: number; jpeg: number }> = {
  standard: { pxW: PAGE_W * 2.2, w: 1747, h: 2471, jpeg: 0.9 },
  print: { pxW: 2480, w: 2480, h: 3508, jpeg: 0.95 },
};
/** How many times more pixels a Print quality page has than a Standard one. */
export const PRINT_RATIO = (2480 * 3508) / (1747 * 2471);

export const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', zip: 'application/zip' } as const;

export interface ExportPrefs { format: Format; zip: boolean; quality: Quality }
export interface PagePick { choose: boolean; out: number[] }
export interface ExportPlan { format: Format; quality: Quality; zip: boolean; pages: number[]; pageCount: number; base: string }
/** Bytes of one page at Standard size: as PNG, as JPEG at Standard's quality, and as JPEG at Print's. */
export interface Sample { png: number; jpg: number; jpgPrint: number }

/** Every page, or those not left out, ascending. Left-out pages past the end are forgotten. */
export function chosenPages(choose: boolean, out: readonly number[], pageCount: number): number[] {
  const pages: number[] = [];
  for (let i = 0; i < pageCount; i++) if (!choose || !out.includes(i)) pages.push(i);
  return pages;
}

export const exportBase = (fileName: string, title: string): string => cleanName(fileName) || cleanName(title) || 'Untitled';

export const planOf = (prefs: ExportPrefs, pick: PagePick, pageCount: number, fileName: string, title: string): ExportPlan => ({
  format: prefs.format, quality: prefs.quality, zip: prefs.zip,
  pages: chosenPages(pick.choose, pick.out, pageCount), pageCount, base: exportBase(fileName, title),
});

/** Several images go into one ZIP: not for a PDF, only with ZIP on, only with more than one page. */
export const zipped = (plan: ExportPlan): boolean => plan.format !== 'pdf' && plan.zip && plan.pages.length > 1;

export const pageFileName = (plan: ExportPlan, i: number): string =>
  `${plan.base}-page-${String(i + 1).padStart(String(plan.pageCount).length, '0')}.${plan.format}`;

export const zipNames = (plan: ExportPlan): string[] => plan.pages.map(i => pageFileName(plan, i));

export function downloadNames(plan: ExportPlan): string[] {
  if (plan.format === 'pdf') return [`${plan.base}.pdf`];
  if (zipped(plan)) return [`${plan.base}.zip`];
  if (plan.pages.length === 1) return [`${plan.base}.${plan.format}`];
  return zipNames(plan);
}

/** The ending shown after the file name field. */
export function suffixShown(plan: ExportPlan): string {
  if (!plan.pages.length) return '.' + plan.format;
  return downloadNames(plan)[0].slice(plan.base.length);
}

const FMT = (f: Format): string => f.toUpperCase();

export function whatIsMade(plan: ExportPlan): 'PDF' | 'ZIP' | 'images' | 'PNG' | 'JPG' {
  if (plan.format === 'pdf') return 'PDF';
  if (zipped(plan)) return 'ZIP';
  return plan.pages.length > 1 ? 'images' : (FMT(plan.format) as 'PNG' | 'JPG');
}

export function downloadLabel(plan: ExportPlan): string {
  const n = plan.pages.length;
  if (!n) return 'Choose at least one page';
  if (plan.format === 'pdf') return `Download PDF · ${pagesWord(n)}`;
  const F = FMT(plan.format);
  if (n === 1) return `Download ${F}`;
  return zipped(plan) ? `Download ZIP · ${n} ${F}s` : `Download ${n} ${F}s`;
}

export function failMessage(plan: ExportPlan): string {
  const what = whatIsMade(plan);
  return plan.quality === 'print'
    ? `Nib couldn’t make the ${what} at print quality. Try Standard quality.`
    : `Nib couldn’t make the ${what}. Try again.`;
}

export const savedMessage = (names: string[]): string => (names.length === 1 ? `Saved ${names[0]}` : `Saved ${names.length} images`);

/**
 * The page the size estimate measures: of the `chosen` pages, the one with the most writing, counted as
 * the rows its parts write on (a blank row writes nothing), so a short cover page doesn't make the size
 * read low. On a tie, the first of them; null with no page chosen.
 */
export function fullestPage(segs: readonly Pick<Seg, 'page' | 'rows'>[], chosen: readonly number[]): number | null {
  if (!chosen.length) return null;
  const rows = new Map<number, number>();
  for (const s of segs) rows.set(s.page, (rows.get(s.page) ?? 0) + s.rows.filter(r => r.kind !== 'blank').length);
  return chosen.reduce((best, p) => ((rows.get(p) ?? 0) > (rows.get(best) ?? 0) ? p : best));
}

export const PDF_OVERHEAD = { base: 300, perPage: 480 };

const utf8 = (s: string): number => new TextEncoder().encode(s).length;

export function estimateBytes(plan: ExportPlan, s: Sample): number {
  const print = plan.quality === 'print';
  const one = plan.format === 'png' ? s.png * (print ? PRINT_RATIO : 1) : print ? s.jpgPrint * PRINT_RATIO : s.jpg;
  const n = plan.pages.length;
  let total = one * n;
  if (plan.format === 'pdf') total += PDF_OVERHEAD.base + PDF_OVERHEAD.perPage * n;
  else if (zipped(plan)) total += zipNames(plan).reduce((t, name) => t + 76 + 2 * utf8(name), 0) + 22;
  return Math.round(total);
}

export function formatSize(bytes: number): string {
  if (bytes < 999_500) return `~${Math.round(bytes / 1000)} KB`;
  if (bytes < 9_950_000) return `~${(bytes / 1e6).toFixed(1)} MB`;
  return `~${Math.round(bytes / 1e6)} MB`;
}
