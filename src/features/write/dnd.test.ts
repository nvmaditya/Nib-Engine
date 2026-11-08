// Dragging pages and blocks with pointer events: when a drag starts, what it drops on, and where a page goes.
import { createElement, type PointerEvent as ReactPointerEvent } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { dragGhost, gate, pageDropIndex, startDrag, targetAt, type DragKind } from './dnd';

// The click swallowed after a drop is only the one that comes straight after it: let that moment pass.
afterEach(async () => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); document.body.innerHTML = ''; await new Promise(r => setTimeout(r, 0)); });

test.each([[0, 1, true, 1], [0, 1, false, 0], [2, 0, false, 0], [2, 0, true, 1], [1, 1, true, 1]])(
  'page %i dropped on %i (after %s) goes to %i', (f, o, a, to) => expect(pageDropIndex(f, o, a)).toBe(to));

test('a mouse drag starts after 4 px', () => {
  const g = gate('item', 'mouse');
  expect(g.move(2, 2, 10)).toBe('wait');
  expect(g.move(3, 3, 20)).toBe('go');
});

test('touch on an item needs a still hold; moving first scrolls', () => {
  expect(gate('item', 'touch').move(0, 10, 100)).toBe('scroll');
  const g = gate('item', 'touch');
  expect(g.move(2, 2, 200)).toBe('wait');
  expect(g.move(3, 3, 360)).toBe('go');
});

test('touch on a grip starts after 4 px', () => expect(gate('grip', 'touch').move(0, 5, 10)).toBe('go'));

/** Two drop targets, page 0 at y 0–100 and page 1 at y 100–200; the point is over a child of whichever holds y. */
function pages(): HTMLElement[] {
  const els = [0, 1].map(i => {
    const el = document.createElement('div');
    el.dataset.dropPage = String(i);
    el.innerHTML = '<p>part</p>';
    el.getBoundingClientRect = () => ({ x: 0, y: i * 100, top: i * 100, bottom: i * 100 + 100, left: 0, right: 300, width: 300, height: 100, toJSON: () => ({}) }) as DOMRect;
    document.body.append(el);
    return el;
  });
  vi.spyOn(document, 'elementFromPoint').mockImplementation((_x, y) => (y >= 0 && y < 200 ? els[y < 100 ? 0 : 1].firstElementChild : null));
  return els;
}

test('the drop target is the page under the pointer', () => {
  pages();
  expect(targetAt(5, 180)).toEqual({ page: 1, after: true });
  expect(targetAt(5, 120)).toEqual({ page: 1, after: false });
  expect(targetAt(5, 40)).toEqual({ page: 0, after: false });
  expect(targetAt(5, 260)).toBeNull();
});

test('a field row drag finds the row under the pointer, never the page around it', () => {
  const page = document.createElement('div'), row = document.createElement('div');
  page.dataset.dropPage = '0';
  page.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, bottom: 400, left: 0, right: 300, width: 300, height: 400, toJSON: () => ({}) }) as DOMRect;
  row.dataset.dropField = '1';
  row.innerHTML = '<input>';
  row.getBoundingClientRect = () => ({ x: 0, y: 100, top: 100, bottom: 140, left: 0, right: 300, width: 300, height: 40, toJSON: () => ({}) }) as DOMRect;
  page.append(row);
  document.body.append(page);
  vi.spyOn(document, 'elementFromPoint').mockImplementation((_x, y) => (y >= 100 && y < 140 ? row.firstElementChild : y >= 0 && y < 400 ? page : null));
  expect(targetAt(5, 130, 'field')).toEqual({ page: 1, after: true });
  expect(targetAt(5, 110, 'field')).toEqual({ page: 1, after: false });
  expect(targetAt(5, 300, 'field')).toBeNull();
  expect(targetAt(5, 130)).toEqual({ page: 0, after: false });
  const drop = vi.fn();
  render(createElement('button', {
    type: 'button',
    onPointerDown: (e: ReactPointerEvent) => startDrag(e, { kind: 'grip', targets: 'field', ghost: () => document.createElement('div'), onDrop: drop }),
  }, 'grip'));
  down(); move(10, 130);
  expect([row.dataset.drop, page.dataset.drop]).toEqual(['after', undefined]);
  up(10, 130);
  expect(drop).toHaveBeenCalledWith({ page: 1, after: true });
  expect(row.dataset.drop).toBeUndefined();
});

test('a drag’s ghost shows its name, after a dot of its colour if it has one', () => {
  const plain = dragGhost('Name'), dotted = dragGhost('Page 2', 'rgb(255, 0, 0)');
  expect([plain.textContent, plain.children.length]).toEqual(['Name', 0]);
  expect([dotted.textContent, (dotted.firstElementChild as HTMLElement).style.background]).toEqual(['Page 2', 'rgb(255, 0, 0)']);
});

/** A grip that starts a drag of `kind`, and what the drag told it. */
function grip(kind: DragKind, onClick = vi.fn()) {
  const calls = { start: vi.fn(), move: vi.fn(), drop: vi.fn(), click: onClick };
  const ghost = () => { const g = document.createElement('div'); g.textContent = 'ghost'; return g; };
  render(createElement('button', {
    type: 'button', onClick,
    onPointerDown: (e: ReactPointerEvent) => startDrag(e, { kind, ghost, onStart: calls.start, onMove: calls.move, onDrop: calls.drop }),
  }, 'grip'));
  return calls;
}
const down = (pointerType = 'mouse', x = 10, y = 50) =>
  fireEvent.pointerDown(screen.getByRole('button', { name: 'grip' }), { pointerId: 1, pointerType, button: 0, isPrimary: true, clientX: x, clientY: y });
const move = (x: number, y: number) => fireEvent.pointerMove(document, { pointerId: 1, clientX: x, clientY: y });
const up = (x: number, y: number) => fireEvent.pointerUp(document, { pointerId: 1, clientX: x, clientY: y });
const ghostEl = () => screen.queryByText('ghost');
/** A touchmove the page could scroll on; true when the drag stopped it. */
const touchmoveStopped = () => { const ev = new Event('touchmove', { cancelable: true }); window.dispatchEvent(ev); return ev.defaultPrevented; };

test('a page drag shows a ghost that ignores the pointer, marks before or after the page under it, and drops there', () => {
  const els = pages(), c = grip('grip');
  down();
  move(11, 51);
  expect([c.start.mock.calls.length, ghostEl(), document.body.dataset.dragging]).toEqual([0, null, undefined]);
  move(10, 180);
  expect(c.start).toHaveBeenCalledTimes(1);
  const g = ghostEl()!;
  expect([g.style.pointerEvents, g.style.position]).toEqual(['none', 'fixed']);
  expect(document.body.dataset.dragging).toBe('grip');
  expect([els[0].dataset.drop, els[1].dataset.drop]).toEqual([undefined, 'after']);
  move(10, 20);
  expect([els[0].dataset.drop, els[1].dataset.drop]).toEqual(['before', undefined]);
  expect(c.move).toHaveBeenLastCalledWith({ page: 0, after: false });
  up(10, 20);
  expect(c.drop).toHaveBeenCalledWith({ page: 0, after: false });
  expect([ghostEl(), document.body.dataset.dragging, els[0].dataset.drop]).toEqual([null, undefined, undefined]);
});

test('a block drag marks the page it is over as the drop, and dropping off the pages drops on nothing', () => {
  const els = pages(), c = grip('item');
  down();
  move(10, 120);
  expect(els[1].dataset.drop).toBe('on');
  move(10, 400);
  expect([els[1].dataset.drop, c.move.mock.lastCall]).toEqual([undefined, [null]]);
  up(10, 400);
  expect(c.drop).toHaveBeenCalledWith(null);
});

test('Escape or a cancelled pointer ends the drag without a drop', () => {
  const els = pages(), c = grip('grip');
  down(); move(10, 120);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect([c.drop.mock.lastCall, ghostEl(), els[1].dataset.drop, document.body.dataset.dragging]).toEqual([[null], null, undefined, undefined]);
  up(10, 120);
  expect(c.drop).toHaveBeenCalledTimes(1);
  down(); move(10, 120);
  fireEvent.pointerCancel(document, { pointerId: 1 });
  expect([c.drop.mock.calls, ghostEl()]).toEqual([[[null], [null]], null]);
});

test('a press that doesn’t move is a click: no drag, and the click goes through', () => {
  pages();
  const c = grip('grip');
  down(); up(10, 50);
  fireEvent.click(screen.getByRole('button', { name: 'grip' }));
  expect([c.start.mock.calls.length, c.drop.mock.calls.length, c.click.mock.calls.length]).toEqual([0, 0, 1]);
});

test('the click that ends a drag is swallowed', async () => {
  pages();
  const c = grip('grip');
  down(); move(10, 120); up(10, 120);
  fireEvent.click(screen.getByRole('button', { name: 'grip' }));
  expect(c.click).not.toHaveBeenCalled();
  await new Promise(r => setTimeout(r, 0));
  fireEvent.click(screen.getByRole('button', { name: 'grip' }));
  expect(c.click).toHaveBeenCalledTimes(1);
});

test('a touch hold on an item starts the drag, and then the page stops scrolling', () => {
  vi.useFakeTimers();
  pages();
  const c = grip('item');
  down('touch', 10, 120);
  expect(touchmoveStopped()).toBe(false);
  vi.advanceTimersByTime(349);
  expect(c.start).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(c.start).toHaveBeenCalledTimes(1);
  expect(touchmoveStopped()).toBe(true);
  move(10, 40); up(10, 40);
  expect(c.drop).toHaveBeenCalledWith({ page: 0, after: false });
  expect(touchmoveStopped()).toBe(false);
});

test('a quick touch move on an item lets the list scroll instead', () => {
  vi.useFakeTimers();
  pages();
  const c = grip('item');
  down('touch', 10, 50);
  move(10, 70);
  vi.advanceTimersByTime(500);
  expect(touchmoveStopped()).toBe(false);
  up(10, 70);
  expect([c.start.mock.calls.length, c.drop.mock.calls.length, ghostEl()]).toEqual([0, 0, null]);
});

test('onStart can refuse the drag', () => {
  const els = pages();
  const drop = vi.fn();
  render(createElement('button', {
    type: 'button',
    onPointerDown: (e: ReactPointerEvent) => startDrag(e, { kind: 'item', ghost: () => document.createElement('div'), onStart: () => false, onDrop: drop }),
  }, 'grip'));
  down(); move(10, 120); up(10, 120);
  expect([drop.mock.calls.length, els[1].dataset.drop, document.body.dataset.dragging]).toEqual([0, undefined, undefined]);
});

test('a mouse released where the page didn’t see it ends the press: moving later starts nothing', () => {
  pages();
  const c = grip('grip');
  down();
  fireEvent.pointerMove(document, { pointerId: 1, pointerType: 'mouse', buttons: 0, clientX: 10, clientY: 180 });
  move(10, 190);
  expect([c.start.mock.calls.length, ghostEl(), document.body.dataset.dragging]).toEqual([0, null, undefined]);
});

test('a drag whose ghost fails ends cleanly, and the next press can still drag', () => {
  const els = pages();
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  let fail = true;
  const drop = vi.fn();
  const ghost = () => { if (fail) throw new Error('no ghost'); const g = document.createElement('div'); g.textContent = 'ghost'; return g; };
  render(createElement('button', {
    type: 'button', onPointerDown: (e: ReactPointerEvent) => startDrag(e, { kind: 'grip', ghost, onDrop: drop }),
  }, 'grip'));
  // The error still reaches the page (jsdom reports what a listener throws).
  const thrown = vi.fn((e: ErrorEvent) => e.preventDefault());
  window.addEventListener('error', thrown);
  down(); move(10, 120);
  window.removeEventListener('error', thrown);
  expect(thrown.mock.calls[0][0].error).toEqual(new Error('no ghost'));
  expect([document.body.dataset.dragging, els[1].dataset.drop, ghostEl()]).toEqual([undefined, undefined, null]);
  fail = false;
  down(); move(10, 120); up(10, 120);
  expect(drop).toHaveBeenCalledWith({ page: 1, after: false });
  err.mockRestore();
});
