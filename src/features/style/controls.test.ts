import { DEFAULTS, LIMITS } from '@/engine/config.js';
import { BOX_KEYS } from '@/engine/doc.js';
import { SETTING_CONTROLS } from './controls';

test('every setting the engine reads has a control, or says where it is set', () => expect(Object.keys(SETTING_CONTROLS).sort()).toEqual(Object.keys(DEFAULTS).sort()));
test('a block can have its own value for exactly the handwriting settings', () => expect(Object.entries(SETTING_CONTROLS).filter(([, c]) => c.block).map(([k]) => k).sort()).toEqual([...BOX_KEYS].sort()));
test('every ranged setting is a slider', () => expect(Object.entries(SETTING_CONTROLS).filter(([, c]) => c.kind === 'slider').map(([k]) => k).sort()).toEqual(Object.keys(LIMITS).sort()));
