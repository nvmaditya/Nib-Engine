// Letter size, line spacing (the document's), and the spacing sliders folded away.
import type { Settings } from '@/engine/types';
import { Fold, Group } from './parts';
import { Range } from './Range';

export function SizeSection({ V, S, blockScope }: { V: Settings; S: Settings; blockScope: boolean }) {
  return (
    <Group title="Size and spacing">
      <Range id="size" V={V} />
      <Range id="gap" V={S} meta={blockScope ? 'shared by every page' : undefined} />
      <Fold id="spacing" title="Letter and word spacing">
        <Range id="track" V={V} step={0.5} />
        <Range id="words" V={V} step={5} />
      </Fold>
    </Group>
  );
}
