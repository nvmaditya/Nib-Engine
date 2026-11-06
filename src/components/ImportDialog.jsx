import { useEffect, useRef, useState } from 'react';
import { readDocument, importError } from '../engine/importers.js';
import { update, toast } from '../store.js';
import { writeOut } from '../actions.js';
import { CloseIcon } from './icons.jsx';

// Bring in a PDF, Word or text file, check the text, then write it out as one flowing text box.
export default function ImportDialog({ open, file, pages }) {
  const dlg = useRef(null);
  const [status, setStatus] = useState({ msg:'', err:false });
  const [res, setRes] = useState(null);
  const [text, setText] = useState('');
  const [where, setWhere] = useState('replace');
  const [breaks, setBreaks] = useState(false);
  const [over, setOver] = useState(false);
  const generated = useRef('');

  const compose = (r, br) => r.parts.filter(p => p.trim()).join(br ? '\n\\newpage\n' : '\n\n');
  const close = () => update(s => { s.importOpen = false; s.importFile = null; }, { save:false, layout:false });

  useEffect(() => {
    const d = dlg.current;
    if (open && !d.open) { setRes(null); setText(''); setStatus({ msg:'', err:false }); setBreaks(false); try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => { if (open && file) read(file); }, [open, file]);

  async function read(f) {
    setRes(null); setStatus({ msg:`Reading ${f.name || 'file'}…`, err:false });
    try {
      const r = await readDocument(f);
      setRes(r); setBreaks(false);
      generated.current = compose(r, false); setText(generated.current);
      setStatus({ msg:`${f.name}: ${r.words.toLocaleString()} words${r.pages ? ` from ${r.pages} page${r.pages === 1 ? '' : 's'}` : ''}. Markup like ## for headings and **bold** shows how it will be written.`, err:false });
    } catch (e) { setStatus({ msg:importError(e && e.code), err:true }); }
  }
  const toggleBreaks = checked => {
    if (text === generated.current) { setBreaks(checked); generated.current = compose(res, checked); setText(generated.current); }
    else setStatus({ msg:'You’ve edited the text, so page breaks are now up to you: put \\newpage on its own line where a new page should start.', err:false });
  };
  const go = () => {
    const t = text.replace(/\s+$/, '');
    if (!t.trim()) return;
    const { undo } = writeOut(t, where, res && res.name, pages);
    close();
    requestAnimationFrame(() => toast('Written out. Each page’s part can be moved, resized, edited or separated on its own.', undo));
  };

  return (
    <dialog className="dlg" id="import-dlg" aria-labelledby="import-title" ref={dlg} onCancel={e => { e.preventDefault(); close(); }}>
      <form method="dialog" className="dlg-body" onSubmit={e => e.preventDefault()}>
        <div className="dlg-head">
          <h2 id="import-title">Import a document</h2>
          <button className="x" type="button" aria-label="Close" onClick={close}><CloseIcon /></button>
        </div>
        <label className={'drop' + (over ? ' over' : '')} id="imp-drop"
          onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); const f = e.dataTransfer.files[0]; if (f) read(f); }}>
          <input type="file" id="imp-file" className="vh" accept=".pdf,.docx,.txt,.md,.markdown,.text,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={e => { const f = e.target.files && e.target.files[0]; if (f) read(f); e.target.value = ''; }} />
          <strong>Choose a PDF, Word (.docx) or text file</strong>
          <span>or drop it here. Headings, lists, bold, underline and crossed-out words come across.</span>
        </label>
        <p className={'imp-status' + (status.err ? ' err' : '')} id="imp-status" role="status" aria-live="polite">{status.msg}</p>
        {res && (
          <div className="imp-review" id="imp-review">
            <label htmlFor="imp-text" className="imp-lbl">Check the text and change anything before it’s written out</label>
            <textarea id="imp-text" spellCheck="true" value={text} onChange={e => setText(e.target.value)} />
            <div className="imp-opts">
              <label><input type="radio" name="imp-where" value="replace" checked={where === 'replace'} onChange={() => setWhere('replace')} /> Replace what’s on the pages</label>
              <label><input type="radio" name="imp-where" value="append" checked={where === 'append'} onChange={() => setWhere('append')} /> Add after the last page</label>
              {res.parts.length > 1 && <label id="imp-breaks-row"><input type="checkbox" id="imp-breaks" checked={breaks} onChange={e => toggleBreaks(e.target.checked)} /> Start a new page where the file does</label>}
            </div>
          </div>
        )}
        <div className="dlg-foot">
          <button className="btn" type="button" onClick={close}>Cancel</button>
          <button className="btn primary" id="imp-go" type="button" disabled={!res} onClick={go}>Write it out</button>
        </div>
      </form>
    </dialog>
  );
}
