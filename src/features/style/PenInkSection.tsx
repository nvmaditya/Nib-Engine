// Pen and Ink: the five pens (As drawn isn't offered, but a document that has it keeps drawing with it) and the six inks.
import { useRef } from 'react';
import { INKS, PENS } from '@/engine/config.js';
import type { Settings } from '@/engine/types';
import { applyStyle, setV } from '@/features/doc/actions';
import { cn } from '@/lib/utils';
import { gesture, type Gesture } from '@/store/editor';
import { Group, Hint } from './parts';
import { Range } from './Range';

const option = 'rounded-lg border border-line bg-surface transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:ring-1 aria-pressed:ring-primary';
const PEN_CHOICES = PENS.filter(p => p.id !== 'font');

export function PenInkSection({ V }: { V: Settings }) {
  const pen = PEN_CHOICES.find(p => p.id === V.tip);
  const inkLabel = V.ink === 'custom' ? 'Your colour' : (INKS.find(i => i.id === V.ink) || INKS[0]).name;
  // One session in the colour picker (its first input until it loses focus) is one undo step, and none if it
  // ends on the colour it began with.
  const session = useRef<Gesture | null>(null);
  const pick = (c: string) => { (session.current ??= gesture('ink-colour'))(applyStyle({ customInk: c, ink: 'custom' })); };
  return (
    <>
      <Group title="Pen" value={pen?.name}>
        <div role="group" aria-label="Pen" className="grid grid-cols-3 gap-1.5">
          {PEN_CHOICES.map(p => (
            <button key={p.id} type="button" aria-pressed={p.id === V.tip} onClick={() => { if (p.id !== V.tip) setV({ tip: p.id }); }}
              className={cn(option, 'flex flex-col items-start gap-1 px-2.5 py-2 text-left text-[13px] leading-tight font-medium')}>
              <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true" className="block h-3 w-full text-fg">
                <path d="M3 7 C 25 1, 45 12, 65 5 S 90 4, 97 6" fill="none" stroke="currentColor" strokeWidth={Math.min(4.5, p.w * 1.25)} strokeLinecap="round"
                  opacity={p.id === 'pencil' ? 0.6 : 1} strokeDasharray={p.id === 'pencil' ? '7 1.2' : undefined} />
              </svg>
              <span>{p.name}</span><small className="text-[11.5px] font-normal text-muted">{p.note}</small>
            </button>
          ))}
        </div>
        <div className="mt-3.5"><Range id="weight" V={V} /></div>
        <Hint>Every handwriting is redrawn at the pen’s real line width, so even a bold font can look like a fine ballpoint.</Hint>
      </Group>
      <Group title="Ink" value={inkLabel}>
        <div role="group" aria-label="Ink" className="flex flex-wrap gap-3">
          {INKS.map(i => (
            <button key={i.id} type="button" aria-pressed={i.id === V.ink} aria-label={i.name + ' ink'} title={i.name} onClick={() => { if (i.id !== V.ink) setV({ ink: i.id }); }}
              style={{ background: i.c }}
              className="size-9 rounded-full ring-1 ring-line-strong ring-offset-2 ring-offset-surface transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:ring-2 aria-pressed:ring-primary" />
          ))}
          <label title="Any colour" aria-pressed={V.ink === 'custom'}
            style={{ background: V.ink === 'custom' ? V.customInk : 'conic-gradient(#e33,#e9c43b,#3b9e5b,#2d6fd8,#8a4fd6,#e33)' }}
            className="relative size-9 cursor-pointer overflow-hidden rounded-full ring-1 ring-line-strong ring-offset-2 ring-offset-surface focus-within:ring-2 focus-within:ring-ring/50 aria-pressed:ring-2 aria-pressed:ring-primary">
            <input type="color" value={V.customInk} aria-label="Pick any ink colour" className="absolute inset-0 size-full cursor-pointer opacity-0"
              onChange={e => pick(e.target.value)} onBlur={() => { session.current?.end(); session.current = null; }} />
          </label>
        </div>
      </Group>
    </>
  );
}
