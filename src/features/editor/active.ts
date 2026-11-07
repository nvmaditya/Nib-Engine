// The editor that last had focus, so one toolbar can format whichever block is being written in.
import type { Editor } from '@tiptap/core';
import { create } from 'zustand';

interface Active { editor: Editor | null; boxId: string | null }

const useActive = create<Active>(() => ({ editor: null, boxId: null }));

export function setActiveEditor(e: Editor | null, boxId: string | null): void {
  useActive.setState({ editor: e, boxId: e ? boxId : null });
}

/** The editor that last had focus (and its block), or none. */
export function useActiveEditor(): Active {
  return useActive();
}

/** The active editor right now (outside React). */
export const activeEditor = (): Editor | null => useActive.getState().editor;
