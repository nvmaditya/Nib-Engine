// A header's fields as a list: new headers' fields, a value typed into one, and adding, renaming, removing and moving one.
import { beforeEach, expect, test, vi } from 'vitest';
import { uid } from '@/engine/doc.js';
import { fieldValue, fieldsFrom, listAdd, listMove, listRemove, listRename, listSetValue, newFieldId, today } from './headerFields';

vi.mock('@/engine/doc.js', async orig => ({ ...(await orig<typeof import('@/engine/doc.js')>()), uid: vi.fn() }));

const NOW = new Date(2026, 10, 7);
const L = (...labels: string[]) => labels.map((label, i) => ({ id: 'i' + i, label, value: '' }));

// Each test's ids: u1, u2… unless it says otherwise.
beforeEach(() => { let n = 0; vi.mocked(uid).mockReset().mockImplementation(() => 'u' + ++n); });

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

test('adding: at the end and empty; a Date comes marked and as today; at 12 nothing', () => {
  vi.mocked(uid).mockReturnValueOnce('i0'); // an id the header has already: another is taken
  expect(listAdd(L('Name'), { label: ' Teacher ' })).toEqual([...L('Name'), { id: expect.not.stringMatching(/^i0$/), label: 'Teacher', value: '' }]);
  expect(listAdd(L('Name'), { label: 'Date', today: true }, NOW)!.at(-1)).toMatchObject({ label: 'Date', value: '7 November 2026', today: true });
  expect(listAdd(L('Name'), { label: '' })!.at(-1)!.label).toBe('Field'); // Custom field… starts as Field
  expect(listAdd(L(...'abcdefghijkl'), { label: 'x' })).toBeNull();
  expect(listAdd(L(...'abcdefghijk'), { label: 'x' })).toHaveLength(12);
});
test('renaming: one line, at most 30, empty is Field; the date mark stays; the same name changes nothing', () => {
  const d = [{ id: 'd', label: 'Date', value: 'x', today: true as const }];
  expect(listRename(d, 'd', ' Due\ndate ')).toEqual([{ id: 'd', label: 'Due date', value: 'x', today: true }]);
  expect(listRename(L('A'), 'i0', '')![0].label).toBe('Field'); expect(listRename(L('A'), 'i0', ' A ')).toBeNull(); expect(listRename(L('A'), 'zz', 'B')).toBeNull();
  expect(listRename(L('A'), 'i0', 'y'.repeat(40))![0].label).toBe('y'.repeat(30));
  expect(d[0].label).toBe('Date'); // a new list: the one given is left as it was
});
test('removing: never the only field; says which went and where it was', () => {
  expect(listRemove(L('A', 'B'), 'i1')).toEqual({ list: L('A'), field: L('A', 'B')[1], index: 1 }); expect(listRemove(L('A'), 'i0')).toBeNull();
  expect(listRemove(L('A', 'B'), 'zz')).toBeNull();
});
test('moving: to any row; off the ends or in place changes nothing', () => {
  expect(listMove(L('A', 'B', 'C'), 'i0', 2)!.map(f => f.label)).toEqual(['B', 'C', 'A']);
  expect(listMove(L('A', 'B', 'C'), 'i2', 0)!.map(f => f.label)).toEqual(['C', 'A', 'B']);
  expect(listMove(L('A', 'B', 'C'), 'i1', 2)!.map(f => f.label)).toEqual(['A', 'C', 'B']);
  expect([listMove(L('A', 'B'), 'i0', 0), listMove(L('A', 'B'), 'i0', 2), listMove(L('A', 'B'), 'i0', -1)]).toEqual([null, null, null]);
  expect([listMove(L('A', 'B'), 'zz', 1), listMove(L('A', 'B'), 'i0', 0.5)]).toEqual([null, null]);
});
