// The three tips shown the first time a document opens on this device (Tips.tsx). They are seen as soon as they
// show, however they are left: `nib.tips` is written then. With storage blocked, they show once on this page.
import { create } from 'zustand';
import { chordLabel } from '@/lib/keys';

export const TIPS_KEY = 'nib.tips';

export const useTips = create<{ open: boolean }>()(() => ({ open: false }));

/** Whether the tips have shown on this page, for when storage can't say. */
let shownHere = false;

function seen(): boolean {
  try { return localStorage.getItem(TIPS_KEY) === 'seen'; } catch { return false; }
}

/** Show the tips, unless this device has seen them or they have shown on this page. */
export function showTipsIfDue(): void {
  if (shownHere || seen()) return;
  shownHere = true;
  try { localStorage.setItem(TIPS_KEY, 'seen'); } catch { /* storage blocked: once on this page, then */ }
  useTips.setState({ open: true });
}

export function dismissTips(): void {
  useTips.setState({ open: false });
}

/** The three tips; on a touch-only device the third is about turning pages. */
export function tipLines(touch: boolean): [string, string, string] {
  return [
    'Click or tap a word on a handwritten page to put the caret there in its text.',
    'Drag a block by its name tag to move it. Its ⋯ menu splits it, joins it back or removes one page’s part.',
    touch
      ? 'Swipe sideways on a page to turn to the next one.'
      : `Press ${chordLabel(['Mod', 'K'])} to open a document, go to a stage or change the theme, and ? to see every shortcut.`,
  ];
}
