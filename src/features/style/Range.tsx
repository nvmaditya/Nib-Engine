// A slider in the Style panel. One drag is one undo step, however long it pauses; so is each arrow-key press.
// A drag that comes to nothing leaves no step, and presses taken back by the opposite presses leave none.
import { useId, useRef } from 'react';
import { LIMITS } from '@/engine/config.js';
import type { Settings } from '@/engine/types';
import { Slider } from '@/components/ui/slider';
import { applyStyle, view } from '@/features/doc/actions';
import { gesture, type Gesture } from '@/store/editor';
import { SETTING_CONTROLS } from './controls';

type Steps = { change(patch: Partial<Settings>): void; end(): void; press(): void; commit(): void };

/**
 * A drag: its changes are one undo step, the first starting a gesture and the rest going through it. (No
 * timer: a drag that stops for a while is still the same drag.) `commit()` (the drag let go) or `end()` closes
 * it, and a drag that ended where it began is taken back.
 *
 * A key press (`press()` comes before its change) is a step of its own. The presses work like a stack: a
 * press that puts the slider back where its newest press began takes that press's step back, as long as
 * that step is still the newest in the history. So Right, Right, Left, Left leaves nothing, and Redo is as it
 * was. Any other change in between ends that: the presses before it stay steps. `end()` (leaving the slider,
 * or pressing it) closes the presses too. Radix commits a key press before its change, so `commit()` leaves
 * presses to their change.
 */
export function rangeSteps(kind: string): Steps {
  let run: Gesture | null = null, pressed = false;
  // This slider's key presses, newest last: each one's step, and the values from before it.
  const presses: { from: Partial<Settings>; g: Gesture }[] = [];
  const endRun = () => { run?.end(); run = null; };
  const endPresses = () => { for (const p of presses.splice(0).reverse()) p.g.end(); };
  const before = (patch: Partial<Settings>): Partial<Settings> => {
    const V = view();
    return Object.fromEntries(Object.keys(patch).map(k => [k, V[k as keyof Settings]]));
  };
  return {
    change(patch) {
      if (!pressed) { // a drag
        if (!run) { endPresses(); run = gesture('slider:' + kind); }
        run(applyStyle(patch));
        return;
      }
      pressed = false; endRun();
      const top = presses.at(-1);
      if (top && !top.g.isNewest()) endPresses(); // another change came after it: the presses so far stay steps
      else if (top && Object.entries(patch).every(([k, v]) => top.from[k as keyof Settings] === v)) {
        presses.pop(); top.g(applyStyle(patch)); top.g.end(); // back where it began: its step is taken back
        return;
      }
      const g = gesture('slider:' + kind);
      presses.push({ from: before(patch), g });
      g(applyStyle(patch));
    },
    end() { pressed = false; endRun(); endPresses(); },
    press() { pressed = true; },
    commit() { if (!pressed) endRun(); },
  };
}

export const FORMAT: Partial<Record<keyof typeof LIMITS, (v: number) => string>> = {
  weight: v => v + '%',
  track: v => (v > 0 ? '+' : '') + v,
  words: v => (v > 0 ? '+' : '') + v + '%',
};

export function Range({ id, V, step = 1, meta }: { id: keyof typeof LIMITS; V: Settings; step?: number; meta?: string }) {
  const ref = useRef<Steps | null>(null);
  const steps = (ref.current ??= rangeSteps(id));
  const [min, max] = LIMITS[id];
  const v = V[id], label = SETTING_CONTROLS[id].label, fmt = FORMAT[id];
  const end = () => steps.end(), labelId = useId();
  return (
    <div className="mt-3.5 first:mt-0">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-baseline gap-2">
          <span id={labelId} className="text-sm font-medium">{label}</span>
          {meta && <span className="text-[13px] text-muted">{meta}</span>}
        </span>
        <output className="text-[13px] text-muted tabular-nums">{fmt ? fmt(v) : v}</output>
      </div>
      <Slider aria-labelledby={labelId} className="mt-2.5 h-5" thumbLabel={label} min={min} max={max} step={step} value={[v]}
        // (A drag let go where it began has no value commit from Radix, so letting go ends the drag too.)
        onPointerDown={end} onPointerUp={() => steps.commit()} onKeyDown={() => steps.press()} onBlur={end} onValueCommit={() => steps.commit()}
        onValueChange={([n]) => { if (n !== V[id]) steps.change({ [id]: n }); }} />
    </div>
  );
}
