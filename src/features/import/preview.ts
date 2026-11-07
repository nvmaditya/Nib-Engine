// The Import preview's content: the file's parts as markup, read by the converter, with a separator between
// each part and the next (a blank line, or a page break when "Start a new page where the file does" is on).
// The separators are tracked through every edit, so the switch still finds them after the text has changed.
import { Extension, type Editor, type JSONContent } from '@tiptap/core';
import { Plugin, PluginKey, Selection } from '@tiptap/pm/state';
import { fromMarkup } from '@/features/editor/markup';

/** Each part without its leading blank lines and trailing whitespace (the first line keeps its indent); empty ones go. */
export function cleanParts(parts: string[]): string[] {
  return parts.map(p => p.replace(/^\s*\n/, '').trimEnd()).filter(p => p !== '');
}

/** The markup an import writes: the cleaned parts, joined by a blank line or by a page break. */
export function importText(parts: string[], breaks: boolean): string {
  return cleanParts(parts).join(breaks ? '\n\\newpage\n' : '\n\n');
}

/**
 * The preview's content, which is `fromMarkup(importText(parts, breaks))`: each part's own content, with a
 * separator node between parts (an empty paragraph, or a page break). `seps` are the separators' top-level indices.
 */
export function previewContent(parts: string[], breaks: boolean): { doc: JSONContent; seps: number[] } {
  const content: JSONContent[] = [], seps: number[] = [];
  cleanParts(parts).forEach((p, i) => {
    if (i > 0) { seps.push(content.length); content.push({ type: breaks ? 'pageBreak' : 'paragraph' }); }
    content.push(...(fromMarkup(p).content ?? []));
  });
  return { doc: content.length ? { type: 'doc', content } : fromMarkup(''), seps }; // no text: one empty line
}

const fileBreaksKey = new PluginKey<number[]>('nibFileBreaks');

/**
 * Where the separators between the file's parts are (the position before each), set by a meta and mapped
 * through every change. Content put in exactly there goes before the separator (`assoc 1`), so a line added
 * at the end of a part stays on that part's page.
 */
export const FileBreaks = Extension.create({
  name: 'nibFileBreaks',
  addProseMirrorPlugins() {
    return [new Plugin<number[]>({
      key: fileBreaksKey,
      state: {
        init: () => [],
        apply: (tr, at) => tr.getMeta(fileBreaksKey) ?? (tr.docChanged ? at.map(p => tr.mapping.map(p, 1)) : at),
      },
    })];
  },
});

// The separators' positions in the editor (none without FileBreaks).
const fileBreaksOf = (editor: Editor): number[] => fileBreaksKey.getState(editor.state) ?? [];

/**
 * Load the file's parts into the preview, the caret at the top. The load is not a step of the preview's undo,
 * so its first Ctrl+Z can't empty it.
 */
export function loadPreview(editor: Editor, parts: string[], breaks: boolean): void {
  const { doc, seps } = previewContent(parts, breaks);
  editor.chain()
    .setMeta('addToHistory', false)
    .setContent(doc, { emitUpdate: false })
    .command(({ tr }) => {
      const offsets: number[] = [];
      tr.doc.forEach((_n, off) => { offsets.push(off); });
      tr.setMeta(fileBreaksKey, seps.map(k => offsets[k]));
      tr.setSelection(Selection.findFrom(tr.doc.resolve(0), 1, true) ?? Selection.atStart(tr.doc));
      return true;
    })
    .run();
}

/**
 * Turn "Start a new page where the file does" on or off, outside the preview's undo history. On: an empty
 * separator line becomes a page break, a page break stays, and before anything else (a line typed there, or
 * what followed a deleted separator) a page break is put in. Off: a page break at a separator becomes an empty
 * line again. A separator that ended up inside a line (lines joined across it), or with nothing before or after
 * it, makes no page break.
 */
export function setFileBreaks(editor: Editor, on: boolean): void {
  if (editor.isDestroyed) return;
  const at = fileBreaksOf(editor);
  if (!at.length) return;
  const { state } = editor, { pageBreak, paragraph } = state.schema.nodes, tr = state.tr;
  // from the last to the first, so each change leaves the positions before it where they were
  for (const p of [...new Set(at)].sort((a, b) => b - a)) {
    if (p < 0 || p > tr.doc.content.size) continue;
    const $p = tr.doc.resolve(p), node = $p.nodeAfter;
    if ($p.depth > 0 || !node) continue;
    if (!on) {
      if (node.type === pageBreak) tr.replaceWith(p, p + node.nodeSize, paragraph.create());
    } else if (node.type !== pageBreak && $p.nodeBefore) {
      if (node.type === paragraph && !node.textContent.trim()) tr.replaceWith(p, p + node.nodeSize, pageBreak.create());
      else tr.insert(p, pageBreak.create());
    }
  }
  if (!tr.docChanged) return;
  // each separator is now the page break (or line) at its position, not what follows a page break put in before it
  editor.view.dispatch(tr.setMeta('addToHistory', false).setMeta(fileBreaksKey, at.map(p => tr.mapping.map(p, -1))));
}
