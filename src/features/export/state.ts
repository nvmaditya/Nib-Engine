import { create } from 'zustand';
import { getPref, setPref } from '@/store/documents';
import { useEditor } from '@/store/editor';
import type { ExportPrefs, Format, PagePick, Quality } from './plan';

// How this person likes to download lives on the device, not in the document or its undo history.
export const DEFAULT_PREFS: ExportPrefs = { format: 'pdf', zip: true, quality: 'standard' };
export const useExportPrefs = create<ExportPrefs>(() => ({ ...DEFAULT_PREFS }));

const FORMATS: readonly Format[] = ['pdf', 'png', 'jpg'];
const QUALITIES: readonly Quality[] = ['standard', 'print'];

let changes = 0; // counts setExportPrefs calls, so a late read never overrides a choice

/** Read the saved choices, keeping each field only when it is valid. Never rejects. */
export async function loadExportPrefs(): Promise<void> {
  const seen = changes;
  let stored: unknown;
  try { stored = await getPref('export'); } catch { return; }
  if (changes !== seen || !stored || typeof stored !== 'object') return;
  const s = stored as Record<string, unknown>, patch: Partial<ExportPrefs> = {};
  if (FORMATS.includes(s.format as Format)) patch.format = s.format as Format;
  if (typeof s.zip === 'boolean') patch.zip = s.zip;
  if (QUALITIES.includes(s.quality as Quality)) patch.quality = s.quality as Quality;
  useExportPrefs.setState(patch);
}

export function setExportPrefs(patch: Partial<ExportPrefs>): void {
  const cur = useExportPrefs.getState();
  const next: ExportPrefs = { format: cur.format, zip: cur.zip, quality: cur.quality, ...patch };
  if (next.format === cur.format && next.zip === cur.zip && next.quality === cur.quality) return;
  changes++;
  useExportPrefs.setState(next);
  void Promise.resolve().then(() => setPref('export', next)).catch(() => { /* kept for now */ });
}

// Which pages are left out (so pages added later are included). UI state: not saved, no undo.
const FRESH_PICK: PagePick = { choose: false, out: [] };
export const useExportPick = create<PagePick>(() => ({ ...FRESH_PICK, out: [] }));
export const setChoose = (on: boolean): void => useExportPick.setState({ choose: on });
export const togglePage = (i: number): void =>
  useExportPick.setState(s => ({ out: s.out.includes(i) ? s.out.filter(p => p !== i) : [...s.out, i].sort((a, b) => a - b) }));

/** The document has `pages` pages now: pages left out past its end are forgotten, so they don't come back if it grows again. */
export const forgetPast = (pages: number): void =>
  useExportPick.setState(s => (s.out.some(i => i >= pages) ? { out: s.out.filter(i => i < pages) } : s));

useEditor.subscribe((s, prev) => {
  if (s.docId !== prev.docId) useExportPick.setState({ choose: false, out: [] });
});

export interface ExportRun { kind: 'download' | 'share' | null; done: number; total: number }
export const IDLE_RUN: ExportRun = { kind: null, done: 0, total: 0 };
export const useExportRun = create<ExportRun>(() => ({ ...IDLE_RUN }));
