// Builders shared by tests. Metrics under the canvas stub (8 px per character): geom() is
// { gap: 34, top: 110, left: 112, right: 742, maxBase: 1077 }.
import { toast as sonner } from 'sonner';
import { vi } from 'vitest';
import { cleanSettings } from '@/engine/doc.js';
import { computeLayout, use } from '@/engine/core.js';
import type { Box, EngineDoc, Layout, Settings } from '@/engine/types';
import type { DocRecord } from '@/store/documents';
import { openDocument, useEditor } from '@/store/editor';

export const get = useEditor.getState;

export const box = (p: Partial<Box> = {}): Box =>
  ({ id: 'b1', page: 0, x: 112, y: 110, w: 630, text: '', style: {}, shuffle: 0, frames: {}, ...p });

export const docOf = (...b: Box[]): EngineDoc => ({ pageCount: 1, boxes: b, fileName: '' });

export const rec = (title: string, body: string | EngineDoc): DocRecord => ({
  id: 'd' + title, title, createdAt: 1, updatedAt: 1, settings: cleanSettings(null, false),
  doc: typeof body === 'string' ? docOf(box({ text: body })) : body,
});

export const lines = (n: number, word = 'line'): string =>
  Array.from({ length: n }, (_, i) => word + (i + 1)).join('\n');

export const words = (n: number): string => Array.from({ length: n }, () => 'word').join(' ');

export function layoutOf(doc: EngineDoc, S: Settings = cleanSettings(null, false)): Layout {
  use(S, doc);
  return computeLayout();
}

export const open = (doc: EngineDoc): void => openDocument(rec('A', doc));

/** The last message given to the mocked `sonner` (the test file mocks it). */
export const lastToast = (): string | undefined => {
  const calls = vi.mocked(sonner).mock.calls;
  return calls.length ? (calls[calls.length - 1][0] as string) : undefined;
};
