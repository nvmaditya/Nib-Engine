// A header's fields as a list: new headers' fields, and a value typed into one.
import { expect, test, vi } from 'vitest';
import { uid } from '@/engine/doc.js';
import { fieldValue, fieldsFrom, listSetValue, newFieldId, today } from './headerFields';

vi.mock('@/engine/doc.js', async orig => ({ ...(await orig<typeof import('@/engine/doc.js')>()), uid: vi.fn() }));

const NOW = new Date(2026, 10, 7);

test('today', () => expect(today(new Date(2026, 10, 6))).toBe('6 November 2026'));

test('fieldsFrom: the built-in Name, Class and today’s Date, or a remembered list, with date-marked values as today', () => {
  expect(fieldsFrom(null, NOW)).toEqual([{ id: 'f1', label: 'Name', value: '' }, { id: 'f2', label: 'Class', value: '' }, { id: 'f3', label: 'Date', value: '7 November 2026', today: true }]);
  expect(fieldsFrom([{ label: 'Name', value: 'Asha' }, { label: 'Due', value: '1 May 2026', today: true }], NOW)).toEqual([
    { id: 'f1', label: 'Name', value: 'Asha' }, { id: 'f2', label: 'Due', value: '7 November 2026', today: true }]);
});

test('a value is one line of at most 80, spaces kept as typed; the same value or an unknown field changes nothing', () => {
  const list = fieldsFrom(null, NOW), typed = ' Asha\r\nK  ' + 'x'.repeat(90);
  const next = listSetValue(list, 'f1', typed)!;
  expect(next[0]).toEqual({ id: 'f1', label: 'Name', value: fieldValue(typed) });
  expect(next[0].value).toBe(' Asha K  ' + 'x'.repeat(71));
  expect([list[0].value, next.slice(1)]).toEqual(['', list.slice(1)]); // a new list: the one given is left as it was
  expect(listSetValue(list, 'f3', '1 May')![2]).toEqual({ id: 'f3', label: 'Date', value: '1 May', today: true });
  expect(listSetValue(next, 'f1', next[0].value)).toBeNull();
  expect(listSetValue(next, 'f1', typed + ' more')).toBeNull(); // cut to the same 80
  expect(listSetValue(list, 'gone', 'x')).toBeNull();
});

test('a value cut through an emoji keeps no broken half', () => {
  expect([fieldValue('x'.repeat(79) + '😀'), fieldValue('x'.repeat(78) + '😀')]).toEqual(['x'.repeat(79), 'x'.repeat(78) + '😀']);
  expect(listSetValue(fieldsFrom(null, NOW), 'f1', 'x'.repeat(79) + '😀 and more')![0].value).toBe('x'.repeat(79));
});

test('a new field’s id is never one the header has', () => {
  vi.mocked(uid).mockReturnValueOnce('f1').mockReturnValueOnce('f3').mockReturnValueOnce('bnew');
  expect(newFieldId(fieldsFrom(null, NOW))).toBe('bnew');
  expect(vi.mocked(uid)).toHaveBeenCalledTimes(3);
});
