// Names, colours and labels for blocks.
import { DEFAULT_NAMES } from '@/engine/doc.js';
import type { BlockKind, Box, EngineDoc } from '@/engine/types';

/** Block colours, the same in both themes, in the order new blocks take them. */
export const BLOCK_COLORS = ['#7A4DF0', '#0B8F8A', '#D9661F', '#D6336C', '#2F6FDB', '#5C8A1E'];

export const blockColor = (b: Pick<Box, 'color'>): string => BLOCK_COLORS[b.color] ?? BLOCK_COLORS[0];

/** The colour after the highest one in use. */
export const nextColor = (doc: EngineDoc): number =>
  doc.boxes.length ? (Math.max(...doc.boxes.map(b => b.color)) + 1) % BLOCK_COLORS.length : 0;

/** The first Text block of a document is its Main text. */
export const newBlockName = (doc: EngineDoc, kind: BlockKind): string =>
  kind === 'text' && !doc.boxes.some(b => b.kind === 'text') ? 'Main text' : DEFAULT_NAMES[kind];

export const continuedName = (name: string): string => (/ \(continued\)$/.test(name) ? name : `${name} (continued)`);

/** '2 of 3' for the second of three parts; nothing for a block on one page. */
export const partLabel = (idx: number, parts: number): string => (parts > 1 ? `${idx + 1} of ${parts}` : '');

/** Where a block is, from its 1-based page numbers. */
export function pagesLabel(pages: number[]): string {
  if (!pages.length) return 'Not on a page';
  if (pages.length === 1) return `Page ${pages[0]}`;
  const contiguous = pages.every((p, i) => i === 0 || p === pages[i - 1] + 1);
  return contiguous ? `Pages ${pages[0]}–${pages[pages.length - 1]}` : `Pages ${pages.join(', ')}`;
}
