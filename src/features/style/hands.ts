// The handwriting picker's list: which hands a search and filter show, what is said about each, and the
// words a hand is shown writing (the start of the document).
import { FONTS } from '@/engine/config.js';
import { parseLine } from '@/engine/core.js';
import type { Box, EngineDoc, FontCfg, HandTag } from '@/engine/types';
import { plainText } from '@/features/editor/markup';
import { handReadable } from './fonts';

export type HandFilter = 'all' | HandTag | 'fav';

/** The filter chips, one chosen at a time. */
export const HAND_FILTERS: [HandFilter, string][] = [
  ['all', 'All'], ['joined', 'Joined-up'], ['print', 'Print'], ['neat', 'Neat'], ['messy', 'Messy'], ['fun', 'Fun'], ['fav', '★ Favourites'],
];

const isMine = (f: FontCfg): boolean => f.group === 'mine';

/**
 * The hands a search and filter show. Uploaded fonts come first, newest first; they have no tags, so a
 * tag filter leaves them out. Then the built-in hands, in their order in `FONTS`.
 */
export function handList(q: string, filter: HandFilter, favourites: string[]): FontCfg[] {
  const query = q.trim().toLowerCase();
  // A built-in hand is also found by its font's family ("Playwrite" finds School cursive); an uploaded
  // font's family is a name Nib made up, so only its own name counts.
  const found = (f: FontCfg) => !query || f.name.toLowerCase().includes(query) || (!isMine(f) && f.family.toLowerCase().includes(query));
  const kept = (f: FontCfg) => filter === 'all' || (filter === 'fav' ? favourites.includes(f.id) : !!f.tags?.includes(filter));
  const show = (f: FontCfg) => found(f) && kept(f);
  return [...FONTS.filter(isMine).reverse(), ...FONTS.filter(f => !isMine(f))].filter(show);
}

const TAG_WORDS: [HandTag, string][] = [['joined', 'joined-up'], ['print', 'print'], ['neat', 'neat'], ['messy', 'messy'], ['fun', 'fun']];

/**
 * What kind of hand it is: `joined-up` or `print`, then `neat`, `messy`, `fun`; an uploaded font is
 * `your font`, and says so when its file can't be read here (it draws in a stand-in).
 */
export function handNote(cfg: FontCfg): string {
  if (isMine(cfg)) return handReadable(cfg) ? 'your font' : 'your font, which can’t be read on this device';
  const tags = cfg.tags ?? [cfg.conn ? 'joined' : 'print'];
  return TAG_WORDS.filter(([t]) => tags.includes(t)).map(([, w]) => w).join(', ');
}

/**
 * `3 shapes per letter`. A built-in hand with one shape says nothing; an uploaded font always says, so
 * the person knows it was counted, unless its file can't be read here (it has no shapes of its own then).
 */
export function shapesNote(cfg: FontCfg): string | null {
  if (isMine(cfg) && !handReadable(cfg)) return null;
  const n = cfg.forms ?? 1;
  return n > 1 ? `${n} shapes per letter` : isMine(cfg) ? '1 shape per letter' : null;
}

export const PANGRAM = 'The quick brown fox jumps over the lazy dog';
const START_MAX = 40;

/** Each line of a block's text, without splitting the whole text at once. */
function* linesOf(text: string): Generator<string> {
  let at = 0;
  for (;;) {
    const nl = text.indexOf('\n', at);
    yield nl < 0 ? text.slice(at) : text.slice(at, nl);
    if (nl < 0) return;
    at = nl + 1;
  }
}

/** The first words of a line, cut at the last space within 40 characters (a hard cut when there is none). */
function firstWords(words: string): string {
  if (words.length <= START_MAX) return words;
  const sp = words.lastIndexOf(' ', START_MAX);
  return sp > 0 ? words.slice(0, sp) : Array.from(words).slice(0, START_MAX).join('');
}

/**
 * The words a hand is shown writing: the start of the document's first line of plain text (or of its
 * first line with any words, a heading say), reading the text blocks (not headers or margin notes) page by page, top to
 * bottom, then left to right. A document with nothing written gets the pangram.
 */
export function docStart(doc: EngineDoc): string {
  const blocks = doc.boxes.filter(b => b.kind === 'text')
    .sort((a: Box, b: Box) => a.page - b.page || a.y - b.y || a.x - b.x);
  let first = '';
  for (const b of blocks) {
    for (const line of linesOf(b.text)) {
      const words = plainText(line);
      if (!words) continue;
      if (parseLine(line).kind === 'text') return firstWords(words);
      first ||= words;
    }
  }
  return first ? firstWords(first) : PANGRAM;
}
