import { segSig } from '@/engine/core.js';
import { cleanSettings, sampleDoc } from '@/engine/doc.js';
import type { EngineDoc } from '@/engine/types';
import { box, docOf, layoutOf, lines, words } from '@/test/docs';

// Where every part goes and what it writes, for documents whose blocks don't collide.
// Recorded before the layout rules; it must never change.
const golden = (): EngineDoc[] => [
  sampleDoc(cleanSettings(null, false)),
  docOf(box({ text: lines(40) })),
  docOf(box({ y: 1009, text: words(40) })),
  docOf(box({ text: lines(3) + '\n\\newpage\n' + lines(3) })),
  docOf(box({ text: lines(40), frames: { 1: { x: 200, y: 178, w: 400 } } })),
];
test('documents without collisions lay out as before', () => {
  expect(golden().map(d => layoutOf(d).segs.map(s => [s.box.id, s.page, s.idx, s.x, s.w, s.top, s.rows.length, segSig(s)]))).toMatchSnapshot();
});
