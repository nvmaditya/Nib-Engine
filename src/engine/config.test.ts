import { FONTS } from '@/engine/config.js';
import type { HandTag } from '@/engine/types';

// The picker's filters. Tags are data beside each hand; the engine never reads them.
test('every hand is joined-up or print, by whether its letters join', () => FONTS.forEach(f => expect(f.tags!.filter(t => t === 'joined' || t === 'print')).toEqual([f.conn ? 'joined' : 'print'])));
test('Neat and Fun follow the hand groups, and seven hands are Messy', () => {
  const ids = (t: HandTag) => FONTS.filter(f => f.tags!.includes(t)).map(f => f.id);
  expect(ids('neat')).toEqual(FONTS.filter(f => f.group === 'neat').map(f => f.id));
  expect(ids('fun')).toEqual(FONTS.filter(f => f.group === 'fun').map(f => f.id));
  expect(ids('messy')).toEqual(['dawning', 'zeyada', 'loved', 'glory', 'liujian', 'justme', 'reenie']);
  expect([ids('joined').length, ids('print').length]).toEqual([8, 25]);
});
