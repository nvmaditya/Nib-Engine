import { expect, test } from 'vitest';
import { History } from './history';

test('undo and redo walk snapshots', () => {
  const h = new History<number>();
  h.record(1);
  h.record(2, undefined, 5000);
  expect(h.undo(3)).toBe(2);
  expect(h.undo(2)).toBe(1);
  expect(h.redo(1)).toBe(2);
});

test('typing bursts coalesce', () => {
  const h = new History<string>();
  h.record('a', 'type:b1', 0);
  h.record('ab', 'type:b1', 500);
  h.record('abc', 'type:b1', 2000);
  expect(h.undo('abcd')).toBe('abc');
  expect(h.undo('abc')).toBe('a');
  expect(h.canUndo).toBe(false);
});

test('a new change clears redo', () => {
  const h = new History<number>();
  h.record(1);
  h.undo(2);
  h.record(3);
  expect(h.canRedo).toBe(false);
});

test('limit drops the oldest', () => {
  const h = new History<number>(3);
  [1, 2, 3, 4].forEach((n, i) => h.record(n, undefined, i * 2000));
  expect(h.undo(5)).toBe(4);
  h.undo(4);
  h.undo(3);
  expect(h.canUndo).toBe(false);
});
