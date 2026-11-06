import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, update, selectedBox } from '../store.js';
import { use, computeLayout, fontsInUse, fontReady, loadFont, onAssetReady, clearMeasureCache, fontStr } from '../engine/core.js';
import { FONTS } from '../engine/config.js';
import { setTab, select, mobile } from '../actions.js';
import Header from '../components/Header.jsx';
import WritePanel from '../components/WritePanel.jsx';
import StylePanel from '../components/StylePanel.jsx';
import Pages from '../components/Pages.jsx';
import ImportDialog from '../components/ImportDialog.jsx';

export default function LegacyDocument() {
  const st = useStore();

  // Fetch the font files the document needs; lay out again once they arrive.
  use(st.S, st.doc);
  const missing = fontsInUse().filter(id => !fontReady(id));
  useEffect(() => {
    if (!missing.length) return;
    Promise.all(missing.map(loadFont)).then(() => update(s => { s.fontTick++; clearMeasureCache(); }, { save:false }));
    for (const id of missing) { const cfg = FONTS.find(f => f.id === id); if (cfg) document.fonts.load(fontStr(cfg, 40)).catch(() => {}); }
  }, [missing.join(',')]);
  useEffect(() => { onAssetReady(() => update(null, { save:false, layout:false })); }, []);

  const last = useRef(null);
  const ready = !missing.length;
  const layout = useMemo(() => {
    if (!ready) return last.current;
    use(st.S, st.doc);
    return (last.current = { ...computeLayout(), tick:st.layoutTick + ':' + st.fontTick });
  }, [st.layoutTick, st.fontTick, ready]);

  // Phones show one panel at a time: Write, Style or the pages.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 859px)');
    const on = () => setTab(mq.matches ? 'preview' : 'write');
    on();
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on));
  }, []);
  useEffect(() => { document.body.dataset.tab = st.tab; }, [st.tab]);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && st.selectedId && document.activeElement && document.activeElement.id !== 'src' && !document.querySelector('dialog[open]')) select(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [st.selectedId]);

  // Drop a document anywhere to import it.
  const [veil, setVeil] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFile = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = e => { if (!hasFile(e) || document.querySelector('dialog[open]')) return; depth++; setVeil(true); };
    const leave = e => { if (!hasFile(e) || document.querySelector('dialog[open]')) return; if (--depth <= 0) { depth = 0; setVeil(false); } };
    const over = e => { if (hasFile(e)) e.preventDefault(); };
    const drop = e => {
      if (!hasFile(e)) return; e.preventDefault(); depth = 0; setVeil(false);
      const f = e.dataTransfer.files[0];
      if (f) update(s => { s.importOpen = true; s.importFile = f; }, { save:false, layout:false });
    };
    window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave); window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, []);

  const tab = st.tab === 'preview' && !mobile() ? 'write' : st.tab;
  return (
    <>
      <Header st={st} />
      <div className="app">
        <nav className="tabs" role="tablist" aria-label="Sections">
          {[['write', 'Write'], ['style', 'Style'], ['preview', 'Pages']].map(([id, label]) => (
            <button key={id} className={'tab' + (id === 'preview' ? ' tab-preview' : '')} role="tab" type="button" data-tab={id}
              aria-selected={tab === id} aria-controls={id === 'preview' ? 'pages' : 'panel-' + id} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
        <aside className="side">
          <WritePanel st={st} hidden={tab === 'style'} />
          <StylePanel st={st} hidden={tab !== 'style'} />
        </aside>
        <Pages st={st} layout={layout} />
      </div>
      <ImportDialog open={st.importOpen} file={st.importFile} pages={layout ? layout.pages : 1} />
      <div className={'drop-veil' + (veil ? ' show' : '')} id="drop-veil">Drop to import this document</div>
    </>
  );
}
