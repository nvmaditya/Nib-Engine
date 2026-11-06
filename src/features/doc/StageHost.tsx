// The open document's stages. Each stays mounted after its first visit, so its editors, searches and
// scroll positions survive a switch; the ones not shown are hidden and inert (no focus, no clicks).
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Stage } from '@/app/route';

const ORDER: readonly Stage[] = ['write', 'outline', 'style', 'export'];
const Active = createContext(true);

/** Whether the stage this component is in is the one on screen (true outside a StageHost). */
export const useStageActive = (): boolean => useContext(Active);

export function StageHost({ stage, render }: { stage: Stage; render(s: Stage): ReactNode }) {
  const [visited, setVisited] = useState<readonly Stage[]>([stage]);
  if (!visited.includes(stage)) setVisited([...visited, stage]); // React renders again at once with it
  const shown = visited.includes(stage) ? visited : [...visited, stage];
  return ORDER.filter(s => shown.includes(s)).map(s => {
    const on = s === stage;
    return (
      <Active.Provider key={s} value={on}>
        <div data-stage={s} hidden={!on} inert={!on} className="flex min-h-0 flex-1 flex-col">{render(s)}</div>
      </Active.Provider>
    );
  });
}
