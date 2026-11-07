// A word or two in a hand, drawn by the engine itself so it has the real letters, pen, ink and realism.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FONTS, PAPERS } from '@/engine/config.js';
import { drawSample, fontReady, fontStr, loadFont } from '@/engine/core.js';
import type { Settings } from '@/engine/types';
import { toMarkup } from '@/features/editor/markup';
import { dprNow } from '@/features/pages/Sheet';
import { useNearViewport } from '@/features/pages/useNearViewport';

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

export function HandSample({ settings, text, height, className }: { settings: Settings; text: string; height: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const near = useNearViewport(ref, '100%');
  const [, setArrived] = useState(0);
  const markup = markupOf(text);
  const font = settings.font;
  const ready = fontReady(font);

  // A hand that is still arriving is fetched, and drawn again once it has.
  useEffect(() => {
    if (ready || !markup) return;
    let live = true;
    const cfg = FONTS.find(f => f.id === font);
    void loadFont(font).then(ok => { if (live && ok) setArrived(n => n + 1); });
    if (cfg) void document.fonts?.load(fontStr(cfg, 40)).catch(() => {});
    return () => { live = false; };
  }, [font, ready, markup]);

  const key = [...KEYS.map(k => String(settings[k])), markup, height, ready].join('|');
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const clear = () => { c.width = 0; c.height = 0; delete c.dataset.k; };
    if (!near || !markup) return clear();
    if (c.dataset.k === key) return;
    const dpr = dprNow(), w = drawSample(c, settings, markup, Math.round(height * dpr));
    if (w == null) return clear();
    c.style.width = `${w / dpr}px`; c.style.height = `${height}px`;
    c.dataset.k = key;
  // `settings` is read through `key`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, markup, key, height]);

  return <canvas ref={ref} aria-hidden="true" className={['mix-blend-multiply', className].filter(Boolean).join(' ')} />;
}
