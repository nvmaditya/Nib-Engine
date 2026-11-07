import type { Settings } from '@/engine/types';
import { STYLE_LOOKS, matchLook } from '@/features/style/looks';
import type { SavedLook } from '@/features/style/prefs';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function relativeTime(t: number, now = Date.now()): string {
  const diff = Math.round((dayStart(now) - dayStart(t)) / 86400000);
  if (diff <= 0) return 'Edited today';
  if (diff === 1) return 'Edited yesterday';
  const d = new Date(t);
  return `Edited ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** The name of the look a document is in (paper aside), or null when none matches. */
export const lookNameOf = (S: Settings, saved: readonly SavedLook[]): string | null =>
  matchLook(S, S, [...STYLE_LOOKS, ...saved], true)?.name ?? null;

/** `{pages} · {look} · {edited}`; pages is null until page 1 has been laid out, look when none matches. */
export function recentMeta(pages: number | null, look: string | null, updatedAt: number, now = Date.now()): string {
  return [pages === null ? null : pages === 1 ? '1 page' : `${pages} pages`, look, relativeTime(updatedAt, now)].filter(Boolean).join(' · ');
}
