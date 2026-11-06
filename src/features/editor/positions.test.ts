import { srcOffset } from '@/engine/core.js';
import { SAMPLE_BODY } from '@/engine/config.js';
import { fromMarkup } from './markup';
import { lineOf, lineStart, offsetAt, posAt, rawToTextCol, textToRawCol } from './positions';
import { nibSchema } from './schema';

test('line and column', () => { expect(lineOf('ab\ncd', 3)).toEqual({ li: 1, col: 0 }); expect(lineOf('ab\ncd', 2)).toEqual({ li: 0, col: 2 }); expect(lineStart('ab\ncd', 1)).toBe(3); });
test('columns skip markers and delimiters', () => { const l = '## **Hello** there'; expect(rawToTextCol(l, 5)).toBe(0); expect(rawToTextCol(l, 13)).toBe(6); expect(textToRawCol(l, 6)).toBe(13); });
test('every word of the example maps to a position and back', () => { const pm = nibSchema.nodeFromJSON(fromMarkup(SAMPLE_BODY)); SAMPLE_BODY.split('\n').forEach((line, li) => (line.match(/\S+/g) ?? []).forEach((_, tok) => { const o = srcOffset(SAMPLE_BODY, { li, tok }); expect(offsetAt(pm, SAMPLE_BODY, posAt(pm, SAMPLE_BODY, o))).toBe(o); })); });
