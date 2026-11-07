// The built-in Looks, and how a Look is matched and applied.
import { FONTS } from '@/engine/config.js';
import { BOX_KEYS } from '@/engine/doc.js';
import type { Settings } from '@/engine/types';
import { scopeBox, setV, step, view } from '@/features/doc/actions';
import { useEditor } from '@/store/editor';
import type { SavedLook } from './prefs';

const NEAT = { mess: 15, wobble: 12, variety: 35, flow: 30 };
const NATURAL = { mess: 45, wobble: 30, variety: 60, flow: 55 };

export const STYLE_LOOKS: SavedLook[] = [
  { id: 'exam', name: 'Exam answer', v: { font: 'labelle', tip: 'ball', ink: 'blue', paper: 'ruled', ...NATURAL } },
  { id: 'notes', name: 'Neat notes', v: { font: 'patrick', tip: 'gel', ink: 'blueblack', paper: 'ruled', ...NEAT } },
  { id: 'letter', name: 'Letter', v: { font: 'cedarville', tip: 'fine', ink: 'black', paper: 'plain', ...NATURAL } },
  { id: 'scribble', name: 'Quick scribble', v: { font: 'reenie', tip: 'pencil', ink: 'black', paper: 'grid', mess: 72, wobble: 50, variety: 75, flow: 70 } },
  { id: 'journal', name: 'Journal', v: { font: 'caveat', tip: 'felt', ink: 'purple', paper: 'yellow', ...NATURAL } },
  { id: 'school', name: 'School copy', v: { font: 'playwrite', tip: 'ball', ink: 'blue', paper: 'spiral', ...NEAT } },
];

/** What a Look changes: no paper when it is for one block, and no hand that is no longer there. */
export function lookPatch(look: SavedLook, blockScope: boolean): Partial<Settings> {
  const v: Partial<Settings> = { ...look.v };
  if (blockScope) delete v.paper;
  if (v.font !== undefined && !FONTS.some(f => f.id === v.font)) delete v.font;
  return v;
}

/** The first Look all of whose values are what the panel shows (paper against the document's, unless it is for one block). */
export function matchLook(V: Settings, S: Settings, looks: SavedLook[], blockScope: boolean): SavedLook | null {
  const cur = V as unknown as Record<string, unknown>;
  return looks.find(l => Object.entries(l.v).every(([k, val]) => {
    if (k === 'paper') return blockScope || S.paper === val;
    return cur[k] === val;
  })) ?? null;
}

export const pickLook = (look: SavedLook): void => setV(lookPatch(look, !!scopeBox()), step('look'));

/**
 * The handwriting keys as the panel shows them, and the document's paper: what saving a look keeps.
 * Not the As drawn pen, which isn't offered: a look made from such a document leaves the pen alone.
 */
export function currentLookValues(): Partial<Settings> {
  const V = view() as unknown as Record<string, unknown>;
  const v = Object.fromEntries(BOX_KEYS.map(k => [k, V[k]])) as Partial<Settings>;
  if (v.tip === 'font') delete v.tip;
  return { ...v, paper: useEditor.getState().S.paper };
}
