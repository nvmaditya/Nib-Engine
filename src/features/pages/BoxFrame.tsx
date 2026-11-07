// A block's part on one page: its outline and name tag in the block's colour, and what it does with
// the pointer and the keys. `mode` is the page's: write (drag, resize, click a word, the tag's menu)
// or style (select and drag).
import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { hasOwnStyle, segId, segTilt } from '@/engine/core.js';
import type { Seg } from '@/engine/types';
import { blockColor, partLabel } from '@/features/doc/blocks';
import { deleteBlock, editFrame, removePart, select } from '@/features/doc/actions';
import { cn } from '@/lib/utils';
import { drag, nudge, startBlockDrag, wordClick } from './drag';

export interface BoxFrameProps {
  sg: Seg;
  s: number;          // CSS pixels per page unit
  gap: number;        // line spacing in page units
  parts: number;      // how many parts the block has (on all pages)
  selected: boolean;
  mode: 'write' | 'style';
  tagMenu?: (sg: Seg) => ReactNode;
  onWordClick?: (sg: Seg) => void;
}

export function BoxFrame({ sg, s, gap, parts, selected, mode, tagMenu, onWordClick }: BoxFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Where the pointer went down, and whether a click there may put the caret at a word: decided at
  // pointerdown, since a drag captures the pointer and its click then lands on the frame itself.
  const down = useRef<{ x: number; y: number; word: boolean } | null>(null);
  const box = sg.box, write = mode === 'write', own = !write && hasOwnStyle(box);
  // Delete takes only this page's part of a block on several pages, else the block. A header's text
  // comes from its fields, so a header is deleted whole.
  const byPart = parts > 1 && box.kind !== 'header';
  const del = () => (byPart ? removePart(box.id, sg.idx) : deleteBlock(box.id));
  const top = sg.top + gap * 0.1;
  const label = partLabel(sg.idx, parts);
  const tilt = segTilt(sg);
  useLayoutEffect(() => { if (!drag.active && ref.current) ref.current.style.transform = ''; });
  // The name tag hangs from the block's left edge; where that would put its right end past the page's
  // (a margin note on a phone, with its Own style badge), it shifts left to end at the page's edge. The
  // tag's `left` starts inside the frame's border, and a turned note carries its tag round with it, so
  // after the layout sum the tag's drawn box is measured and moved in by whatever still sticks out.
  const tagRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const t = tagRef.current, f = ref.current, paper = f?.closest<HTMLElement>('[data-paper]');
    if (!t || !f || !paper) return;
    const least = -sg.x * s;
    const place = (left: number) => { t.style.left = left < -2 && paper.clientWidth > 0 ? `${Math.max(left, least)}px` : ''; };
    place(Math.min(-2, paper.clientWidth - sg.x * s - f.clientLeft - t.offsetWidth));
    for (let n = 0; n < 3; n++) {
      const over = t.getBoundingClientRect().right - paper.getBoundingClientRect().right;
      if (!(over > 0.5)) break;
      const at = parseFloat(t.style.left) || -2;
      if (at <= least) break;
      place(at - over);
    }
  }, [sg.x, s, box.name, label, own, tilt]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('.tag-menu')) return; // the tag's menu button
    e.stopPropagation();
    down.current = { x: e.clientX, y: e.clientY, word: write && !t.closest('.tag, .rz') };
    if (!selected) select(box.id);
    const isRz = write && !!t.closest('.rz'), isGrip = !!t.closest('.grip');
    if (e.pointerType === 'touch' && !isRz && !isGrip) return; // let touch scroll the page; a tap is a click
    e.preventDefault();
    if (ref.current) startBlockDrag(e, sg, { s, frame: ref.current, mode: isRz ? 'resize' : 'move', onStart: () => { down.current = null; } });
  };

  // A click that didn't drag, which went down on the writing (not the tag or the resize handle), puts
  // the caret at that word.
  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const d = down.current;
    down.current = null;
    if (!d?.word || Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 3) return;
    const paper = ref.current?.closest<HTMLElement>('[data-paper]');
    if (!paper) return;
    const r = paper.getBoundingClientRect();
    onWordClick?.(sg);
    wordClick(sg, (e.clientX - r.left) / s, (e.clientY - r.top) / s);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== ref.current && !(e.target as HTMLElement).closest('.grip')) return;
    if (nudge(sg, e.key)) { e.preventDefault(); return; }
    if (e.key === 'Escape') { select(null); ref.current?.blur(); return; }
    if (!write) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); }
    else if (e.key === 'Enter') { e.preventDefault(); editFrame(sg); }
  };

  const style = {
    left: sg.x * s, top: top * s, width: sg.w * s, height: Math.max(gap * 0.8, sg.bottom - top) * s,
    '--bc': blockColor(box), rotate: tilt ? `${tilt}rad` : undefined,
  } as CSSProperties;
  return (
    <div ref={ref} className={cn('block-frame', selected && 'selected', sg.idx > 0 && 'cont', own && 'own', tilt !== 0 && 'tilted', !box.text.trim() && 'empty')}
      data-id={segId(sg)} tabIndex={0} role="group" aria-label={label ? `${box.name}, part ${label}` : box.name} style={style}
      onPointerDown={onPointerDown} onClick={onClick} onKeyDown={onKeyDown}
      onFocus={() => { if (!selected) select(box.id); }}>
      <span className="ph">Empty block</span>
      {write && <span className="rz" title="Drag to change width" />}
      <div ref={tagRef} className="tag">
        <button type="button" tabIndex={-1} className="grip focus-visible:ring-2 focus-visible:ring-ring/50" aria-label={`Move ${box.name}`} title="Drag to move">
          <GripVertical aria-hidden />
        </button>
        <span className="tag-name">{box.name}</span>
        {label && <><span aria-hidden className="tag-sep">·</span><span className="tag-part">{label}</span></>}
        {own && <span className="tag-own">Own style</span>}
        {write && tagMenu && <span className="tag-menu">{tagMenu(sg)}</span>}
      </div>
    </div>
  );
}
