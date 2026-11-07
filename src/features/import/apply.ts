// Writing an import out (Design decisions 1 and 3): into the open document as one undo step that also
// carries the look and the title, or as a new document, which is made only now.
import { clearMeasureCache, fontReady, loadFont } from '@/engine/core.js';
import { cleanSettings } from '@/engine/doc.js';
import { step } from '@/features/doc/actions';
import { importInto, newDocument, withLook, type ImportPlace } from '@/features/doc/build';
import { createAndOpen } from '@/features/home/actions';
import { handsOf } from '@/features/home/thumbs';
import { stateSnapshot, toast, undoToState, update, useEditor } from '@/store/editor';

/** The text to write out (markup), the file's name, and where and how it goes. */
export interface ImportRequest { text: string; name: string; place: ImportPlace }

export const WRITTEN = 'Written out. Each page’s part can be moved, resized, edited or split off on its own.';

/** What Add after the last page did: carried on a block, or made one of its own. */
export const addedMessage = (block: string, joined: boolean): string =>
  joined ? `Added after the last page, carrying on “${block}”.` : `Added after the last page as “${block}”.`;

/** The longest Write it out waits for a hand (as long as a thumbnail waits for its hands). */
export const HANDS_MS = 10_000;

/**
 * Add after the last page lays the open document out, in the look chosen, to find where its writing ends, and the
 * text goes in by that. A hand still on its way would be measured by stand-in widths, and the text could go on a
 * page the writing reaches once the hand is here. This waits for the hands it lays out with (the look's, or the
 * document's own, and each block's own), for at most `HANDS_MS`; one that can't be fetched isn't waited for. Null when
 * there is nothing to wait for: every hand is here, or nothing is placed by the layout (Replace).
 */
export function handsArriving(place: ImportPlace): Promise<void> | null {
  if (place.where !== 'append') return null;
  const s = useEditor.getState(), coming = handsOf(withLook(s.S, place.look), s.doc).filter(id => !fontReady(id));
  if (!coming.length) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>(r => { timer = setTimeout(r, HANDS_MS); });
  return Promise.race([Promise.all(coming.map(loadFont)).then(() => {}), timeout]).finally(() => clearTimeout(timer));
}

/** Write the import into the open document: one undo step, and a message whose Undo puts it all back. */
export function importIntoOpenDocument(r: ImportRequest): void {
  const snap = stateSnapshot(), s = useEditor.getState();
  const res = importInto(s.S, s.doc, r.text, r.place);
  update(st => {
    st.S = res.S;
    st.doc = res.doc;
    if (st.title === 'Untitled' && r.name) st.title = r.name;
    st.selectedId = res.target.id;
    st.scope = 'all';
    st.scrollToPage = res.firstPage;
    clearMeasureCache();
  }, { history: step('import') });
  toast(r.place.where === 'replace' ? WRITTEN : addedMessage(res.target.name, res.joined), undoToState(snap));
}

/** Make a new document of the import, with the new-document settings and the look chosen, and open it on Write. */
export async function importAsNewDocument(r: ImportRequest): Promise<boolean> {
  const S = withLook(cleanSettings(null, false), r.place.look);
  const ok = await createAndOpen({ title: r.name || 'Untitled', settings: S, doc: newDocument(S, r.text, r.place.header) });
  if (ok) toast(WRITTEN);
  return ok;
}
