import { afterEach, expect, test } from 'vitest';
import { chordLabel, isApple, isModKey } from './keys';

const onApple = (platform = 'MacIntel') => Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
afterEach(() => { delete (navigator as unknown as Record<string, unknown>).platform; });

test('off Apple a chord is its keys joined by +', () => {
  expect(isApple()).toBe(false);
  expect(chordLabel(['Mod', 'Shift', 'Z'])).toBe('Ctrl+Shift+Z');
  expect(chordLabel(['Mod', 'Alt', '1'])).toBe('Ctrl+Alt+1');
  expect(chordLabel(['Mod', 'K'])).toBe('Ctrl+K');
  expect(chordLabel(['Ctrl', 'Y'])).toBe('Ctrl+Y');
  expect(chordLabel(['Shift', 'Tab'])).toBe('Shift+Tab');
});

test('on Apple the modifiers are ⌃ ⌥ ⇧ ⌘, in that order, then the key', () => {
  onApple();
  expect(isApple()).toBe(true);
  expect(chordLabel(['Mod', 'Shift', 'Z'])).toBe('⇧⌘Z');
  expect(chordLabel(['Mod', 'Alt', '1'])).toBe('⌥⌘1');
  expect(chordLabel(['Mod', 'Enter'])).toBe('⌘Enter');
  expect(chordLabel(['Shift', 'Ctrl', 'Mod', 'Alt', 'K'])).toBe('⌃⌥⇧⌘K');
  for (const p of ['iPhone', 'iPad', 'iPod touch']) { onApple(p); expect(isApple()).toBe(true); }
});

test('Apple is also read from userAgentData', () => {
  Object.defineProperty(navigator, 'userAgentData', { value: { platform: 'macOS' }, configurable: true });
  try { expect(isApple()).toBe(true); expect(chordLabel(['Mod', 'B'])).toBe('⌘B'); }
  finally { delete (navigator as unknown as Record<string, unknown>).userAgentData; }
});

test('key names: Esc and the arrows; Enter, Delete, Backspace and Tab as they are', () => {
  expect(chordLabel(['Escape'])).toBe('Esc');
  expect(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map(k => chordLabel([k]))).toEqual(['↑', '↓', '←', '→']);
  expect(['Enter', 'Delete', 'Backspace', 'Tab'].map(k => chordLabel([k]))).toEqual(['Enter', 'Delete', 'Backspace', 'Tab']);
  expect(chordLabel(['Mod', '/'])).toBe('Ctrl+/');
  onApple();
  expect(chordLabel(['Escape'])).toBe('Esc');
  expect(chordLabel(['Shift', 'Tab'])).toBe('⇧Tab');
  expect(chordLabel(['Mod', '/'])).toBe('⌘/');
});

test('the modifier key is ⌘ on Apple and Ctrl elsewhere', () => {
  const ev = (o: KeyboardEventInit) => new KeyboardEvent('keydown', { key: 'k', ...o });
  expect([isModKey(ev({ ctrlKey: true })), isModKey(ev({ metaKey: true }))]).toEqual([true, false]);
  onApple();
  expect([isModKey(ev({ ctrlKey: true })), isModKey(ev({ metaKey: true }))]).toEqual([false, true]);
});
