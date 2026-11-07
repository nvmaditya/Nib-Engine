// Paper and its effects. Paper is the document's, never a block's.
import { PAPERS } from '@/engine/config.js';
import { PHOTO_URL } from '@/engine/core.js';
import type { PaperCfg, Settings } from '@/engine/types';
import { Switch } from '@/components/ui/switch';
import { setS } from '@/features/doc/actions';
import { cn } from '@/lib/utils';
import { Fold, Group, Hint } from './parts';

type Effect = 'lighting' | 'ghost' | 'holes' | 'crease';

/** Which effects a paper can show: the photo brings its own light, and only some papers have holes. */
export const EFFECT_WORKS: Record<Effect, (P: PaperCfg) => boolean> = {
  lighting: P => !P.photo,
  ghost: () => true,
  holes: P => !!P.holes,
  crease: () => true,
};

const EFFECTS: [Effect, string][] = [['lighting', 'Room lighting'], ['ghost', 'Show-through'], ['holes', 'Punch holes'], ['crease', 'Fold crease']];
const option = 'rounded-lg border border-line bg-surface transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:ring-1 aria-pressed:ring-primary';

export function PaperSection({ S, blockScope }: { S: Settings; blockScope: boolean }) {
  const paper = PAPERS[S.paper] ?? PAPERS.ruled;
  return (
    <Group title="Paper" meta={blockScope ? 'shared by every page' : undefined}>
      <div role="group" aria-label="Paper" className="grid grid-cols-3 gap-1.5">
        {Object.entries(PAPERS).map(([id, p]) => (
          <button key={id} type="button" aria-pressed={id === S.paper} onClick={() => setS('paper', id)}
            className={cn(option, 'flex flex-col items-center gap-1.5 px-1 py-2 text-center text-xs leading-tight font-medium')}>
            <span className={'pv pv-' + id} aria-hidden="true" style={p.photo ? { backgroundImage: `url("${PHOTO_URL}")` } : undefined} />
            <span>{p.name}</span>
          </button>
        ))}
      </div>
      <Fold id="effects" title="Paper effects">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {EFFECTS.filter(([k]) => k !== 'crease' || S.crease).map(([k, label]) => {
            const works = EFFECT_WORKS[k](paper);
            return (
              <div key={k} className="flex flex-col gap-0.5">
                <label className={cn('flex items-center gap-2 text-sm', works ? 'cursor-pointer' : 'cursor-not-allowed text-muted')}>
                  <Switch checked={works && !!S[k]} disabled={!works} onCheckedChange={v => setS(k, v)} aria-label={label} aria-describedby={works ? undefined : 'why-' + k} />{label}
                </label>
                {!works && <span id={'why-' + k} className="pl-11 text-xs text-muted">Not on this paper</span>}
              </div>
            );
          })}
        </div>
      </Fold>
      <Hint>Show-through adds faint writing from the back of the sheet, the way real notebook paper looks.</Hint>
    </Group>
  );
}
