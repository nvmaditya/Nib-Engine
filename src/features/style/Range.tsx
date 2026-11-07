// A slider in the Style panel. One drag is one undo step, however long it pauses; so is each arrow-key press.
// A drag or a press that comes to nothing (moved and moved back) leaves no step.
import { useId, useRef } from 'react';
import { LIMITS } from '@/engine/config.js';
import type { Settings } from '@/engine/types';
import { Slider } from '@/components/ui/slider';
import { applyStyle, view } from '@/features/doc/actions';
import { gesture, type Gesture } from '@/store/editor';
import { SETTING_CONTROLS } from './controls';

type Steps = { change(patch: Partial<Settings>): void; end(): void; press(): void; commit(): void };

/**
 * Changes made while `end()` hasn't been called are one undo step: the first starts a gesture and the
 * rest go through it. (No timer: a drag that stops for a while is still the same drag.) `end()` closes the
 * step, and one that ended where it began is taken back.
 *
 * A key press (`press()` comes before its change) is a step of its own, which stays open until the next
 * press, drag or leaving: a press that puts the slider back where that step began (Right, then Left) goes
 * into it, so the two leave nothing. `commit()` is the slider's value commit: the end of a drag, or (from
 * Radix, before the change) a key press, which its change decides.
 */
export function rangeSteps(kind: string): Steps {
  let run: Gesture | null = null, from: Partial<Settings> = {}, pressed = false;
  const close = () => { run?.end(); run = null; };
  return {
    change(patch) {
      if (pressed) {
        pressed = false;
        const back = run !== null && Object.entries(patch).every(([k, v]) => from[k as keyof Settings] === v);
        if (back) { run!(applyStyle(patch)); close(); return; }
        close();
      }
      if (!run) {
        const V = view();
        from = Object.fromEntries(Object.keys(patch).map(k => [k, V[k as keyof Settings]]));
        run = gesture('slider:' + kind);
      }
      run(applyStyle(patch));
    },
    end() { pressed = false; close(); },
    press() { pressed = true; },
    commit() { if (!pressed) close(); },
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
        onPointerDown={end} onKeyDown={() => steps.press()} onBlur={end} onValueCommit={() => steps.commit()}
        onValueChange={([n]) => { if (n !== V[id]) steps.change({ [id]: n }); }} />
    </div>
  );
}
