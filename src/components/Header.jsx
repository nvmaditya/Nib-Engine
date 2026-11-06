import { useState } from 'react';
import { update, toast, selectedBox } from '../store.js';
import { reshuffle } from '../actions.js';
import { savePdf } from '../exporters.js';
import { ShuffleIcon, ImportIcon, DownloadIcon } from './icons.jsx';

export default function Header({ st }) {
  const [busy, setBusy] = useState(false);
  const boxOnly = st.scope === 'box' && selectedBox();
  const shuffleLabel = boxOnly ? 'Reshuffle this text box' : 'Reshuffle handwriting';
  const download = async () => {
    setBusy(true);
    try { toast(`Saved ${await savePdf()}`); }
    catch (e) { toast('The PDF couldn’t be made. Check your connection and try again.'); }
    finally { setBusy(false); }
  };
  return (
    <header className="top">
      <h1 className="brand">Longhand</h1>
      <span className="spacer" />
      <button className="btn" id="shuffle" type="button" title={shuffleLabel} aria-label={shuffleLabel} onClick={reshuffle}>
        <ShuffleIcon /><span className="wide">Reshuffle</span>
      </button>
      <button className="btn" id="import" type="button" title="Bring in a PDF, Word or text file" aria-label="Import a document"
        onClick={() => update(s => { s.importOpen = true; }, { save:false, layout:false })}>
        <ImportIcon /><span className="wide">Import</span>
      </button>
      <button className="btn primary" id="pdf" type="button" disabled={busy} onClick={download}>
        <DownloadIcon /><span><span className="wide">Download </span>PDF</span>
      </button>
    </header>
  );
}
