// Keys as people see them on their keyboard: Ctrl+ on most, ⌘ on Apple's. A chord is its keys in order, with
// `Mod` for Ctrl, or ⌘ on Apple (`['Mod', 'Shift', 'Z']`).

/** Whether this is an Apple keyboard (a Mac, iPhone or iPad), where the shortcut modifier is ⌘. */
export function isApple(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform || nav.platform || '');
}

// Apple's symbols, in the order Apple writes them.
const APPLE_MODS: [string, string][] = [['Ctrl', '⌃'], ['Alt', '⌥'], ['Shift', '⇧'], ['Mod', '⌘']];
const NAMES: Record<string, string> = { Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };

const keyName = (k: string): string => NAMES[k] ?? (k.length === 1 ? k.toUpperCase() : k);

/**
 * A chord as it is written for this keyboard. Off Apple its keys are joined by `+` (`Ctrl+Shift+Z`); on Apple
 * the modifiers come first, as ⌃ ⌥ ⇧ ⌘, then the key, with no separators (`⇧⌘Z`). Escape is `Esc` and the arrows are arrows.
 */
export function chordLabel(chord: string[]): string {
  if (!isApple()) return chord.map(k => (k === 'Mod' ? 'Ctrl' : keyName(k))).join('+');
  const mods = APPLE_MODS.filter(([m]) => chord.includes(m)).map(([, sym]) => sym).join('');
  return mods + chord.filter(k => !APPLE_MODS.some(([m]) => m === k)).map(keyName).join('');
}

/** Whether the shortcut modifier is held: ⌘ on Apple, Ctrl elsewhere. */
export const isModKey = (e: KeyboardEvent): boolean => (isApple() ? e.metaKey : e.ctrlKey);
