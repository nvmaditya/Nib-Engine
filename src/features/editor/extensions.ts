// What a block editor adds to the schema's extensions: the app's one undo history, page breaks, list indents,
// the `*underline*` shortcut, list markers, the `/` menu, a placeholder, and pasted content written the way
// the converter writes it.
import { Extension, markInputRule, type AnyExtension, type Editor, type Range } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, Selection, type Transaction } from '@tiptap/pm/state';
import { canSplit } from '@tiptap/pm/transform';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Placeholder } from '@tiptap/extensions';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
import { placeCaret, redo, undo, useEditor } from '@/store/editor';
import { fromMarkup, listMarkers, toMarkup } from './markup';
import { BLOCK_EXTENSIONS } from './schema';
import { firstDiff } from './slices';

const textOf = (boxId: string) => useEditor.getState().doc.boxes.find(b => b.id === boxId)?.text ?? null;

/** Undo or redo in the app's one history, then ask for the caret where the block's text changed. */
function historyStep(boxId: string, again: boolean): boolean {
  const before = textOf(boxId);
  (again ? redo : undo)();
  const after = textOf(boxId);
  if (before !== null && after !== null && before !== after) placeCaret(boxId, firstDiff(before, after));
  return true; // never the browser's own undo
}

/* ---------- Page breaks ---------- */

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};
// An ordered list's numbering, as toMarkup writes it.
function listAttrs(list: PMNode) {
  const kind = list.attrs.kind === 'a' ? 'a' as const : '1' as const;
  return { kind, delim: kind === 'a' || list.attrs.delim === ')' ? ')' as const : '.' as const, start: kind === 'a' ? clampInt(list.attrs.start, 1, 26, 1) : clampInt(list.attrs.start, 0, 999, 1) };
}
const indentsOf = (list: PMNode) => { const out: number[] = []; list.forEach(it => out.push(it.attrs.indent ?? 0)); return out; };
const markerNumber = (m: string) => (/^\d/.test(m) ? parseInt(m, 10) : m.charCodeAt(0) - 96);

// A numbered list split in two by a page break keeps counting on the far side.
function continueNumbering(tr: Transaction, at: number): void {
  const $at = tr.doc.resolve(at), a = $at.nodeBefore, b = $at.nodeAfter;
  if (a?.type.name !== 'orderedList' || b?.type.name !== 'orderedList') return;
  const la = listAttrs(a), lb = listAttrs(b);
  if (la.kind !== lb.kind || la.delim !== lb.delim) return;
  const marker = listMarkers(la, [...indentsOf(a), ...indentsOf(b)])[a.childCount];
  if (marker) tr.setNodeMarkup(at, undefined, { ...b.attrs, start: markerNumber(marker) });
}

/**
 * Put a page break at the selection. At the start of a line it goes before that line; otherwise the line is
 * split at the caret and the break goes between the halves (splitting a list or note around it).
 */
export function pageBreakInto(tr: Transaction): boolean {
  const type = tr.doc.type.schema.nodes.pageBreak;
  if (!type) return false;
  if (!tr.selection.empty && !(tr.selection instanceof NodeSelection)) tr.deleteSelection();
  const sel = tr.selection, $from = sel.$from;
  let at: number;
  if (sel instanceof NodeSelection || !$from.parent.isTextblock) {
    const $to = sel.$to;
    at = $to.depth === 0 ? $to.pos : $to.after(1);
  } else if ($from.parentOffset === 0) {
    // the outermost node this line starts
    let d = $from.depth;
    while (d > 1 && $from.index(d - 1) === 0) d--;
    at = $from.before(d);
    if (d > 1) {
      if (!canSplit(tr.doc, at, d - 1)) return false;
      tr.split(at, d - 1);
      at += d - 1;
    }
  } else if (canSplit(tr.doc, $from.pos, $from.depth)) {
    tr.split($from.pos, $from.depth);
    at = $from.pos + $from.depth;
  } else at = $from.after(1);
  continueNumbering(tr, at);
  tr.insert(at, type.create());
  if (sel instanceof NodeSelection || !$from.parent.isTextblock) tr.setSelection(Selection.near(tr.doc.resolve(at + 1)));
  tr.scrollIntoView();
  return true;
}

export const insertPageBreak = (e: Editor): boolean => e.chain().focus().command(({ tr }) => pageBreakInto(tr)).run();

/* ---------- Text styles (the toolbar's select and the / menu) ---------- */

export type TextStyle = 'paragraph' | 'h1' | 'h2' | 'blockquote';

export function textStyleOf(e: Editor): TextStyle {
  if (e.isActive('heading', { level: 1 })) return 'h1';
  if (e.isActive('heading')) return 'h2';
  return e.isActive('blockquote') ? 'blockquote' : 'paragraph';
}

/** Make the selected lines Normal, Title, Heading or Note (replacing `range` first, for the / menu). */
export function setTextStyle(e: Editor, style: TextStyle, range?: Range): boolean {
  let c = e.chain().focus();
  if (range) c = c.deleteRange(range);
  if (style === 'paragraph') c = c.clearNodes();
  else if (style === 'blockquote') c = e.isActive('blockquote') ? c : c.clearNodes().setBlockquote();
  else c = c.setHeading({ level: style === 'h1' ? 1 : 2 });
  return c.run();
}

/* ---------- The / menu ---------- */

export interface SlashItem { label: string; run(e: Editor, range: Range): void }

const list = (name: 'bulletList' | 'orderedList') => (e: Editor, r: Range) => {
  const c = e.chain().focus().deleteRange(r);
  if (e.isActive(name)) c.run();
  else (name === 'bulletList' ? c.toggleBulletList() : c.toggleOrderedList()).run();
};

export const SLASH_ITEMS: SlashItem[] = [
  { label: 'Normal text', run: (e, r) => setTextStyle(e, 'paragraph', r) },
  { label: 'Title', run: (e, r) => setTextStyle(e, 'h1', r) },
  { label: 'Heading', run: (e, r) => setTextStyle(e, 'h2', r) },
  { label: 'Note', run: (e, r) => setTextStyle(e, 'blockquote', r) },
  { label: 'Bulleted list', run: list('bulletList') },
  { label: 'Numbered list', run: list('orderedList') },
  { label: 'Page break', run: (e, r) => e.chain().focus().deleteRange(r).command(({ tr }) => pageBreakInto(tr)).run() },
];

// The open menu's key handler, per editor (the menu is React; the keys arrive in the editor).
const slashKeys = new WeakMap<Editor, (e: KeyboardEvent) => boolean>();
export function onSlashKey(editor: Editor, fn: (e: KeyboardEvent) => boolean): () => void {
  slashKeys.set(editor, fn);
  return () => { if (slashKeys.get(editor) === fn) slashKeys.delete(editor); };
}

const Slash = Extension.create<{ slash(state: SuggestionProps | null): void }>({
  name: 'nibSlash',
  addOptions: () => ({ slash: () => {} }),
  addProseMirrorPlugins() {
    const editor = this.editor, slash = this.options.slash;
    return [Suggestion<SlashItem, SlashItem>({
      editor,
      char: '/',
      pluginKey: new PluginKey('nibSlash'),
      initialItems: SLASH_ITEMS,
      items: ({ query }) => SLASH_ITEMS.filter(it => it.label.toLowerCase().includes(query.toLowerCase())),
      command: ({ editor: e, range, props }) => props.run(e, range),
      render: () => ({
        onStart: p => slash(p),
        onUpdate: p => slash(p),
        onExit: () => slash(null),
        onKeyDown: ({ event }) => slashKeys.get(editor)?.(event) ?? false,
      }),
    })];
  },
});

/* ---------- Keys ---------- */

// Tab and Shift-Tab on list items: one indent step, within 0–3.
function indentBy(e: Editor, d: number): boolean {
  const { state } = e, { from, to } = state.selection, type = state.schema.nodes.listItem, items: [number, PMNode][] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type !== type) return true;
    items.push([pos, node]);
    return false;
  });
  if (!items.length) return false;
  const tr = state.tr;
  for (const [pos, node] of items) {
    const n = Math.max(0, Math.min(3, (node.attrs.indent ?? 0) + d));
    if (n !== node.attrs.indent) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: n });
  }
  if (tr.docChanged) e.view.dispatch(tr);
  return true;
}

// One history: undo and redo inside the editor go to the store, never to TipTap.
const AppHistory = Extension.create<{ boxId: string }>({
  name: 'nibAppHistory',
  priority: 1000,
  addOptions: () => ({ boxId: '' }),
  addKeyboardShortcuts() {
    const id = this.options.boxId, back = () => historyStep(id, false), again = () => historyStep(id, true);
    return { 'Mod-z': back, 'Mod-Shift-z': again, 'Mod-Shift-Z': again, 'Mod-y': again };
  },
  addProseMirrorPlugins() {
    const id = this.options.boxId;
    return [new Plugin({
      props: {
        handleDOMEvents: {
          beforeinput: (_view, ev) => {
            const t = (ev as InputEvent).inputType;
            if (t !== 'historyUndo' && t !== 'historyRedo') return false;
            ev.preventDefault();
            return historyStep(id, t === 'historyRedo');
          },
        },
      },
    })];
  },
});

const BlockKeys = Extension.create({
  name: 'nibBlockKeys',
  priority: 1000,
  addKeyboardShortcuts() {
    const e = this.editor;
    return {
      'Mod-Enter': () => e.commands.command(({ tr }) => pageBreakInto(tr)),
      // markup has no line break inside a line, so Shift-Enter starts a new one, as Enter does
      'Shift-Enter': () => e.commands.first(({ commands }) => [
        () => commands.splitListItem('listItem'), () => commands.createParagraphNear(), () => commands.liftEmptyBlock(), () => commands.splitBlock(),
      ]),
      Tab: () => indentBy(e, 1),
      'Shift-Tab': () => indentBy(e, -1),
    };
  },
});

/* ---------- Typing and display ---------- */

// `*text*` underlines (italic is not in the schema, so a single star is underline, as in markup).
const UnderlineStar = Extension.create({
  name: 'nibUnderlineStar',
  addInputRules() {
    const type = this.editor.schema.marks.underline;
    return type ? [markInputRule({ find: /(?:^|\s)(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))$/, type })] : [];
  },
});

// Each numbered item carries its marker (`3.`, `b)`) as data-marker, counted as markup counts it.
function markerDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'orderedList') return !node.isTextblock;
    const marks = listMarkers(listAttrs(node), indentsOf(node));
    node.forEach((item, off, i) => { const p = pos + 1 + off; decos.push(Decoration.node(p, p + item.nodeSize, { 'data-marker': marks[i] })); });
    return false;
  });
  return DecorationSet.create(doc, decos);
}
const markersKey = new PluginKey<DecorationSet>('nibListMarkers');
const ListMarkers = Extension.create({
  name: 'nibListMarkers',
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: markersKey,
      state: { init: (_, s) => markerDecorations(s.doc), apply: (tr, set) => (tr.docChanged ? markerDecorations(tr.doc) : set) },
      props: { decorations: s => markersKey.getState(s) },
    })];
  },
});

// Pasted or dropped content is rewritten as the converter reads its own markup back (tabs as spaces, no
// space after a list marker, no whitespace-only lines), so every leaf matches its markup line exactly and
// markup offsets map to positions without drift.
const ConverterSync = Extension.create({
  name: 'nibConverterSync',
  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction: (trs, _old, state) => {
        if (!trs.some(tr => tr.docChanged && (tr.getMeta('paste') || ['paste', 'drop'].includes(tr.getMeta('uiEvent'))))) return null;
        const md = toMarkup(state.doc.toJSON()), doc = state.schema.nodeFromJSON(fromMarkup(md));
        const start = state.doc.content.findDiffStart(doc.content);
        if (start == null) return null;
        // replace only what differs, so decorations elsewhere (page-break lines) keep their places
        let { a: endA, b: endB } = state.doc.content.findDiffEnd(doc.content)!;
        const overlap = start - Math.min(endA, endB);
        if (overlap > 0) { endA += overlap; endB += overlap; }
        const tr = state.tr.replace(start, endA, doc.slice(start, endB));
        // the selection maps through that replacement (a paste leaves the caret at or after its end); columns
        // read from the old doc would not match the new markup (a tab is one character there, four here)
        return tr.setSelection(state.selection.map(tr.doc, tr.mapping));
      },
    })];
  },
});

/** The extensions of the editor for one block: the schema's, and everything above. */
export function editorExtensions(opts: { boxId: string; slash(state: SuggestionProps | null): void }): AnyExtension[] {
  return [
    ...BLOCK_EXTENSIONS,
    AppHistory.configure({ boxId: opts.boxId }),
    BlockKeys,
    UnderlineStar,
    ListMarkers,
    Slash.configure({ slash: opts.slash }),
    Placeholder.configure({ placeholder: 'Write here…' }),
    ConverterSync,
  ];
}
