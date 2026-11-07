// The imported text as rich text, to check and change before it's written out: the M2 editor's schema and
// converter in an editor of its own, with its own undo (never the document's) and its own formatting tools.
// It changes layout at 860 px by CSS alone, so crossing it never remounts the editor or loses an edit.
import { useImperativeHandle, useLayoutEffect, useMemo, useRef, type JSX, type Ref } from 'react';
import { EditorContent, useEditor as useTiptap, type Editor } from '@tiptap/react';
import { previewExtensions } from '@/features/editor/extensions';
import { FormatToolbar } from '@/features/editor/FormatToolbar';
import { toMarkup } from '@/features/editor/markup';
import { cleanPastedHTML } from '@/features/editor/paste';
import '@/features/editor/editor.css';
import { FileBreaks, loadPreview, setFileBreaks } from './preview';

export interface PreviewHandle {
  /** The preview's text as markup, which is what is written out. */
  markup(): string;
  editor: Editor;
}

export function ImportPreview({ parts, breaks, ref }: { parts: string[]; breaks: boolean; ref?: Ref<PreviewHandle> }): JSX.Element {
  const extensions = useMemo(() => [...previewExtensions('Nothing to write out yet.'), FileBreaks], []);
  const editorProps = useMemo(() => ({
    attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Imported text', class: 'nib-prose', spellcheck: 'true' },
    transformPastedHTML: cleanPastedHTML,
  }), []);
  // never focused by itself, so a phone's keyboard doesn't come up over the text at once
  const editor = useTiptap({ extensions, editorProps, immediatelyRender: true, shouldRerenderOnTransaction: false });

  useImperativeHandle(ref, () => ({ markup: () => toMarkup(editor.getJSON()), editor }), [editor]);

  // A new file (a new `parts`) is loaded with the switch as it is then; the switch on its own moves the
  // separators of the text as edited.
  const loaded = useRef<{ editor: Editor; parts: string[]; breaks: boolean } | null>(null);
  useLayoutEffect(() => {
    if (editor.isDestroyed) return;
    const was = loaded.current;
    if (was?.editor === editor && was.parts === parts) {
      if (was.breaks !== breaks) setFileBreaks(editor, breaks);
    } else loadPreview(editor, parts, breaks);
    loaded.current = { editor, parts, breaks };
  }, [editor, parts, breaks]);

  // Phones: the dialog scrolls as one column, and the toolbar stays at its top while the text goes by (the
  // preview never shrinks below its text there, or the toolbar would have nowhere to stay). Wide screens:
  // the text scrolls on its own below the toolbar.
  return (
    <div className="flex flex-1 flex-col wide:min-h-0">
      <p className="px-4 pt-3 pb-1 text-sm font-medium">Check the text and change anything before it’s written out</p>
      <FormatToolbar editor={editor} className="sticky top-0 z-10 flex-nowrap overflow-x-auto bg-surface" />
      <div className="nib-editor min-h-[45dvh] flex-1 px-4 py-3 wide:min-h-0 wide:overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
