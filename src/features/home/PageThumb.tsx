// A document's page 1 as the engine draws it, in a tile the size of a page. It asks for the picture only
// while near the view; until then (and while it is drawn) it shows the paper's colour.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { EngineDoc, Settings } from '@/engine/types';
import { useNearViewport } from '@/features/pages/useNearViewport';
import { paperTint } from '@/features/style/HandSample';
import { peekThumb, thumbFor, thumbSig, type Thumb } from './thumbs';

export function PageThumb({ owner, S, doc, px, onPages, className }: {
  owner: string; S: Settings; doc: EngineDoc; px: number; onPages?(pages: number): void; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const near = useNearViewport(ref, '100%');
  const sig = useMemo(() => thumbSig(S, doc, px), [S, doc, px]);
  const [drawn, setDrawn] = useState<{ sig: string; thumb: Thumb } | null>(null);
  const thumb = (drawn && drawn.sig === sig ? drawn.thumb : null) ?? peekThumb(owner, sig);
  const pages = useRef(onPages);
  pages.current = onPages;

  useEffect(() => {
    if (thumb || !near) return;
    let alive = true;
    void thumbFor(owner, S, doc, px, () => alive).then(t => { if (alive && t) setDrawn({ sig, thumb: t }); });
    return () => { alive = false; };
  }, [thumb, near, owner, S, doc, px, sig]);

  const count = thumb?.pages;
  useLayoutEffect(() => { if (count !== undefined) pages.current?.(count); }, [count]);

  return (
    <span ref={ref} data-owner={owner} style={{ background: paperTint(S.paper) }}
      className={`block aspect-[210/297] overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,0.08)] ${className ?? ''}`}>
      {thumb && <img src={thumb.url} alt="" draggable={false} className="block size-full" />}
    </span>
  );
}
