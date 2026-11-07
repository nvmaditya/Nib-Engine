// Style's Handwriting section: the current hand writing the start of the document, and Change, which
// opens the picker. Whether the picker is open, and its search and filter, are kept in `useStylePanel`,
// so closing it, switching stages or crossing 860 px keeps them.
import { useRef } from 'react';
import { FONTS } from '@/engine/config.js';
import type { Settings } from '@/engine/types';
import { HandPicker } from './HandPicker';
import { HandSample, paperTint } from './HandSample';
import { handNote, shapesNote } from './hands';
import { useStylePanel, type StylePanelState } from './panelState';
import { Group } from './parts';

const setPicker = (p: Partial<StylePanelState['picker']>) => useStylePanel.setState(s => ({ picker: { ...s.picker, ...p } }));
const setOpen = (open: boolean) => setPicker({ open });
const setQ = (q: string) => setPicker({ q });
const setFilter = (filter: StylePanelState['picker']['filter']) => setPicker({ filter });

export function HandSection({ V, start, blockName }: { V: Settings; start: string; blockName: string | null }) {
  const { open, q, filter } = useStylePanel(s => s.picker);
  const changeRef = useRef<HTMLButtonElement>(null);
  const cfg = FONTS.find(f => f.id === V.font) ?? FONTS[0];
  const shapes = shapesNote(cfg);
  return (
    <Group title="Handwriting">
      <button ref={changeRef} type="button" aria-label="Change handwriting" onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-[10px] border border-line bg-surface p-1.5 pr-3 text-left transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-ring/50">
        <span className="flex h-12 min-w-0 flex-1 items-center overflow-hidden rounded-md px-2.5" style={{ background: paperTint(V.paper) }}>
          <HandSample settings={V} text={start} height={40} />
        </span>
        <span className="flex-none text-[13px] font-medium text-primary">Change</span>
      </button>
      <p className="mt-1.5 text-[13px] text-muted">{cfg.name} · {handNote(cfg)}{shapes && ` · ${shapes}`}</p>
      <HandPicker returnTo={changeRef} open={open} onOpenChange={setOpen} V={V} start={start} blockName={blockName}
        q={q} onQ={setQ} filter={filter} onFilter={setFilter} />
    </Group>
  );
}
