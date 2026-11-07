// What the Import dialog's options hold, and where they start.
import type { EngineDoc, HeaderFields } from '@/engine/types';
import { STYLE_LOOKS } from '@/features/style/looks';
import { useStylePrefs, type SavedLook } from '@/features/style/prefs';

export type ImportTarget = 'new' | 'open';

export interface ImportOptionsValue { where: 'replace' | 'append'; breaks: boolean; look: string | null; header: HeaderFields | null }

/** A new document starts on Exam answer; an open one keeps its look and its header (if it has one). */
export function initialOptions(target: ImportTarget, doc: EngineDoc | null, _now: Date = new Date()): ImportOptionsValue {
  if (target === 'new') return { where: 'replace', breaks: false, look: 'exam', header: null };
  const fields = doc?.boxes.find(b => b.kind === 'header')?.fields;
  return { where: 'replace', breaks: false, look: null, header: fields ? { ...fields } : null };
}

/** The built-in look, or the saved one, with this id; null for no id or one that is gone. */
export function lookById(id: string | null): SavedLook | null {
  if (id === null) return null;
  return [...STYLE_LOOKS, ...useStylePrefs.getState().looks].find(l => l.id === id) ?? null;
}
