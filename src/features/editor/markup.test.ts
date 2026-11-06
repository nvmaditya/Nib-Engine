import type { JSONContent } from '@tiptap/core';
import { parseInline, parseLine, segSig, splitAtFrame, type InlinePiece } from '@/engine/core.js';
import { SAMPLE_BODY, SAMPLE_HEAD } from '@/engine/config.js';
import { box, docOf, layoutOf, words } from '@/test/docs';
import { fromMarkup, inlineToMarkup, listMarkers, plainText, toMarkup, type MarkName, type Run } from './markup';
import { nibSchema } from './schema';

// A doc with one paragraph of text `t`.
const para = (t: string): JSONContent => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
// The text node with exactly this text.
function findText(n: JSONContent, t: string): JSONContent | undefined {
  if (n.type === 'text' && n.text === t) return n;
  for (const c of n.content ?? []) { const f = findText(c, t); if (f) return f; }
  return undefined;
}
const MARKS: MarkName[] = ['bold', 'underline', 'strike', 'highlight'];
// The 16 subsets of MarkName.
const SETS: MarkName[][] = Array.from({ length: 16 }, (_, i) => MARKS.filter((_, b) => i & (1 << b)));
const ENGINE: Record<string, MarkName> = { bold: 'bold', ul: 'underline', strike: 'strike', hl: 'highlight' };
const key = (m: Iterable<MarkName>) => [...m].sort().join();
// One entry per character, with its marks.
const charsOf = (runs: Run[]) => runs.flatMap(r => Array.from(r.text, ch => ({ ch, k: key(r.marks) })));
const piecesAsRuns = (ps: InlinePiece[]): Run[] => ps.map(p => ({ text: p.text, marks: Object.keys(p.style).map(s => ENGINE[s]) }));
// Same text, and every non-whitespace character carries the same marks.
function sameWords(got: InlinePiece[], runs: Run[]): boolean {
  const a = charsOf(piecesAsRuns(got)), b = charsOf(runs);
  return a.map(c => c.ch).join('') === b.map(c => c.ch).join('') && a.every((c, i) => /\s/.test(c.ch) || c.k === b[i].k);
}
// Test-local copy of widenUnderline: an underline that starts or ends inside a word grows to cover the whole word.
function widen(runs: Run[]): Run[] {
  const cs = runs.flatMap(r => Array.from(r.text, ch => ({ ch, m: new Set(r.marks) })));
  for (const w of cs.map(c => c.ch).join('').matchAll(/\S+/g)) {
    const word = cs.slice(w.index, w.index + w[0].length);
    if (word.some(c => c.m.has('underline'))) word.forEach(c => c.m.add('underline'));
  }
  return cs.map(c => ({ text: c.ch, marks: [...c.m] }));
}
// Some underline starts or ends between two non-space characters.
function partialUnderline(runs: Run[]): boolean {
  const cs = charsOf(runs).map(c => ({ ch: c.ch, u: c.k.includes('underline') }));
  return cs.some((c, i) => i > 0 && c.u !== cs[i - 1].u && /\S/.test(c.ch) && /\S/.test(cs[i - 1].ch));
}
const hasBold = (runs: Run[]) => runs.some(r => r.marks.includes('bold'));

const rt = (m: string) => toMarkup(fromMarkup(m));
const sig = (m: string) => { const d = docOf(box({ text: m })); return layoutOf(d).segs.map(segSig).join('\n'); };
test('the example document round-trips byte for byte', () => { expect(rt(SAMPLE_BODY)).toBe(SAMPLE_BODY); expect(rt(SAMPLE_HEAD)).toBe(SAMPLE_HEAD); });
test('the example’s structure', () => {
  const d = fromMarkup(SAMPLE_BODY);
  expect(d.content!.map(n => n.type)).toEqual(['heading', 'paragraph', 'heading', 'paragraph', 'paragraph', 'orderedList', 'paragraph', 'blockquote', 'paragraph', 'heading', 'paragraph']);
  expect(d.content![5].attrs).toMatchObject({ start: 1, kind: '1', delim: '.' }); expect(d.content![5].content).toHaveLength(4);
  expect(findText(d, 'rain, snow or hail')!.marks).toEqual([{ type: 'highlight' }]);
  expect(() => nibSchema.nodeFromJSON(d)).not.toThrow();
});
test.each([
  'a **b *c* d** e', '==**x**==', '~~a~~ ==b==', '- a\n  - b\n    - c', '1) a\n2) b', 'a) x\nb) y', '1. a\n  1. x\n  2. y\n2. b', '1. a\n1. b', '3. c\n4. d',
  '> q\n>\n> r', '# T\n## H\n### S', 'a\n\\newpage\nb', '---', '- ', '# ', '', 'x\n',
  '\\- not a list', '1\\. not a list', 'a\\) not', '\\# not a heading', '\\> not a note', '\\---', '\\\\newpage', '2 \\* 3 snake\\_case a\\=\\=b \\~\\~x\\~\\~ \\[1] \\`q\\` C:\\\\Users',
])('canonical markup %j round-trips', m => expect(rt(m)).toBe(m));
test.each([['* a', '- a'], ['+ a', '- a'], ['***', '---'], ['- - -', '---'], ['   - a', '  - a'], ['_x_', '*x*'], ['`code`', 'code'], ['[t](u)', 't'], ['#   T', '# T'], ['  \\newpage  ', '\\newpage'], ['> ', '>'], ['a\tb', 'a    b'], ['C:\\Users', 'C:\\\\Users']])
  ('%j is written %j and looks the same', (from, canon) => { expect(rt(from)).toBe(canon); expect(sig(canon)).toBe(sig(from)); });
test('literal characters stay literal', () => { const t = '2*3*4 snake_case a==b ~~x~~ [1] `q` C:\\Users'; const md = toMarkup(para(t)); expect(fromMarkup(md)).toEqual(para(t)); expect(parseInline(md)).toEqual([{ text: t, style: {} }]); });
test.each(['- x', '+ x', '1. x', 'a) x', '# x', '> x', '---', '\\newpage'])('a paragraph that says %j is not markup', t => { expect(parseLine(toMarkup(para(t))).kind).toBe('text'); expect(fromMarkup(toMarkup(para(t)))).toEqual(para(t)); });
test('every mix of marks over three runs parses back', () => {   // 4 × 16³ cases; planning found 0 failures
  for (const T of [['ab', 'cd', 'ef'], ['ab ', 'cd', ' ef'], ['a b', 'c d', 'e f'], ['x*y', 'c_d', 'e=f']]) for (const a of SETS) for (const b of SETS) for (const c of SETS) {
    const runs = [{ text: T[0], marks: a }, { text: T[1], marks: b }, { text: T[2], marks: c }], md = inlineToMarkup(runs);
    const got = parseInline(md);
    if (sameWords(got, runs)) continue;                                   // lossless
    expect(sameWords(got, widen(runs))).toBe(true);                       // or the one normalisation,
    expect(partialUnderline(runs) && hasBold(runs)).toBe(true);           // and only for a partial-word underline on a line with bold
  }
});
test('both halves of a mid-paragraph split round-trip', () => { const b = box({ y: 1009, text: `${words(20)} **${words(15)}** ${words(5)}` }); const L = layoutOf(docOf(b)); const nb = splitAtFrame(b, L.segs.find(s => s.idx === 1)!, 'n'); expect(rt(b.text)).toBe(b.text); expect(rt(nb.text)).toBe(nb.text); });
test('ordered markers', () => { expect(listMarkers({ kind: '1', delim: '.', start: 3 }, [0, 0, 1, 1, 0])).toEqual(['3.', '4.', '1.', '2.', '5.']); expect(listMarkers({ kind: 'a', delim: ')', start: 1 }, [0, 0])).toEqual(['a)', 'b)']); });
test('plain text', () => expect(plainText('## The **water** _cycle_')).toBe('The water cycle'));
