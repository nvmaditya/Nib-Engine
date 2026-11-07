// Fit back (spec: Style, page count). When a change made the document take more pages, Fit back finds
// the largest letter size below the current one at which it takes no more than it did, and if even the
// smallest letters don't do it, the largest line spacing as well. It only pulls a lever that changes
// the page count, and says which it pulled. It is worked out on copies, laid out by the engine with the
// hands' real metrics, so the pages it promises are the ones the person sees.
import { LIMITS } from '@/engine/config.js';
import { boxSettings, clearMeasureCache, fontReady, fontsInUse, use } from '@/engine/core.js';
import type { EngineDoc, Settings } from '@/engine/types';
import { scopeBox, step } from '@/features/doc/actions';
import { layoutFor } from '@/features/doc/model';
import { docAction, toast, update, useEditor, type EditorState } from '@/store/editor';

const get = useEditor.getState;

/** `1 page`, `2 pages`. */
export const pagesWord = (n: number): string => (n === 1 ? '1 page' : `${n} pages`);

/** Whose letter size Fit back lowers: the selected block's (Only scope) or the whole document's. */
export type SizeOf = 'block' | 'document';

/**
 * What Fit back sets: a letter size and whose it is (null when the letters stay as they are), the
 * line spacing, and the pages they take.
 */
export interface FitPlan { size: { of: SizeOf; to: number } | null; gap: number; pages: number }

/**
 * The largest whole value in lo..hi for which `ok` holds, or null when it doesn't hold at `lo`.
 * Bisection: it relies on `ok` holding for every value below one it holds for (fit.test.ts checks
 * this for page counts on every built-in hand).
 */
function largest(lo: number, hi: number, ok: (v: number) => boolean): number | null {
  if (lo > hi || !ok(lo)) return null;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ok(mid)) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/**
 * How to get the document back to `target` pages, never below `LIMITS`, pulling only levers that
 * change the page count. The letter size is the scope's: the block's when `boxId` names one, else the
 * document's. When the block's letters can't change the page count, it is the whole document's letter
 * size instead, and when no letter size can, the letters stay as they are.
 * - With a letter size that helps: the largest that fits; else the smallest, and the largest line
 *   spacing that fits (the spec's order).
 * - With none: the largest line spacing that fits; else the smallest letters with the largest line
 *   spacing that fits (closer lines can let smaller letters matter).
 * Null when nothing fits. `S` and `doc` are not changed; they are laid out again before it returns,
 * so the engine is left on them.
 */
export function fitPlan(S: Settings, doc: EngineDoc, boxId: string | null, target: number): FitPlan | null {
  const own = boxId ? doc.boxes.find(b => b.id === boxId) : undefined;
  use(S, doc);
  const gap0 = S.gap;
  const size0: Record<SizeOf, number> = { block: own ? boxSettings(own).size : S.size, document: S.size };
  const seen = new Map<string, number>();
  /** The pages with `of`'s letter size at `size` (`of` null: every letter size as it is) and the line spacing at `gap`. */
  const pagesAt = (of: SizeOf | null, size: number, gap: number): number => {
    const k = (of ?? '') + ':' + size + ':' + gap;
    let p = seen.get(k);
    if (p === undefined) {
      const S2 = structuredClone(S), d2 = structuredClone(doc);
      const b2 = own && d2.boxes.find(b => b.id === own.id);
      if (of === 'block' && b2) b2.style = { ...b2.style, size };
      else if (of === 'document') S2.size = size;
      S2.gap = gap;
      seen.set(k, p = layoutFor(S2, d2).pages);
    }
    return p;
  };
  const plan = (of: SizeOf | null, size: number, gap: number): FitPlan =>
    ({ size: of ? { of, to: size } : null, gap, pages: pagesAt(of, size, gap) });
  try {
    const [minSize] = LIMITS.size, [minGap] = LIMITS.gap;
    const sizes: SizeOf[] = own ? ['block', 'document'] : ['document'];
    const now = pagesAt(null, 0, gap0);
    const lever = sizes.find(of => size0[of] > minSize && pagesAt(of, minSize, gap0) < now) ?? null;
    if (lever) {
      const size = largest(minSize, size0[lever] - 1, v => pagesAt(lever, v, gap0) <= target);
      if (size !== null) return plan(lever, size, gap0);
    } else {
      const gap = largest(minGap, gap0 - 1, g => pagesAt(null, 0, g) <= target);
      if (gap !== null) return plan(null, 0, gap);
    }
    for (const of of lever ? [lever] : sizes) {
      if (size0[of] <= minSize) continue;
      const gap = largest(minGap, gap0 - 1, g => pagesAt(of, minSize, g) <= target);
      if (gap !== null) return plan(of, minSize, gap);
    }
    return null;
  } finally {
    layoutFor(S, doc);
  }
}

/**
 * Fit the open document back onto `target` pages, as one undo step, and say exactly what changed
 * (with an Undo that puts it back as a step of its own). In Only scope the selected block gets the
 * letter size, unless its letters can't change the page count; then it is the whole document's, and
 * the message says so. When nothing fits it says so and changes nothing. It waits for the document's
 * hands: until their files arrive, the pages can't be measured as they will be drawn, so it does
 * nothing (Fit back is disabled then).
 */
export function fitBack(target: number): boolean {
  const s = get(), b = scopeBox();
  use(s.S, s.doc);
  if (!fontsInUse().every(fontReady)) return false;
  const plan = fitPlan(s.S, s.doc, b?.id ?? null, target);
  if (!plan) {
    toast(`This doesn’t fit on ${pagesWord(target)}, even with the smallest letter size and line spacing.`);
    return false;
  }
  // What it changes, to put back: the block's own size (or that it had none), or the document's; and the line spacing.
  const size = plan.size, id = b ? b.id : null;
  const ownSize = b ? b.style.size : undefined, docSize = s.S.size, docGap = s.S.gap;
  const boxIn = (st: EditorState) => (id === null ? undefined : st.doc.boxes.find(x => x.id === id));
  update(st => {
    if (size?.of === 'block') { const box = boxIn(st); if (box) box.style = { ...box.style, size: size.to }; }
    else if (size?.of === 'document') st.S.size = size.to;
    st.S.gap = plan.gap;
    clearMeasureCache();
  }, { history: step('fit-back') });
  layoutFor(get().S, get().doc);
  const putBack = docAction('Undo', () => update(st => {
    if (size?.of === 'document') st.S.size = docSize;
    else if (size?.of === 'block') {
      const box = boxIn(st);
      if (box) {
        const style = { ...box.style };
        if (ownSize === undefined) delete style.size; else style.size = ownSize;
        box.style = style;
      }
    }
    st.S.gap = docGap;
    clearMeasureCache();
  }, { history: step('fit-back-undo') }));
  // In Only scope the panel's Letter size is the block's, so the whole document's is named as such.
  const letters = size && `${size.of === 'document' && b ? 'The whole document’s letter size' : 'Letter size'} is now ${size.to}`;
  const said = letters ? letters + (plan.gap !== docGap ? ` and line spacing ${plan.gap}.` : '.') : `Line spacing is now ${plan.gap}.`;
  toast(`Back to ${pagesWord(plan.pages)}. ${said}`, putBack);
  return true;
}
