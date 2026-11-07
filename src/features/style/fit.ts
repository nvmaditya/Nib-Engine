// Fit back (spec: Style, page count). When a change made the document take more pages, Fit back finds
// the largest letter size below the current one at which it takes no more than it did, and if even the
// smallest letters don't do it, the largest line spacing as well. It is worked out on copies, laid out
// by the engine with the hands' real metrics, so the pages it promises are the ones the person sees.
import { LIMITS } from '@/engine/config.js';
import { boxSettings, clearMeasureCache, fontReady, fontsInUse, use } from '@/engine/core.js';
import type { EngineDoc, Settings } from '@/engine/types';
import { scopeBox, step } from '@/features/doc/actions';
import { layoutFor } from '@/features/doc/model';
import { docAction, toast, update, useEditor, type EditorState } from '@/store/editor';

const get = useEditor.getState;

/** `1 page`, `2 pages`. */
export const pagesWord = (n: number): string => (n === 1 ? '1 page' : `${n} pages`);

/** What Fit back sets: the letter size (the block's, in Only scope), the line spacing, and the pages they take. */
export interface FitPlan { size: number; gap: number; pages: number }

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
 * How to get the document back to `target` pages: lower the letter size (that block's, when `boxId`
 * names one), then the line spacing, never below `LIMITS`. Null when even the smallest of both is too
 * big. `S` and `doc` are not changed; they are laid out again before it returns, so the engine is left on them.
 */
export function fitPlan(S: Settings, doc: EngineDoc, boxId: string | null, target: number): FitPlan | null {
  const own = boxId ? doc.boxes.find(b => b.id === boxId) : undefined;
  use(S, doc);
  const size0 = own ? boxSettings(own).size : S.size, gap0 = S.gap;
  const seen = new Map<string, number>();
  const pagesAt = (size: number, gap: number): number => {
    const k = size + ':' + gap;
    let p = seen.get(k);
    if (p === undefined) {
      const S2 = structuredClone(S), d2 = structuredClone(doc);
      const b2 = own && d2.boxes.find(b => b.id === own.id);
      if (b2) b2.style = { ...b2.style, size }; else S2.size = size;
      S2.gap = gap;
      seen.set(k, p = layoutFor(S2, d2).pages);
    }
    return p;
  };
  try {
    const [minSize] = LIMITS.size, [minGap] = LIMITS.gap;
    const size = largest(minSize, size0 - 1, s => pagesAt(s, gap0) <= target);
    if (size !== null) return { size, gap: gap0, pages: pagesAt(size, gap0) };
    const small = Math.min(size0, minSize);
    const gap = largest(minGap, gap0 - 1, g => pagesAt(small, g) <= target);
    return gap === null ? null : { size: small, gap, pages: pagesAt(small, gap) };
  } finally {
    layoutFor(S, doc);
  }
}

/**
 * Fit the open document back onto `target` pages, as one undo step, and say what changed (with an
 * Undo that puts it back as a step of its own). In Only scope the selected block gets the letter size.
 * When nothing fits it says so and changes nothing. It waits for the document's hands: until their
 * files arrive, the pages can't be measured as they will be drawn, so it does nothing (Fit back is disabled then).
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
  // What it changes, to put back: the block's own size (or that it had none), else the document's; and the line spacing.
  const id = b ? b.id : null, ownSize = b ? b.style.size : undefined, docSize = s.S.size, docGap = s.S.gap;
  const boxIn = (st: EditorState) => (id === null ? undefined : st.doc.boxes.find(x => x.id === id));
  update(st => {
    const box = boxIn(st);
    if (box) box.style = { ...box.style, size: plan.size }; else st.S.size = plan.size;
    st.S.gap = plan.gap;
    clearMeasureCache();
  }, { history: step('fit-back') });
  layoutFor(get().S, get().doc);
  const putBack = docAction('Undo', () => update(st => {
    const box = boxIn(st);
    if (id === null) st.S.size = docSize;
    else if (box) {
      const style = { ...box.style };
      if (ownSize === undefined) delete style.size; else style.size = ownSize;
      box.style = style;
    }
    st.S.gap = docGap;
    clearMeasureCache();
  }, { history: step('fit-back-undo') }));
  toast(`Back to ${pagesWord(plan.pages)}. Letter size is now ${plan.size}` + (plan.gap !== docGap ? ` and line spacing ${plan.gap}.` : '.'), putBack);
  return true;
}
