import { cleanSettings } from '@/engine/doc.js';
import { STYLE_LOOKS } from '@/features/style/looks';
import { lookNameOf, recentMeta } from './recent';

const S = cleanSettings(null, false), NOW = new Date(2026, 10, 6, 12).getTime();
test('the look a document is in, by its hand, pen, ink and realism', () => {
  expect(lookNameOf(S, [])).toBe('Exam answer');
  expect(lookNameOf({ ...S, ...STYLE_LOOKS[1].v, paper: 'grid' }, [])).toBe('Neat notes');
  expect(lookNameOf({ ...S, font: 'zeyada' }, [])).toBeNull();
  expect(lookNameOf({ ...S, font: 'zeyada' }, [{ id: 'm', name: 'Mine', v: { font: 'zeyada' } }])).toBe('Mine');
});
test('the line under a document’s name', () => expect([
  recentMeta(2, 'Exam answer', NOW, NOW), recentMeta(1, null, NOW - 86_400_000, NOW), recentMeta(null, 'Letter', new Date(2026, 10, 3).getTime(), NOW),
]).toEqual(['2 pages · Exam answer · Edited today', '1 page · Edited yesterday', 'Letter · Edited 3 November 2026']));
