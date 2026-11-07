// What a person is doing in Style's panel that its components would lose when they remount. Crossing
// 860 px swaps the aside beside the pages for a sheet over them, a different tree, so the panel mounts
// again; this keeps the handwriting picker (open, its search and filter), Save as a look (asking, the
// name typed so far) and the page count notice's base (Export keeps its choices in stores the same way).
// It starts afresh whenever the open document changes.
import { create } from 'zustand';
import { useEditor } from '@/store/editor';
import type { HandFilter } from './hands';

export interface StylePanelState {
  picker: { open: boolean; q: string; filter: HandFilter };
  saveLook: { asking: boolean; name: string };
  /** The page count notice's base, and the stage and document it was taken for; null until it is first shown. */
  notice: { base: number | null; active: boolean; docId: string | null } | null;
}

const fresh = (): StylePanelState => ({
  picker: { open: false, q: '', filter: 'all' },
  saveLook: { asking: false, name: 'My look' },
  notice: null,
});

export const useStylePanel = create<StylePanelState>()(fresh);

export function resetStylePanel(): void {
  useStylePanel.setState(fresh());
}

useEditor.subscribe((s, was) => { if (s.docId !== was.docId) resetStylePanel(); });

/**
 * For a dialog of the panel's that was already open when it mounted (the panel mounted again): focus
 * `field` with the caret after its text, instead of the dialog's usual start with all of it selected,
 * so the next key carries on typing rather than replacing what was kept.
 */
export function carryOn(e: Event, field: HTMLInputElement | null): void {
  if (!field) return;
  e.preventDefault();
  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);
}
