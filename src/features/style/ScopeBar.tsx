// The Style panel's sticky header: its title, New variation, the page count notice, and which blocks
// the panel changes. (The notice comes before the scope switch, so a phone's lowest sheet shows it.)
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Shuffle } from 'lucide-react';
import { hasOwnStyle } from '@/engine/core.js';
import { Button } from '@/components/ui/button';
import { newVariation, resetBoxStyle } from '@/features/doc/actions';
import { blockColor } from '@/features/doc/blocks';
import { selectedBox, update, useEditor } from '@/store/editor';

/** The Whole document line for blocks that keep their own style ('' for none). */
export function ownStyleLine(names: string[]): string {
  const q = names.map(n => `“${n}”`);
  if (!q.length) return '';
  if (q.length === 1) return `${q[0]} keeps its own style.`;
  return `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]} keep their own style.`;
}

const seg = 'flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/50 aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-sm';

export function ScopeBar({ notice }: { notice?: ReactNode }) {
  const scopeState = useEditor(s => s.scope);
  const selectedId = useEditor(s => s.selectedId);
  // One string per change that matters here, so a text edit or a drag doesn't redraw the header.
  const key = useEditor(s => JSON.stringify(s.doc.boxes.map(b => [b.id, b.name, b.color, hasOwnStyle(b)])));
  const boxes = useMemo(() => JSON.parse(key) as [string, string, number, boolean][], [key]);
  const b = selectedId ? boxes.find(x => x[0] === selectedId) : undefined;
  const scope = scopeState === 'box' && b ? 'box' : 'all';
  const setScope = (sc: 'all' | 'box') => update(s => { s.scope = sc; }, { save: false, layout: false });
  const owners = boxes.filter(x => x[3]).map(x => x[1]);

  let line: string;
  if (!b) line = 'Changes apply to the whole document. Click a block on the page to style it on its own.';
  else if (scope === 'box') line = b[3] ? 'This block has its own style.' : 'Changes here affect only this block.';
  else line = ownStyleLine(owners) || 'Changes apply to the whole document.';

  return (
    <div className="sticky top-0 z-10 border-b border-line bg-surface px-5 pt-3 pb-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Style</h2>
        <Button variant="outline" size="sm" onClick={newVariation}
          title={scope === 'box' ? 'Draw this block with new random shapes' : 'Draw the whole document with new random shapes'}>
          <Shuffle />New variation
        </Button>
      </div>
      {/* Takes no room while there is no notice (:empty). */}
      <div className="mb-3 empty:hidden">{notice}</div>
      {b && (
        <div role="group" aria-label="Apply changes to" className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
          <button type="button" className={seg} aria-pressed={scope === 'all'} onClick={() => setScope('all')}>Whole document</button>
          <button type="button" className={seg} aria-pressed={scope === 'box'} onClick={() => setScope('box')}
            style={{ '--bc': blockColor({ color: b[2] }) } as CSSProperties}>
            <span aria-hidden className="size-2 flex-none rounded-full bg-[var(--bc)]" />
            <span className="truncate">Only “{b[1]}”</span>
          </button>
        </div>
      )}
      <p className="mt-2 text-[13px] text-muted">{line}</p>
      {scope === 'box' && b?.[3] && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={resetBoxStyle}>Match document</Button>
        </div>
      )}
    </div>
  );
}
