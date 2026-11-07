// Which of a font's alternate glyphs the engine takes as other ways to write a letter. A stylistic set's
// boxed or circled letters (Inter's ss05 and ss06 turn W into ⓦ and a squared W) are not: with variety
// on they were drawn at random, so a rectangle or a circle showed up around a letter.
import { expect, test, vi } from 'vitest';
import { engineFor } from '@/engine/core.js';

type Cmd = { type: string; x?: number; y?: number };
const box = (w: number, h: number): Cmd[] => [{ type: 'M', x: 0, y: 0 }, { type: 'L', x: w, y: 0 }, { type: 'L', x: w, y: -h }, { type: 'L', x: 0, y: -h }, { type: 'Z' }];

// A font of W (1), its squared form (2: twice as tall, 1.43 times as wide, as in Inter Display Medium
// Italic), a plain alternate (3) and the other glyphs of a letter w (4).
const GLYPHS: Record<number, { advanceWidth: number; cmds: Cmd[] }> = {
  0: { advanceWidth: 500, cmds: [] },
  1: { advanceWidth: 1000, cmds: box(900, 700) },
  2: { advanceWidth: 1430, cmds: box(1400, 1300) },
  3: { advanceWidth: 1020, cmds: box(930, 710) },
  4: { advanceWidth: 700, cmds: box(600, 500) },
};
const sub = (from: number, to: number) => ({ lookupType: 1, subtables: [{ substFormat: 2, coverage: { format: 1, glyphs: [from] }, substitute: [to] }] });
const fake = {
  unitsPerEm: 1000,
  charToGlyphIndex: (c: string) => (c === 'W' ? 1 : c === 'w' ? 4 : 0),
  glyphs: { get: (i: number) => ({ advanceWidth: GLYPHS[i].advanceWidth, getPath: () => ({ commands: GLYPHS[i].cmds }) }) },
  tables: { gsub: {
    lookups: [sub(1, 2), sub(1, 3)],
    features: [{ tag: 'ss06', feature: { lookupListIndexes: [0] } }, { tag: 'salt', feature: { lookupListIndexes: [1] } }],
  } },
};
vi.mock('opentype.js', () => ({ default: { parse: () => fake } }));

test('a squared or circled form is not another way to write the letter; a plain alternate is', () => {
  const e = engineFor({ id: 'up-fake', name: 'Fake', family: 'Fake', weight: 400, scale: 1, group: 'mine', buf: new ArrayBuffer(8) }) as { forms(g: number): number[] };
  expect(e.forms(1)).toEqual([1, 3]);
});
