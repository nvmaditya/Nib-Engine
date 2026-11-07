import { Editor, type JSONContent } from '@tiptap/core';
import { afterEach, expect, test } from 'vitest';
import { previewExtensions } from '@/features/editor/extensions';
import { fromMarkup, toMarkup } from '@/features/editor/markup';
import { cleanParts, FileBreaks, importText, loadPreview, previewContent, setFileBreaks } from './preview';

test('the file’s pages are joined by a blank line, or by a page break', () => {
  expect(importText(['a\n', '\n\nb  ', '   ', 'c'], false)).toBe('a\n\nb\n\nc'); expect(importText(['a', 'b'], true)).toBe('a\n\\newpage\nb'); expect(importText(['  - x'], false)).toBe('  - x');
});
test('the preview’s content is the markup the import writes', () => {
  const P = ['# T\n- a\n- b', '- c\n1. d', '> q'];
  for (const b of [false, true]) expect(toMarkup(previewContent(P, b).doc)).toBe(importText(P, b));
  expect(previewContent(P, false).seps).toEqual([2, 5]);
});
test('a part keeps its first line’s indent, loses the blank lines above it and the space after it, and an empty part goes', () => {
  expect(cleanParts([' \n\t\n   1. x\n  y \n\n', '\r\n\r\nz\r\n', '\n \n', ''])).toEqual(['   1. x\n  y', 'z']);
  expect(previewContent(['', ' \n'], true)).toEqual({ doc: fromMarkup(''), seps: [] });
});

/* ---------- The converter's fixed point, over many files ---------- */

// A small seeded generator (mulberry32), so a failure can be run again.
function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const WORDS = ['water', '**rivers**', '*seas*', '~~lakes~~', '==rain==', '_u_', 'a*b', 'C:\\x', '2.', '-', '#', '>', 'x)'];
const LINES = ['', '   ', '\\newpage', '---', '# ', '## ', '### ', '- ', '  - ', '    - ', '1. ', '2. ', '  1. ', 'a) ', 'b) ', '> ', '>', '  ', '\t'];
function randomPart(r: () => number): string {
  const n = 1 + Math.floor(r() * 7), out: string[] = [];
  for (let i = 0; i < n; i++) {
    const pre = LINES[Math.floor(r() * LINES.length)], k = Math.floor(r() * 4);
    out.push(pre + Array.from({ length: k }, () => WORDS[Math.floor(r() * WORDS.length)]).join(' ') + (r() < 0.2 ? '  ' : ''));
  }
  return (r() < 0.3 ? '\n \n' : '') + out.join(r() < 0.1 ? '\r\n' : '\n') + (r() < 0.3 ? '\n\n' : '');
}
const tops = (d: JSONContent) => d.content ?? [];

test('over many files, the preview is exactly the import’s markup read by the converter, which reads its own writing back unchanged', () => {
  const r = rng(20261107), bad: string[] = [];
  for (let i = 0; i < 1500 && bad.length < 3; i++) {
    const parts = Array.from({ length: 1 + Math.floor(r() * 4) }, () => randomPart(r)), breaks = r() < 0.5;
    const { doc, seps } = previewContent(parts, breaks), md = toMarkup(doc), clean = cleanParts(parts);
    const same = JSON.stringify(doc) === JSON.stringify(fromMarkup(importText(parts, breaks)));
    const sepsOk = seps.length === Math.max(0, clean.length - 1) && seps.every(k => JSON.stringify(tops(doc)[k]) === JSON.stringify({ type: breaks ? 'pageBreak' : 'paragraph' }));
    const fixed = toMarkup(fromMarkup(md)) === md;
    if (!same || !sepsOk || !fixed) bad.push(JSON.stringify({ parts, breaks, same, sepsOk, fixed }));
  }
  expect(bad).toEqual([]);
});

/* ---------- The file's page breaks, through edits ---------- */

let ed: Editor | null = null;
afterEach(() => { ed?.destroy(); ed = null; });
const make = (parts: string[], breaks = false) => {
  ed?.destroy();
  ed = new Editor({ extensions: [...previewExtensions(''), FileBreaks] });
  loadPreview(ed, parts, breaks);
  return ed;
};
const md = () => toMarkup(ed!.getJSON());
const posOf = (word: string) => { let at = -1; ed!.state.doc.descendants((n, p) => { if (at < 0 && n.isText && n.text!.includes(word)) at = p + n.text!.indexOf(word); return at < 0; }); return at; };

test('a line added just before the file’s page break stays on the page before it', () => {
  make(['# One\nFirst', '# Two']);
  // a new top-level line exactly where the separator starts (Enter twice at the end of a list does this)
  ed!.commands.insertContentAt(posOf('First') + 5 + 1, { type: 'paragraph', content: [{ type: 'text', text: 'More' }] });
  setFileBreaks(ed!, true);
  expect(md()).toBe('# One\nFirst\nMore\n\\newpage\n# Two');
  setFileBreaks(ed!, false);
  expect(md()).toBe('# One\nFirst\nMore\n\n# Two');
});
test('the switch goes on and off any number of times, and a page break put in before a line is the one taken out', () => {
  make(['One', 'Two', 'Three']);
  ed!.commands.insertContentAt(posOf('Two') + 3, '!');
  // the second separator typed into: it is a line now, so a page break goes in before it
  ed!.commands.insertContentAt(posOf('Two') + 4 + 2, 'x');
  for (let i = 0; i < 3; i++) {
    setFileBreaks(ed!, true); expect(md()).toBe('One\n\\newpage\nTwo!\n\\newpage\nx\nThree');
    setFileBreaks(ed!, false); expect(md()).toBe('One\n\nTwo!\n\nx\nThree');
  }
});
test('separators that end up in one place make one page break, and one with nothing before or after it makes none', () => {
  make(['One', 'Two', 'Three']);
  // delete from the first separator through the second: both now sit before Three
  ed!.commands.deleteRange({ from: posOf('Two') - 1 - 2, to: posOf('Three') - 1 });
  expect(md()).toBe('One\nThree');
  setFileBreaks(ed!, true); expect(md()).toBe('One\n\\newpage\nThree');
  setFileBreaks(ed!, false); expect(md()).toBe('One\n\nThree');
  // the last part deleted with its separator: no page break at the very end
  make(['One', 'Two']);
  ed!.commands.deleteRange({ from: posOf('One') + 3 + 1, to: ed!.state.doc.content.size });
  setFileBreaks(ed!, true); expect(md()).toBe('One');
  // the first part deleted, its separator left at the top: no empty first page
  make(['One', 'Two']);
  ed!.commands.deleteRange({ from: 0, to: posOf('One') + 3 + 1 });
  expect(md()).toBe('\nTwo');
  setFileBreaks(ed!, true); expect(md()).toBe('\nTwo');
});
test('a separator inside a line that was joined across it makes no page break', () => {
  make(['- alpha', '- beta gamma delta']);
  // join "alp|ha" to "|beta…": the separator was inside what went
  ed!.commands.deleteRange({ from: posOf('ha'), to: posOf('beta') });
  expect(md()).toBe('- alpbeta gamma delta');
  setFileBreaks(ed!, true); expect(md()).toBe('- alpbeta gamma delta');
  setFileBreaks(ed!, false); expect(md()).toBe('- alpbeta gamma delta');
});
test('loading a file starts the caret at the top, and neither the load nor the switch is a step of the undo', () => {
  make(['One', 'Two']);
  expect(ed!.state.selection.from).toBe(1);
  expect(ed!.can().undo()).toBe(false);
  setFileBreaks(ed!, true);
  expect(ed!.can().undo()).toBe(false);
  ed!.commands.insertContentAt(1, 'x'); ed!.commands.undo();
  expect(md()).toBe('One\n\\newpage\nTwo');
});
