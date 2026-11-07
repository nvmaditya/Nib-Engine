// The open document: fetches its fonts, lays out its pages, and shows the stage the route asks for.
// Every stage visited stays mounted (hidden and inert while another is shown), so switching keeps
// its editors, searches and scroll places; each lays out its own pages beside its panel.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Stage } from '@/app/route';
import { FONTS } from '@/engine/config.js';
import { clearMeasureCache, computeLayout, fontReady, fontsInUse, fontStr, loadFont, onAssetReady, use } from '@/engine/core.js';
import { setWriteView, update, useEditor } from '@/store/editor';
import type { PageLayout } from '@/features/pages/PageView';
import { PagesView } from '@/features/write/PagesView';
import { OutlineView } from '@/features/write/OutlineView';
import { StyleStage } from '@/features/style/StyleStage';
import { ExportStage } from '@/features/export/ExportStage';
import { ImportDialog } from '@/features/import/ImportDialog';
import { closeImport, openImport, select } from './actions';
import { StageHost } from './StageHost';

/** Fetch the font files the document needs, and lay the pages out again once they arrive. */
function usePageLayout(): PageLayout | null {
  const S = useEditor(s => s.S);
  const doc = useEditor(s => s.doc);
  const layoutTick = useEditor(s => s.layoutTick);
  const fontTick = useEditor(s => s.fontTick);
  useEditor(s => s.version);

  use(S, doc);
  const missing = fontsInUse().filter(id => !fontReady(id));
  const missingKey = missing.join(',');
  useEffect(() => {
    if (!missing.length) return;
    void Promise.all(missing.map(loadFont)).then(() => update(s => { s.fontTick++; clearMeasureCache(); }, { save: false }));
    for (const id of missing) {
      const cfg = FONTS.find(f => f.id === id);
      if (cfg) document.fonts?.load(fontStr(cfg, 40)).catch(() => {});
    }
  }, [missingKey]); // refetch only when the set of missing fonts changes
  useEffect(() => {
    onAssetReady(() => update(null, { save: false, layout: false }));
    return () => onAssetReady(() => {});
  }, []);

  const last = useRef<PageLayout | null>(null);
  const ready = !missing.length;
  return useMemo(() => {
    if (!ready) return last.current;
    const s = useEditor.getState();
    use(s.S, s.doc);
    return (last.current = { ...computeLayout(), tick: layoutTick + ':' + fontTick });
  }, [layoutTick, fontTick, ready]);
}

/**
 * Whether something other than the page has Escape: an editor or a field with the focus, or an open
 * dialog or menu (not one left in a hidden stage, nor a sheet that stays open beside the page, such as
 * Style's on phones, which says aria-modal="false").
 */
function escapeTaken(): boolean {
  const el = document.activeElement;
  if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.closest('[contenteditable="true"]'))) return true;
  const open = document.querySelectorAll('[role="dialog"]:not([aria-modal="false"]), [role="alertdialog"], [role="menu"], [role="listbox"]');
  return [...open].some(m => !m.closest('[data-stage][hidden]'));
}

/** A file dropped anywhere on the document opens the import dialog with it. */
function useDropToImport(): boolean {
  const [veil, setVeil] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFile = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const dialogOpen = () => useEditor.getState().importOpen;
    const enter = (e: DragEvent) => { if (!hasFile(e) || dialogOpen()) return; depth++; setVeil(true); };
    const leave = (e: DragEvent) => { if (!hasFile(e) || dialogOpen()) return; if (--depth <= 0) { depth = 0; setVeil(false); } };
    const over = (e: DragEvent) => { if (hasFile(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault(); depth = 0; setVeil(false);
      const f = e.dataTransfer?.files[0];
      if (f) openImport(f);
    };
    window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over); window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over); window.removeEventListener('drop', drop);
    };
  }, []);
  return veil;
}

export function DocumentView({ stage }: { stage: Stage }) {
  const layout = usePageLayout();
  const veil = useDropToImport();
  const importOpen = useEditor(s => s.importOpen);
  const importFile = useEditor(s => s.importFile);

  useEffect(() => { if (stage === 'write' || stage === 'outline') setWriteView(stage); }, [stage]);

  // Escape leaves the selected block, unless an editor, a field, a dialog or a menu has the key. Who has
  // it is settled as the key goes down (on the window, before a Radix dialog closes itself in its own
  // listener on the document), and the block is left only if the key then comes back up to the
  // document (a drag that cancels on Escape stops it on the way).
  useEffect(() => {
    const taken = new WeakSet<Event>();
    const claim = (e: KeyboardEvent) => { if (e.key === 'Escape' && escapeTaken()) taken.add(e); };
    const onKey = (e: KeyboardEvent) => {
      const s = useEditor.getState();
      if (e.key !== 'Escape' || !s.selectedId || s.importOpen || taken.has(e)) return;
      select(null);
    };
    window.addEventListener('keydown', claim, true);
    document.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', claim, true); document.removeEventListener('keydown', onKey); };
  }, []);

  return (
    <>
      {/* Wide screens: each stage's panel and pages scroll on their own. Phones: one column that scrolls as a whole. */}
      <StageHost stage={stage} render={s => (
        s === 'write' ? <PagesView layout={layout} />
          : s === 'outline' ? <OutlineView layout={layout} />
            : s === 'style' ? <StyleStage layout={layout} />
              : <ExportStage layout={layout} />
      )} />
      <ImportDialog open={importOpen} file={importFile} target="open" onClose={closeImport} />
      {veil && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-[3px] border-dashed border-primary bg-primary/10 text-lg font-semibold text-fg">
          Drop to import this document
        </div>
      )}
    </>
  );
}
