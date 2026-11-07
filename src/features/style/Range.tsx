// A slider in the Style panel. One drag is one undo step, however long it pauses; so is each arrow-key press.
import { useId, useRef } from 'react';
import { LIMITS } from '@/engine/config.js';
import type { Settings } from '@/engine/types';
import { Slider } from '@/components/ui/slider';
import { applyStyle } from '@/features/doc/actions';
import { gesture } from '@/store/editor';
import { SETTING_CONTROLS } from './controls';

type Steps = { change(patch: Partial<Settings>): void; end(): void };

/**
 * Changes made while `end()` hasn't been called are one undo step: the first starts a gesture and the
 * rest go through it. (No timer: a drag that stops for a while is still the same drag.)
 */
export function rangeSteps(kind: string): Steps {
  let run: ReturnType<typeof gesture> | null = null;
  return {
    change(patch) { (run ??= gesture('slider:' + kind))(applyStyle(patch)); },
    end() { run = null; },
  };
}

export const FORMAT: Partial<Record<keyof typeof LIMITS, (v: number) => string>> = {
  weight: v => v + '%',
  track: v => (v > 0 ? '+' : '') + v,
  words: v => (v > 0 ? '+' : '') + v + '%',
};

export function Range({ id, V, step = 1 }: { id: keyof typeof LIMITS; V: Settings; step?: number }) {
  const ref = useRef<Steps | null>(null);
  const steps = (ref.current ??= rangeSteps(id));
  const [min, max] = LIMITS[id];
  const v = V[id], label = SETTING_CONTROLS[id].label, fmt = FORMAT[id];
  const end = () => steps.end(), labelId = useId();
  return (
    <div className="mt-3.5 first:mt-0">
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className="text-sm font-medium">{label}</span>
        <output className="text-[13px] text-muted tabular-nums">{fmt ? fmt(v) : v}</output>
      </div>
      <Slider aria-labelledby={labelId} className="mt-2.5 h-5" thumbLabel={label} min={min} max={max} step={step} value={[v]}
        onPointerDown={end} onKeyDown={end} onBlur={end} onValueCommit={end}
        onValueChange={([n]) => { if (n !== V[id]) steps.change({ [id]: n }); }} />
    </div>
  );
}
