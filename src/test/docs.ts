// Builders shared by tests. Metrics under the canvas stub (8 px per character): geom() is
// { gap: 34, top: 110, left: 112, right: 742, maxBase: 1077 }.
import { toast as sonner } from 'sonner';
import { vi } from 'vitest';
import { cleanFields, cleanSettings } from '@/engine/doc.js';
import { computeLayout, use } from '@/engine/core.js';
import type { Box, EngineDoc, HeaderField, HeaderKey, Layout, Settings } from '@/engine/types';
import { HEADER_DEFAULT, flushHeaderDefault, useHeaderDefault } from '@/features/doc/headerDefault';
import { getDb } from '@/store/db';
import * as documents from '@/store/documents';
import type { DocRecord } from '@/store/documents';
import { closeDocument, openDocument, useEditor } from '@/store/editor';

export const get = useEditor.getState;

export const box = (p: Partial<Box> = {}): Box =>
  ({ id: 'b1', page: 0, x: 112, y: 110, w: 630, text: '', style: {}, shuffle: 0, frames: {}, kind: 'text', name: 'Text block', color: 0, ...p });

export const docOf = (...b: Box[]): EngineDoc => ({ pageCount: 1, boxes: b, fileName: '' });

/** A schema-3 header's fields as they convert: a list in the old order, ids the keys, and Date marked as today. */
export const fieldsOf = (o: Partial<Record<HeaderKey, string>>): HeaderField[] => cleanFields(o);

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

/**
 * Open `doc` as document `dA`. Every test opens that same id, so whatever is open is left first (as
 * Home does): what is kept for the open document only, Style's panel say, starts afresh each time.
 *
 * It is put in storage too, as it was opened, so its saves go through: one that found it missing would close
 * it as deleted in another tab, as soon as a test ran past the 400 ms a save waits. Storage writes in the order
 * writes start, so the save of the document left above comes first, and any save from here on after this one.
 * Nothing is stored where saves don't really write (the test file mocks putDoc), nor under fake timers, which
 * fake-indexeddb's own timers would wait on.
 */
export function open(doc: EngineDoc): void {
  void closeDocument();
  const r = rec('A', doc);
  if (savesWrite() && !vi.isFakeTimers()) void store(r);
  openDocument(r);
}

/** Saves really write here: the test file doesn't mock putDoc. (A mock of the module without it saves nowhere either.) */
function savesWrite(): boolean {
  try { return !vi.isMockFunction(documents.putDoc); } catch { return false; }
}

/** `r` put in storage as a document no session has saved yet. (Storage blocked on purpose stays blocked: its saves fail, as there.) */
async function store(r: DocRecord): Promise<void> {
  const copy = { ...structuredClone(r), schema: documents.DOC_SCHEMA };
  try { await (await getDb()).put('documents', copy); } catch { /* as above */ }
}

/**
 * Let the hands' font files "arrive", so the open document's pages get laid out. The bytes are not a
 * font, so the engine measures with the canvas stub, as `layoutOf` does.
 */
export const fontsLoad = (): void => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
};

/** The last message given to the mocked `sonner` (the test file mocks it). */
export const lastToast = (): string | undefined => {
  const calls = vi.mocked(sonner).mock.calls;
  return calls.length ? (calls[calls.length - 1][0] as string) : undefined;
};

/** The action (its Undo, say) on the last message given to the mocked `sonner`: pressing it, as `onClick`. */
export const lastToastAction = (): (() => void) | undefined => {
  const calls = vi.mocked(sonner).mock.calls;
  const a = calls.length ? calls[calls.length - 1][1]?.action : undefined;
  return a && typeof a === 'object' && 'onClick' in a ? (a.onClick as () => void) : undefined;
};

/**
 * Forget the header a test changed, in this tab and in storage (a test file whose storage is real), so the next
 * test's new headers start from Name, Class and Date again.
 */
export async function forgetHeader(): Promise<void> {
  await flushHeaderDefault();
  await documents.setPref(HEADER_DEFAULT, null);
  useHeaderDefault.setState({ fields: null });
}
