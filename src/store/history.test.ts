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

test('retract takes back the latest step and gives Redo back', () => {
  const h = new History<string>(); h.record('a', 'k1', 0); h.record('b', 'k2', 5000); h.undo('c'); // redo holds 'c'
  h.record('b', 'g1', 9000); expect(h.canRedo).toBe(false);
  expect(h.retract()).toBe(true); expect(h.canRedo).toBe(true); expect(h.redo('b')).toBe('c');
  expect(h.retract()).toBe(false); // the history moved since
});

test('retract takes back only the step record added last, and nothing after an undo, a redo or a clear', () => {
  const h = new History<string>(); h.record('a', 'k1', 0); h.record('b', 'k2', 5000);
  expect(h.retract()).toBe(true); expect(h.retract()).toBe(false); // 'a' was recorded before 'b'
  expect(h.undo('b')).toBe('a'); expect(h.canUndo).toBe(false);
  h.record('a', 'k3', 9000); h.undo('x'); expect(h.retract()).toBe(false);
  h.redo('a'); expect(h.retract()).toBe(false);
  h.record('x', 'k4', 12000); h.clear(); expect(h.retract()).toBe(false);
  expect(new History<string>().retract()).toBe(false);
});

test('a step recorded after a retract is a step of its own, even under the same key', () => {
  const h = new History<string>(); h.record('a', 'g1', 0); h.retract();
  h.record('b', 'g1', 100); expect(h.canUndo).toBe(true); expect(h.undo('c')).toBe('b');
});

test('a burst under the latest step’s key is still that step: retract takes the whole burst back', () => {
  const h = new History<string>(); h.record('a', 'k1', 0); h.record('b', 'g1', 5000); h.record('c', 'g1', 5500);
  expect(h.retract()).toBe(true); expect(h.undo('z')).toBe('a'); expect(h.canUndo).toBe(false);
});
