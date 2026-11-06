// Markup offsets ⇄ ProseMirror positions. The editor content is made from the markup with one leaf
// block per line (fromMarkup), so leaf i is line i, and a column maps through the line's visible text.
import type { Node as PMNode } from '@tiptap/pm/model';
import { parseInline, parseLine } from '@/engine/core.js';

const ESCAPABLE = /[!-/:-@[-`{-~]/;

/** The line an offset is on, and its column in that line. */
export function lineOf(text: string, offset: number): { li: number; col: number } {
  const before = text.slice(0, Math.max(0, offset)), ls = before.lastIndexOf('\n') + 1;
  let li = 0;
  for (let i = before.indexOf('\n'); i >= 0; i = before.indexOf('\n', i + 1)) li++;
  return { li, col: before.length - ls };
}

/** Where line li starts. */
export function lineStart(text: string, li: number): number {
  let off = 0;
  for (let i = 0; i < li; i++) { const n = text.indexOf('\n', off); if (n < 0) return text.length; off = n + 1; }
  return off;
}

// The raw column of each visible character of a line, aligned from left to right: an escape `\c` matches the
// visible `c`, a raw character equal to the next visible one matches it, and anything else (a delimiter,
// link or code syntax) is skipped. A tab is the four spaces the engine reads it as.
function visibleCols(line: string): number[] {
  const L = parseLine(line), vis = parseInline(L.content).map(p => p.text).join(''), cols: number[] = [];
  let i = 0, ex = 0, v = 0;
  while (i < line.length && ex < L.prefix) { ex += line[i] === '\t' ? 4 : 1; i++; }
  while (i < line.length && v < vis.length) {
    const c = line[i];
    if (c === '\\' && i + 1 < line.length && ESCAPABLE.test(line[i + 1])) {
      if (vis[v] === line[i + 1]) { cols.push(i + 1); v++; }
      i += 2;
    } else if (c === '\t') {
      for (let k = 0; k < 4 && vis[v] === ' '; k++) { cols.push(i); v++; }
      i++;
    } else {
      if (c === vis[v]) { cols.push(i); v++; }
      i++;
    }
  }
  return cols;
}

/** How many visible characters of the line sit before raw column col. */
export function rawToTextCol(line: string, col: number): number {
  return visibleCols(line).filter(c => c < col).length;
}

/** The raw column just after visible character tcol − 1 (0 for tcol = 0). */
export function textToRawCol(line: string, tcol: number): number {
  const cols = visibleCols(line), t = Math.min(tcol, cols.length);
  return t <= 0 ? 0 : cols[t - 1] + 1;
}

interface Leaf { node: PMNode; pos: number }
function leavesOf(pm: PMNode): Leaf[] {
  const out: Leaf[] = [];
  pm.descendants((node, pos) => {
    if (node.isTextblock || (node.isBlock && node.isLeaf)) { out.push({ node, pos }); return false; }
    return true;
  });
  return out;
}

/** The ProseMirror position for a markup offset. `text` is the markup that `pm` was made from. */
export function posAt(pm: PMNode, text: string, offset: number): number {
  const leaves = leavesOf(pm);
  if (!leaves.length) return 0;
  const { li, col } = lineOf(text, offset);
  if (li >= leaves.length) { const l = leaves[leaves.length - 1]; return l.pos + l.node.nodeSize - (l.node.isTextblock ? 1 : 0); }
  const { node, pos } = leaves[li];
  if (!node.isTextblock) return pos;
  return pos + 1 + Math.min(rawToTextCol(text.split('\n')[li] ?? '', col), node.content.size);
}

/** The markup offset for a ProseMirror position. `text` is the markup that `pm` was made from. */
export function offsetAt(pm: PMNode, text: string, pos: number): number {
  const leaves = leavesOf(pm);
  if (!leaves.length) return 0;
  let li = leaves.findIndex(l => pos <= l.pos + l.node.nodeSize);
  if (li < 0) li = leaves.length - 1;
  const lines = text.split('\n');
  if (li >= lines.length) return text.length;
  const { node, pos: at } = leaves[li], base = lineStart(text, li), line = lines[li];
  if (!node.isTextblock) return base + (pos > at ? line.length : 0);
  return base + textToRawCol(line, Math.max(0, Math.min(pos - at - 1, node.content.size)));
}
