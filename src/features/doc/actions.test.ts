// Today's actions, pinned before they change. part(i) is the i-th part of block 'm' in the current layout.
import { beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import type { EngineDoc, Seg } from '@/engine/types';
import { box, docOf, get, lastToast, layoutOf, lines, open } from '@/test/docs';
import { flushSave, undo } from '@/store/editor';
import { deleteBox, deleteFrame, removePage, resetBoxStyle, separateFrame, setV, shuffleBox, writeOut } from './actions';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

beforeEach(async () => { await flushSave(); vi.mocked(sonner).mockClear(); });

const part = (i: number): Seg => layoutOf(get().doc).segs.find(s => s.box.id === 'm' && s.idx === i)!;
const long = (): EngineDoc => docOf(box({ id: 'm', text: lines(40) }));

test('deleting part 2 removes only that page’s text', () => {
  open(long());
  deleteFrame(part(1));
  expect(get().doc.boxes[0].text).toBe(lines(28) + '\n');
  expect(lastToast()).toBe('Text on page 2 deleted; what follows moves up.');
});

test('separating page 2 makes a block that starts at line29', () => {
  open(long());
  separateFrame(part(1));
  const [a, b] = get().doc.boxes;
  expect(a.text).toBe(lines(28));
  expect(b.text.split('\n')[0]).toBe('line29');
  expect([b.page, b.y]).toEqual([1, 110]);
  expect(get().selectedId).toBe(b.id);
});

test('removePage removes an empty page only', () => {
  const doc = docOf(box({ id: 'm', page: 2, text: 'x' }));
  doc.pageCount = 3;
  open(doc);
  removePage(1, layoutOf(doc).segs);
  expect(get().doc.pageCount).toBe(2);
  expect(get().doc.boxes[0].page).toBe(1);
  removePage(1, layoutOf(get().doc).segs);
  expect(get().doc.pageCount).toBe(2);
});

test('writeOut replaces the pages or adds after the last page', () => {
  open(docOf(box({ text: 'old' })));
  writeOut('# T', 'replace', 'f.pdf', 1);
  expect(get().doc.boxes).toHaveLength(1);
  expect(get().doc.fileName).toBe('f.pdf');
  writeOut('more', 'append', undefined, 1);
  expect(get().doc.boxes[1].page).toBe(1);
  expect(get().doc.pageCount).toBe(2);
});

test('setV writes only the selected block’s style when the scope is the block', () => {
  open(docOf(box()));
  expect(get().S.size).toBe(30);
  get().scope = 'box';
  setV({ size: 40 });
  expect(get().doc.boxes[0].style).toEqual({ size: 40 });
  expect(get().S.size).toBe(30);
});

const styled = (): EngineDoc => docOf(box({ id: 'm', text: lines(40), style: { size: 40 } }));
const threePages = (): EngineDoc => ({ ...long(), pageCount: 3 });
const cases: [string, () => EngineDoc, () => void][] = [
  ['deleteFrame', long, () => deleteFrame(part(1))],
  ['separateFrame', long, () => separateFrame(part(1))],
  ['deleteBox', long, () => deleteBox('m')],
  ['removePage', threePages, () => removePage(2, layoutOf(get().doc).segs)],
  ['writeOut', long, () => { writeOut('# T', 'replace', 'f.pdf', 1); }],
  ['setV', long, () => setV({ size: 40 })],
  ['resetBoxStyle', styled, () => resetBoxStyle()],
  ['shuffleBox', long, () => shuffleBox('m')],
];
test.each(cases)('%s is exactly one undo step', (_name, doc, run) => {
  open(doc());
  const before = JSON.stringify(get().doc);
  const S0 = JSON.stringify(get().S);
  run();
  expect(get().canUndo).toBe(true);
  undo();
  expect(JSON.stringify(get().doc)).toBe(before);
  expect(JSON.stringify(get().S)).toBe(S0);
  expect(get().canUndo).toBe(false);
});

test('a split-off block is a continued text block that remembers where it came from', () => {
  open(long());
  separateFrame(part(1));
  const [a, b] = get().doc.boxes;
  expect([b.kind, b.name, b.color, b.from]).toEqual(['text', 'Text block (continued)', 1, a.id]);
});

test('imports name the block Main text when replacing, else by the document', () => {
  open(long());
  writeOut('# T', 'replace', 'f.pdf', 1);
  expect(get().doc.boxes.map(b => b.name)).toEqual(['Main text']);
  writeOut('more', 'append', undefined, 1);
  expect(get().doc.boxes.map(b => [b.name, b.color])).toEqual([['Main text', 0], ['Text block', 1]]);
});
