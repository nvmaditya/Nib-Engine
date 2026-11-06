// Which markup lines each part of a block edits. A part edits the lines that start in it, so a paragraph
// that runs over a page break is edited where it starts and no line is cut.
import { srcOffset } from '@/engine/core.js';
import type { Box, Seg } from '@/engine/types';
import { lineOf } from './positions';

/** Markup lines `first` to `end` (exclusive). */
export interface LineRange { first: number; end: number }

const lineCount = (text: string) => text.split('\n').length;

/**
 * The lines of each part of the block, indexed by part. Part 0 starts at line 0; a later part starts at the
 * line of `frameRange(box, k)[0]`, or at the next line when that offset is mid-line. Each part ends where the
 * next starts, and the last at the line count.
 */
export function partRanges(box: Box, segs: Seg[]): LineRange[] {
  const parts = segs.filter(sg => sg.box.id === box.id).sort((a, b) => a.idx - b.idx), n = lineCount(box.text);
  if (parts.length <= 1) return [{ first: 0, end: n }];
  const starts = parts.map((sg, k) => {
    if (k === 0) return 0;
    // as frameRange: where the part's first row starts, or the end of the text when it has none
    const at = sg.rows.length ? srcOffset(box.text, sg.rows[0].src) : box.text.length, { li, col } = lineOf(box.text, at);
    return col === 0 ? li : li + 1;
  });
  for (let k = 1; k < starts.length; k++) starts[k] = Math.min(n, Math.max(starts[k], starts[k - 1]));
  return starts.map((first, k) => ({ first, end: k + 1 < starts.length ? starts[k + 1] : n }));
}

/** The ranges while part k holds `count` lines (its editor has focus): later parts shift by the difference. */
export function frozenRanges(base: LineRange[], k: number, count: number): LineRange[] {
  const own = base[k];
  if (!own) return base.map(r => ({ ...r }));
  const d = count - (own.end - own.first);
  return base.map((r, i) => (i < k ? { ...r } : i === k ? { first: r.first, end: r.first + count } : { first: r.first + d, end: r.end + d }));
}

/** The lines of a range (all of the text for null). */
export function sliceLines(text: string, r: LineRange | null): string {
  return r ? text.split('\n').slice(r.first, r.end).join('\n') : text;
}

/** The text with the lines of `r` replaced by the lines of `markup`. */
export function replaceLines(text: string, r: LineRange, markup: string): string {
  const ls = text.split('\n');
  ls.splice(r.first, Math.max(0, r.end - r.first), ...markup.split('\n'));
  return ls.join('\n');
}

/** The first offset at which two texts differ (the shorter one's length when one starts the other). */
export function firstDiff(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}
