// A block's text (or a range of its lines) as rich text. Every change is written back to the block as markup
// through the store's update(), so there is one undo history; when the block changes from outside (undo, an
// action) the editor reloads from the markup, so positions and offsets never drift apart.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react';
import { EditorContent, Extension, useEditor as useTiptap, type Editor } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, Selection, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { SuggestionProps } from '@tiptap/suggestion';
import { cn } from '@/lib/utils';
import { consumeCaret, update, useEditor } from '@/store/editor';
import { activeEditor, setActiveEditor } from './active';
import { editorExtensions, type SlashItem } from './extensions';
import { fromMarkup, toMarkup } from './markup';
import { cleanPastedHTML } from './paste';
import { lineOf, lineStart, offsetAt, posAt } from './positions';
import { firstDiff, replaceLines, sliceLines, type LineRange } from './slices';
import { SlashMenu } from './SlashMenu';
import './editor.css';

/** Where a later page's part starts, shown as a line in the editor. `offset` is a markup offset in the block's text. */
export interface PageBreakMark { offset: number; page: number; idx: number; actions: boolean }

export interface BlockEditorProps {
  boxId: string;
  /** The markup lines this editor shows and writes; null for all of them. */
  range: LineRange | null;
  breaks?: PageBreakMark[];
  label: string;
  /** Take caret requests (placeCaret) for offsets in its lines. */
  acceptCaret?: boolean;
  onSplit?(idx: number): void;
  onRemovePart?(idx: number): void;
  onFocusChange?(focused: boolean, lines: number): void;
  onLineCount?(lines: number): void;
  onExternalChange?(): void;
  onReady?(e: Editor): void;
  className?: string;
}

// What an editor shows: lines first..end of `text` (all of them when `whole`), whose markup is `slice`.
interface Shown { editor: Editor; text: string; first: number; end: number; whole: boolean; slice: string }

const lineCount = (t: string) => t.split('\n').length;
const textOf = (boxId: string) => useEditor.getState().doc.boxes.find(b => b.id === boxId)?.text ?? null;

/* ---------- Page-break lines ---------- */

const breaksKey = new PluginKey<DecorationSet>('nibPageBreaks');

// Decorations live in the plugin's state: mapped through every transaction, replaced when the breaks change.
const PageBreakLines = Extension.create({
  name: 'nibPageBreakLines',
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: breaksKey,
      state: { init: () => DecorationSet.empty, apply: (tr, set) => tr.getMeta(breaksKey) ?? set.map(tr.mapping, tr.doc) },
      props: { decorations: s => breaksKey.getState(s) },
    })];
  },
});

function breakLine(b: PageBreakMark, inline: boolean, props: { current: BlockEditorProps }): () => HTMLElement {
  return () => {
    const el = document.createElement(inline ? 'span' : 'div'), label = document.createElement('span');
    el.className = inline ? 'nib-break nib-break-inline' : 'nib-break';
    el.setAttribute('contenteditable', 'false');
    label.className = 'nib-break-label';
    label.textContent = `Page ${b.page} starts here`;
    el.append(label);
    if (!inline) { const rule = document.createElement('span'); rule.className = 'nib-break-rule'; el.append(rule); }
    if (b.actions) {
      const acts = document.createElement('span');
      acts.className = 'nib-break-actions';
      const button = (text: string, fn: () => void) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        btn.addEventListener('click', fn);
        acts.append(btn);
      };
      button('Split here', () => props.current.onSplit?.(b.idx));
      button(`Remove page ${b.page} part`, () => props.current.onRemovePart?.(b.idx));
      el.append(acts);
    }
    return el;
  };
}

// A break at a line start is a line before the outermost node that starts there; mid-line it sits in the text.
function breakDecorations(doc: PMNode, sh: Shown, breaks: PageBreakMark[], props: { current: BlockEditorProps }): DecorationSet {
  const base = lineStart(sh.text, sh.first), decos: Decoration[] = [];
  for (const b of breaks) {
    const local = b.offset - base;
    if (local < 0 || local > sh.slice.length) continue;
    const inline = lineOf(sh.slice, local).col > 0;
    let pos = posAt(doc, sh.slice, local);
    if (!inline) {
      const $p = doc.resolve(pos);
      if ($p.parent.isTextblock) pos = $p.before();
      for (let $q = doc.resolve(pos); $q.depth > 0 && $q.index() === 0; $q = doc.resolve(pos)) pos = $q.before();
    }
    decos.push(Decoration.widget(pos, breakLine(b, inline, props), {
      side: -1, ignoreSelection: true, stopEvent: () => true, key: `${inline ? 'i' : 'b'}${b.idx}:${b.page}:${b.actions ? 1 : 0}`,
    }));
  }
  return DecorationSet.create(doc, decos);
}

/* ---------- The editor ---------- */

export function BlockEditor(props: BlockEditorProps): JSX.Element {
  const { boxId, range, breaks, label, acceptCaret = false, className } = props;
  const text = useEditor(s => s.doc.boxes.find(b => b.id === boxId)?.text ?? null);
  const caret = useEditor(s => s.caret);
  const [slash, setSlash] = useState<SuggestionProps<SlashItem, SlashItem> | null>(null);

  // The latest props and text, for callbacks that outlive a render.
  const live = useRef(props);
  live.current = props;
  const shown = useRef<Shown | null>(null);
  const pending = useRef(false); // an outside change arrived while composing
  const breaksSig = JSON.stringify(breaks ?? []);
  const painted = useRef<{ doc: PMNode; sig: string } | null>(null);

  const shownIn = (e: Editor) => (shown.current?.editor === e ? shown.current : null);

  const paintBreaks = (e: Editor) => {
    const sh = shownIn(e), sig = JSON.stringify(live.current.breaks ?? []);
    if (!sh || (painted.current?.doc === e.state.doc && painted.current.sig === sig)) return;
    e.view.dispatch(e.state.tr.setMeta(breaksKey, breakDecorations(e.state.doc, sh, live.current.breaks ?? [], live)));
    painted.current = { doc: e.state.doc, sig };
  };

  // Show the lines of `r` from `t`.
  const load = (e: Editor, t: string, r: LineRange | null) => {
    const slice = sliceLines(t, r);
    e.commands.setContent(fromMarkup(slice), { emitUpdate: false });
    shown.current = { editor: e, text: t, first: r?.first ?? 0, end: r ? r.end : lineCount(t), whole: r === null, slice };
    paintBreaks(e);
  };

  // Select between markup offsets of the block (a caret when equal), clamped into this editor's lines.
  const selectAt = (e: Editor, anchor: number, head = anchor, scroll = true) => {
    const sh = shownIn(e);
    if (!sh) return;
    const doc = e.state.doc, base = lineStart(sh.text, sh.first);
    const $at = (o: number) => doc.resolve(Math.min(posAt(doc, sh.slice, Math.max(0, Math.min(sh.slice.length, o - base))), doc.content.size));
    const sel = anchor === head ? Selection.near($at(head)) : TextSelection.between($at(anchor), $at(head));
    const tr = e.state.tr.setSelection(sel);
    e.view.dispatch(scroll ? tr.scrollIntoView() : tr);
  };

  // Each change is written into the block's lines, if the block still exists.
  const write = (e: Editor) => {
    const sh = shownIn(e), b = useEditor.getState().doc.boxes.find(x => x.id === boxId);
    if (!sh || !b) return;
    const md = toMarkup(e.getJSON()), n = lineCount(md);
    const next = sh.whole ? md : replaceLines(b.text, { first: sh.first, end: sh.end }, md);
    shown.current = { ...sh, text: next, end: sh.first + n, slice: md };
    if (next !== b.text) update(s => { const x = s.doc.boxes.find(y => y.id === boxId); if (x) x.text = next; }, { layout: 'soon', history: 'type:' + boxId });
    live.current.onLineCount?.(n);
  };

  // Reload when the block's text is not what this editor last wrote or loaded, or its range changed.
  const sync = (e: Editor) => {
    const t = textOf(boxId), r = live.current.range;
    if (t === null || e.isDestroyed) return;
    const sh = shownIn(e), first = r?.first ?? 0, end = r ? r.end : lineCount(t);
    if (sh && sh.text === t && sh.whole === (r === null) && sh.first === first && sh.end === end) return;
    if (e.view.composing) { pending.current = true; return; } // never under an IME composition
    // where the selection was, as markup offsets of the block
    const abs = (p: number) => (sh ? lineStart(sh.text, sh.first) + offsetAt(e.state.doc, sh.slice, p) : 0);
    const anchor = abs(e.state.selection.anchor), head = abs(e.state.selection.head), focused = !!sh && e.isFocused;
    load(e, t, r);
    if (focused) {
      live.current.onExternalChange?.();
      selectAt(e, sh.text !== t ? firstDiff(sh.text, t) : head);
    } else if (sh) selectAt(e, anchor, head, false); // so the toolbar still formats the same words
  };

  const extensions = useMemo(() => [...editorExtensions({ boxId, slash: setSlash }), PageBreakLines], [boxId]);
  const editorProps = useMemo(() => ({
    attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': label, class: 'nib-prose', spellcheck: 'true' },
    transformPastedHTML: cleanPastedHTML,
  }), [label]);

  const editor = useTiptap({
    extensions,
    editorProps,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    onUpdate: ({ editor: e }) => write(e),
    onFocus: ({ editor: e }) => {
      setActiveEditor(e, boxId);
      const sh = shownIn(e);
      live.current.onFocusChange?.(true, sh ? sh.end - sh.first : 0);
    },
    onBlur: ({ editor: e }) => {
      const sh = shownIn(e);
      live.current.onFocusChange?.(false, sh ? sh.end - sh.first : 0);
    },
  }, [boxId]);

  // Loading and outside changes (before the caret request below, which needs the content loaded).
  useLayoutEffect(() => { if (!editor.isDestroyed) sync(editor); });

  useLayoutEffect(() => { if (!editor.isDestroyed) paintBreaks(editor); }, [editor, breaksSig]);

  // A caret request for an offset in this editor's lines (the last part also takes the end of the text).
  useLayoutEffect(() => {
    if (!caret || caret.boxId !== boxId || !acceptCaret || editor.isDestroyed) return;
    const sh = shownIn(editor), t = textOf(boxId);
    if (!sh || t === null || sh.text !== t) return;
    const { li } = lineOf(t, caret.offset);
    if (!((sh.first <= li && li < sh.end) || (sh.end >= lineCount(t) && caret.offset >= t.length))) return;
    consumeCaret(caret.n);
    if (!editor.view.composing && !editor.state.doc.eq(editor.schema.nodeFromJSON(fromMarkup(sh.slice)))) load(editor, t, live.current.range);
    selectAt(editor, caret.offset);
    editor.view.focus();
  }, [editor, caret, acceptCaret, boxId, text, range?.first, range?.end]);

  useEffect(() => { if (editor.options.editorProps !== editorProps && !editor.isDestroyed) editor.setOptions({ editorProps }); }, [editor, editorProps]);

  // An outside change that waited for a composition to end.
  useEffect(() => {
    if (editor.isDestroyed) return;
    const dom = editor.view.dom;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onEnd = () => { clearTimeout(timer); timer = setTimeout(() => { if (pending.current && !editor.view.composing) { pending.current = false; sync(editor); } }, 30); };
    dom.addEventListener('compositionend', onEnd);
    return () => { clearTimeout(timer); dom.removeEventListener('compositionend', onEnd); };
  }, [editor]);

  useEffect(() => {
    live.current.onReady?.(editor);
    return () => { if (activeEditor() === editor) setActiveEditor(null, null); };
  }, [editor]);

  return (
    <div className={cn('nib-editor', className)}>
      <EditorContent editor={editor} />
      <SlashMenu state={slash} />
    </div>
  );
}
