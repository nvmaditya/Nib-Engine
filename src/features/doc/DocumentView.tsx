// The open document: fetches its fonts, lays out its pages, and shows the stage the route asks for.
// The pages stay mounted while the stage changes, so switching keeps their place and doesn't redraw them.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Stage } from '@/app/route';
import { FONTS } from '@/engine/config.js';
import { clearMeasureCache, computeLayout, fontReady, fontsInUse, fontStr, loadFont, onAssetReady, use } from '@/engine/core.js';
import { update, useEditor } from '@/store/editor';
import { cn } from '@/lib/utils';
import { PageView, type PageLayout } from '@/features/pages/PageView';
import { WriteStage } from '@/features/write/WriteStage';
import { StyleStage } from '@/features/style/StyleStage';
import { ExportStage } from '@/features/export/ExportStage';
import { ImportDialog } from '@/features/import/ImportDialog';
import { openImport, select } from './actions';

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

  // Escape leaves the selected block (unless the editor or a dialog has the key).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useEditor.getState(), el = document.activeElement;
      if (e.key !== 'Escape' || !s.selectedId || s.importOpen) return;
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      select(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const write = stage === 'write' || stage === 'outline';
  return (
    <>
      {/* Wide screens: the panel and the pages scroll on their own. Phones: one column that scrolls as a whole.
          Each stage places its panel with `order`: Write's before the pages, Style's and Export's after. */}
      <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto wide:grid wide:grid-rows-[minmax(0,1fr)] wide:overflow-hidden',
        write ? 'wide:grid-cols-[400px_minmax(0,1fr)]' : 'wide:grid-cols-[minmax(0,1fr)_380px]')}>
        {write ? <WriteStage key="write" /> : stage === 'style' ? <StyleStage key="style" /> : <ExportStage key="export" pages={layout ? layout.pages : 1} />}
        <PageView key="pages" layout={layout} readOnly={stage === 'export'} className="order-1 flex-none wide:min-h-0 wide:overflow-y-auto" />
      </div>
      <ImportDialog open={importOpen} file={importFile} pages={layout ? layout.pages : 1} />
      {veil && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-[3px] border-dashed border-primary bg-primary/10 text-lg font-semibold text-fg">
          Drop to import this document
        </div>
      )}
    </>
  );
}
