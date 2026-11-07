// How natural: four presets, and the five realism sliders folded away under Fine-tune.
import { PRESETS } from '@/engine/config.js';
import type { Settings } from '@/engine/types';
import { setV } from '@/features/doc/actions';
import { Segmented, SegButton } from '@/features/write/WriteBar';
import { Fold, Group, Hint } from './parts';
import { Range } from './Range';

export function NaturalSection({ V }: { V: Settings }) {
  const matches = (p: (typeof PRESETS)[number]) => (Object.keys(p.v) as (keyof Settings)[]).every(k => V[k] === (p.v as Partial<Settings>)[k]);
  const any = PRESETS.some(matches);
  return (
    <Group title="How natural">
      <Segmented label="How natural">
        {PRESETS.map(p => <SegButton key={p.id} pressed={matches(p)} onClick={() => setV(p.v)}>{p.name}</SegButton>)}
      </Segmented>
      {!any && <p className="mt-2 text-[13px] text-muted">Fine-tuned by you.</p>}
      <Fold id="fine" title="Fine-tune">
        <Range id="mess" V={V} />
        <Hint>Lines climb and sag, line starts drift, words tilt and ride off the line, and gaps between words change.</Hint>
        <Range id="variety" V={V} />
        <Hint>Repeated letters never look exactly the same: each one picks a shape at random and its outline is bent a little differently.</Hint>
        <Range id="wobble" V={V} />
        <Range id="flow" V={V} />
        <Hint>Pressure changes stroke by stroke, like a real pen: downstrokes press harder, and ink runs darker and lighter along the line.</Hint>
        <Range id="mistakes" V={V} />
        <Hint>Now and then a word is misspelt, crossed out and written again. Words you cross out yourself with <code>~~word~~</code> get the same kinds of cut.</Hint>
      </Fold>
    </Group>
  );
}
