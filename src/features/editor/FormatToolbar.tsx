// The formatting tools for whichever block editor last had focus.
import { useCallback, useSyncExternalStore, type ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import { Bold, Highlighter, List, ListOrdered, SeparatorHorizontal, Strikethrough, Underline } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveEditor } from './active';
import { insertPageBreak, setTextStyle, textStyleOf, type TextStyle } from './extensions';

interface Tool { label: string; title: string; icon: ReactNode; on?: string; run(e: Editor): void }

const TOOLS: (Tool | 'sep')[] = [
  { label: 'Bold', title: 'Bold (Ctrl+B)', icon: <Bold />, on: 'bold', run: e => e.chain().focus().toggleBold().run() },
  { label: 'Underline', title: 'Underline (Ctrl+U)', icon: <Underline />, on: 'underline', run: e => e.chain().focus().toggleUnderline().run() },
  { label: 'Cross out', title: 'Cross out', icon: <Strikethrough />, on: 'strike', run: e => e.chain().focus().toggleStrike().run() },
  { label: 'Highlight', title: 'Highlight', icon: <Highlighter />, on: 'highlight', run: e => e.chain().focus().toggleHighlight().run() },
  'sep',
  { label: 'Bulleted list', title: 'Bulleted list', icon: <List />, on: 'bulletList', run: e => e.chain().focus().toggleBulletList().run() },
  { label: 'Numbered list', title: 'Numbered list', icon: <ListOrdered />, on: 'orderedList', run: e => e.chain().focus().toggleOrderedList().run() },
  'sep',
  { label: 'Page break', title: 'Page break (Ctrl+Enter)', icon: <SeparatorHorizontal />, run: insertPageBreak },
];
const ON = TOOLS.flatMap(t => (t !== 'sep' && t.on ? [t.on] : []));

const STYLES: [TextStyle, string][] = [['paragraph', 'Normal'], ['h1', 'Title'], ['h2', 'Heading'], ['blockquote', 'Note']];

// The selection's text style and active marks, as one string so the toolbar redraws only when they change.
const snapshot = (e: Editor | null) => (e && !e.isDestroyed ? [textStyleOf(e), ...ON.filter(k => e.isActive(k))].join(' ') : '');

const ring = 'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';

export function FormatToolbar({ className }: { className?: string }) {
  const { editor } = useActiveEditor();
  const subscribe = useCallback((fn: () => void) => {
    if (!editor) return () => {};
    editor.on('transaction', fn);
    return () => { editor.off('transaction', fn); };
  }, [editor]);
  const snap = useSyncExternalStore(subscribe, () => snapshot(editor));
  const [style = 'paragraph', ...on] = snap ? snap.split(' ') : [];
  const off = !editor || editor.isDestroyed;

  return (
    <div role="toolbar" aria-label="Formatting" className={cn('flex flex-wrap items-center gap-0.5', className)}>
      <select aria-label="Text style" disabled={off} value={style}
        onChange={e => { if (editor) setTextStyle(editor, e.target.value as TextStyle); }}
        className={cn('h-8 rounded-md bg-transparent pr-1 pl-2 text-sm font-medium text-fg hover:bg-surface-2 disabled:opacity-40', ring)}>
        {STYLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {TOOLS.map((t, i) => t === 'sep'
        ? <span key={i} aria-hidden className="mx-1 h-5 w-px bg-line" />
        : (
          <button key={t.label} type="button" aria-label={t.label} title={t.title} disabled={off}
            aria-pressed={t.on ? on.includes(t.on) : undefined}
            onMouseDown={e => e.preventDefault()} // keep the caret in the editor
            onClick={() => { if (editor) t.run(editor); }}
            className={cn('inline-flex size-8 items-center justify-center rounded-md text-fg hover:bg-surface-2 aria-pressed:bg-primary-soft aria-pressed:text-primary disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4', ring)}>
            {t.icon}
          </button>
        ))}
    </div>
  );
}
