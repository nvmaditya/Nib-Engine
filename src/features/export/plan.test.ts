import { expect, test } from 'vitest';
import { PAGE_H, PAGE_W } from '@/engine/config.js';
import type { Row } from '@/engine/types';
import {
  chosenPages, downloadLabel, downloadNames, estimateBytes, exportBase, failMessage, formatSize, fullestPage, PRINT_RATIO, QUALITY,
  planOf, savedMessage, SCAN_LOOKS, suffixShown, whatIsMade, zipNames, type ExportPlan, type Sample,
} from './plan';

const P = (p: Partial<ExportPlan> = {}): ExportPlan => ({ format: 'pdf', quality: 'standard', zip: true, pages: [0, 1, 2], pageCount: 3, base: 'The Water Cycle', ...p });
const S: Sample = { png: 900_000, jpg: 300_000, jpgPrint: 420_000, at: 'standard' };
test('the two qualities are the engine’s sizes', () => { for (const q of Object.values(QUALITY)) expect([q.w, q.h]).toEqual([Math.round(q.pxW), Math.round(q.pxW * PAGE_H / PAGE_W)]); expect([QUALITY.standard.w, QUALITY.print.w]).toEqual([1747, 2480]); });
test('chosen pages', () => {
  expect(chosenPages(false, [1], 3)).toEqual([0, 1, 2]);
  expect(chosenPages(true, [1], 3)).toEqual([0, 2]);
  expect(chosenPages(true, [5, 1], 3)).toEqual([0, 2]); // a page past the end is forgotten
  expect(chosenPages(true, [0, 1, 2], 3)).toEqual([]);
});
test('the file name: what was typed, else the title, made safe to save', () => {
  expect(exportBase('', 'The Water Cycle')).toBe('The Water Cycle');
  expect(exportBase('my/notes.pdf', 'X')).toBe('my notes');
  expect(exportBase('  ', 'a:b')).toBe('a b');
  expect(exportBase('', '')).toBe('Untitled');
  expect(exportBase('***???', 'QA Ten')).toBe('QA Ten'); // a name that is only symbols is no name: the title stands in
  expect(exportBase('***???', '<>|')).toBe('Untitled'); // and when the title is no name either
  expect(exportBase('', 'Café ☕ 水の循環')).toBe('Café ☕ 水の循環');
});
test('names', () => {
  expect(downloadNames(P())).toEqual(['The Water Cycle.pdf']);
  expect(downloadNames(P({ format: 'png' }))).toEqual(['The Water Cycle.zip']);
  expect(zipNames(P({ format: 'png' }))).toEqual(['The Water Cycle-page-1.png', 'The Water Cycle-page-2.png', 'The Water Cycle-page-3.png']);
  expect(downloadNames(P({ format: 'jpg', zip: false, pages: [0, 2] }))).toEqual(['The Water Cycle-page-1.jpg', 'The Water Cycle-page-3.jpg']);
  expect(downloadNames(P({ format: 'png', pages: [1] }))).toEqual(['The Water Cycle.png']);
  expect(zipNames(P({ format: 'jpg', pages: [0, 9], pageCount: 12 }))).toEqual(['The Water Cycle-page-01.jpg', 'The Water Cycle-page-10.jpg']);
});
test('the ending shown after the file name', () => expect([P(), P({ format: 'png' }), P({ format: 'png', zip: false }), P({ format: 'jpg', pages: [2] }), P({ format: 'png', pages: [] })].map(suffixShown)).toEqual(['.pdf', '.zip', '-page-1.png', '.jpg', '.png']));
test('the Download button says what it makes', () => {
  expect([P(), P({ pages: [1] }), P({ format: 'png' }), P({ format: 'jpg', zip: false }), P({ format: 'png', pages: [2] }), P({ pages: [] })].map(downloadLabel))
    .toEqual(['Download PDF · 3 pages', 'Download PDF · 1 page', 'Download ZIP · 3 PNGs', 'Download 3 JPGs', 'Download PNG', 'Choose at least one page']);
});
test('messages', () => {
  expect(failMessage(P())).toBe('Nib couldn’t make the PDF. Try again.');
  expect(failMessage(P({ format: 'png', quality: 'print' }))).toBe('Nib couldn’t make the ZIP at print quality. Try Standard quality.');
  expect(failMessage(P({ format: 'jpg', zip: false }))).toBe('Nib couldn’t make the images. Try again.');
  expect([savedMessage(['A.pdf']), savedMessage(['A-page-1.png', 'A-page-2.png'])]).toEqual(['Saved A.pdf', 'Saved 2 images']);
});
test('the size estimate', () => {
  expect(estimateBytes(P({ format: 'png' }), S)).toBe(2_700_406); // 3 × 900,000 + 3 × (76 + 2 × 26) + 22
  expect(estimateBytes(P({ pages: [0, 1] }), S)).toBe(601_260);
  expect(estimateBytes(P({ format: 'jpg', zip: false, quality: 'print', pages: [0, 1] }), S)).toBe(Math.round(2 * 420_000 * PRINT_RATIO));
  expect(estimateBytes(P({ format: 'png', quality: 'print', pages: [0] }), S)).toBe(Math.round(900_000 * PRINT_RATIO));
});
test('a sample measured at Print size isn’t scaled again', () => {
  const atPrint: Sample = { ...S, at: 'print' };
  expect(estimateBytes(P({ format: 'jpg', zip: false, quality: 'print', pages: [0, 1] }), atPrint)).toBe(2 * 420_000);
  expect(estimateBytes(P({ format: 'png', quality: 'print', pages: [0] }), atPrint)).toBe(900_000);
  expect(estimateBytes(P({ quality: 'print', pages: [0, 1] }), atPrint)).toBe(2 * 420_000 + 300 + 2 * 480);
});
test('the scan looks are the three a scanner gives', () => expect(SCAN_LOOKS).toEqual(['scan', 'gray', 'bw']));
test('sizes read the way people say them', () => expect([2_700_406, 601_260, 1_692_875, 12_400_000, 999_499, 999_500, 9_949_999, 9_950_000, 1_500].map(formatSize))
  .toEqual(['~2.7 MB', '~601 KB', '~1.7 MB', '~12 MB', '~999 KB', '~1.0 MB', '~9.9 MB', '~10 MB', '~2 KB']));
test('planOf gathers the choices', () => {
  expect(planOf({ format: 'png', zip: false, quality: 'print' }, { choose: true, out: [1, 7] }, 3, 'my/notes.pdf', 'T'))
    .toEqual({ format: 'png', quality: 'print', zip: false, pages: [0, 2], pageCount: 3, base: 'my notes' });
  expect(planOf({ format: 'pdf', zip: true, quality: 'standard' }, { choose: false, out: [1] }, 2, '', '').pages).toEqual([0, 1]);
});
test('whatIsMade', () => expect([P(), P({ format: 'png' }), P({ format: 'jpg', zip: false }), P({ format: 'jpg', pages: [0] }), P({ format: 'png', pages: [] })].map(whatIsMade))
  .toEqual(['PDF', 'ZIP', 'images', 'JPG', 'PNG']));

/** A part on `page` writing on `text` rows, with `blank` empty rows and `hr` drawn lines among them. */
const part = (page: number, text: number, blank = 0, hr = 0) => ({
  page, rows: [...Array(text).fill('text'), ...Array(blank).fill('blank'), ...Array(hr).fill('hr')].map((kind): Row => ({ kind, ruleY: 0, src: { li: 0, tok: 0 } })),
});
test('the estimate measures the chosen page with the most writing, not a short cover page', () => {
  const segs = [part(0, 1), part(1, 28), part(2, 12)];
  expect(fullestPage(segs, [0, 1, 2])).toBe(1);
  expect(fullestPage(segs, [0, 2])).toBe(2); // the fullest left out: the fullest of the rest
  expect(fullestPage(segs, [0])).toBe(0);
  expect(fullestPage(segs, [])).toBeNull();
});
test('a page’s writing is every part on it, and a blank row writes nothing', () => {
  expect(fullestPage([part(0, 10), part(1, 6), part(1, 5, 0, 1)], [0, 1])).toBe(1); // a margin note and a text block, and a drawn line
  expect(fullestPage([part(0, 10), part(1, 2, 20)], [0, 1])).toBe(0);
});
test('on a tie, or with nothing written, it is the first chosen page', () => {
  expect(fullestPage([part(0, 5), part(1, 5)], [1, 0])).toBe(1);
  expect(fullestPage([], [2, 3])).toBe(2);
  expect(fullestPage([part(0, 5)], [2, 3])).toBe(2); // pages with no part on them
});
