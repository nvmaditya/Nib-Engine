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

test('retract takes back the steps record added, newest first, one at a time, and nothing after an undo, a redo or a clear', () => {
  const h = new History<string>(); h.record('a', 'k1', 0); h.undo('r'); // redo holds 'r'
  h.record('a', 'k2', 1000); h.record('b', 'k3', 5000); h.record('c', 'k4', 9000);
  expect(h.newest).toBe('k4');
  expect(h.retract()).toBe(true); expect(h.newest).toBe('k3'); expect(h.canRedo).toBe(false); // (k4 cleared nothing from Redo)
  expect(h.retract()).toBe(true); expect(h.newest).toBe('k2');
  expect(h.retract()).toBe(true); expect(h.newest).toBeUndefined(); expect(h.canUndo).toBe(false);
  expect(h.redo('a')).toBe('r'); // Redo is as it was before k2
  expect(h.retract()).toBe(false);
  h.record('x', 'k5', 20000); h.record('y', 'k6', 30000); h.undo('z'); expect(h.newest).toBeUndefined(); expect(h.retract()).toBe(false);
  h.redo('y'); expect(h.retract()).toBe(false);
  h.record('w', 'k7', 40000); h.clear(); expect(h.newest).toBeUndefined(); expect(h.retract()).toBe(false);
  expect(new History<string>().retract()).toBe(false);
});

test('with the oldest steps dropped at the limit, retract takes back only what Undo still holds', () => {
  const h = new History<number>(2); [1, 2, 3].forEach((n, i) => h.record(n, 'k' + n, i * 2000));
  expect(h.retract()).toBe(true); expect(h.retract()).toBe(true); expect(h.retract()).toBe(false); expect(h.canUndo).toBe(false);
});

test('a step recorded after a retract is a step of its own, even under the same key', () => {
  const h = new History<string>(); h.record('a', 'g1', 0); h.retract();
  h.record('b', 'g1', 100); expect(h.canUndo).toBe(true); expect(h.undo('c')).toBe('b');
});

test('a burst under the latest step’s key is still that step: retract takes the whole burst back', () => {
  const h = new History<string>(); h.record('a', 'k1', 0); h.record('b', 'g1', 5000); h.record('c', 'g1', 5500);
  expect(h.retract()).toBe(true); expect(h.undo('z')).toBe('a'); expect(h.canUndo).toBe(false);
});
