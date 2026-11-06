import { cleanDoc, cleanSettings } from '@/engine/doc.js';
import { DEFAULTS } from '@/engine/config.js';

test('engine modules load in tests and clean a document', () => {
  const d = cleanDoc({ boxes: [{ text: 'a' }] })!;
  expect(d.pageCount).toBe(1);
  expect(d.boxes[0].text).toBe('a');
  expect(typeof d.boxes[0].id).toBe('string');
});
test('settings fall back to defaults', () => {
  expect(cleanSettings({ font: 'nope' }, false).font).toBe(DEFAULTS.font);
});
