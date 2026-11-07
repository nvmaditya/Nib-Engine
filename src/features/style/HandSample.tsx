// A word or two in a hand, drawn by the engine itself so it has the real letters, pen, ink and realism.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FONTS, PAPERS } from '@/engine/config.js';
import { drawSample, fontReady, fontStr, loadFont } from '@/engine/core.js';
import type { Settings } from '@/engine/types';
import { toMarkup } from '@/features/editor/markup';
import { dprNow } from '@/features/pages/Sheet';
import { useNearViewport } from '@/features/pages/useNearViewport';
import { cn } from '@/lib/utils';

/** The colour of a paper, for the tile a sample sits on. */
export function paperTint(paperId: string): string {
  const [r, g, b] = (PAPERS as Record<string, { bg: number[] }>)[paperId]?.bg ?? PAPERS.ruled.bg;
  return `rgb(${r}, ${g}, ${b})`;
}

const KEYS = ['font', 'ink', 'customInk', 'tip', 'weight', 'size', 'gap', 'mess', 'wobble', 'variety', 'flow', 'track', 'words', 'mistakes', 'seed'] as const;

/** `text` as one line of plain words in markup ('' when there are none): the engine draws only a line's first row. */
const markupOf = (text: string): string => {
  const line = text.replace(/\s+/g, ' ').trim();
  return line ? toMarkup({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: line }] }] }) : '';
};

/**
 * `fit="width"` (a word on a tile): the sample shrinks to fit its box, keeping its shape, so the word is
 * never cut. `fit="fade"` (the default, a line of text): it keeps its height and stops at a box of its
 * own, fading out on the right, so it never runs under what sits beside it.
 */
export function HandSample({ settings, text, height, fit = 'fade', className }: {
  settings: Settings; text: string; height: number; fit?: 'width' | 'fade'; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const near = useNearViewport(ref, '100%');
  const [, setArrived] = useState(0);
  const markup = markupOf(text);
  const font = settings.font;
  const ready = fontReady(font);

  // A hand that is still arriving is fetched once the sample is near the view (the gate that draws it), and drawn again once
  // it has arrived. A failed fetch is tried again the next time the sample comes near.
  useEffect(() => {
    if (ready || !markup || !near) return;
    let live = true;
    const cfg = FONTS.find(f => f.id === font);
    void loadFont(font).then(ok => { if (live && ok) setArrived(n => n + 1); });
    if (cfg) void document.fonts?.load(fontStr(cfg, 40)).catch(() => {});
    return () => { live = false; };
  }, [font, ready, markup, near]);

  const key = [...KEYS.map(k => String(settings[k])), markup, height, ready].join('|');
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const clear = () => { c.width = 0; c.height = 0; delete c.dataset.k; };
    if (!near || !markup) return clear();
    if (c.dataset.k === key) return;
    const dpr = dprNow(), w = drawSample(c, settings, markup, Math.round(height * dpr));
    if (w == null) return clear();
    c.style.width = `${w / dpr}px`; c.style.height = fit === 'width' ? '' : `${height}px`;
    c.dataset.k = key;
  // `settings` is read through `key`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, markup, key, height, fit]);

  const canvas = <canvas ref={ref} aria-hidden="true" className={cn('block mix-blend-multiply', fit === 'width' ? 'h-auto max-w-full' : 'max-w-none', className)} />;
  if (fit === 'width') return canvas;
  // (The box takes its tile's paper colour, so the ink still multiplies onto paper inside the mask, and the fade shows none.)
  return (
    <span className="block min-w-0 flex-1 overflow-hidden [background:inherit] [mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)]">
      {canvas}
    </span>
  );
}
