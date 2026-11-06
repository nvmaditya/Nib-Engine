import { useRef, useState } from 'react';
import { FONTS, FONT_GROUPS, PENS, INKS, PRESETS, PAPERS, LIMITS } from '../engine/config.js';
import { familyCss, hasOwnStyle, engineFor, PHOTO_URL } from '../engine/core.js';
import { update, toast, selectedBox } from '../store.js';
import { view, setV, shuffleBox, resetBoxStyle } from '../actions.js';

const fmt = { weight:v => v + '%', track:v => (v > 0 ? '+' : '') + v, words:v => (v > 0 ? '+' : '') + v + '%' };

function Slider({ id, label, V, step = 1 }) {
  const [min, max] = LIMITS[id];
  return (
    <div className={'slider' + (id === 'size' ? ' first' : '')}>
      <label htmlFor={id}>{label}</label>
      <output id={id + '-out'} htmlFor={id}>{fmt[id] ? fmt[id](V[id]) : V[id]}</output>
      <input type="range" id={id} min={min} max={max} step={step} value={V[id]} onChange={e => setV({ [id]:Number(e.target.value) })} />
    </div>
  );
}

let uploadN = 0;
function FontPicker({ V }) {
  const [q, setQ] = useState('');
  const listRef = useRef(null);
  const query = q.trim().toLowerCase();
  const match = f => !query || f.name.toLowerCase().includes(query) || f.family.toLowerCase().includes(query);
  const groups = FONT_GROUPS.map(([g, label]) => [label, FONTS.filter(f => (f.group || 'mine') === g && match(f))]).filter(([, list]) => list.length);
  const onFile = async e => {
    const input = e.target, file = input.files && input.files[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      uploadN++;
      const family = 'Longhand Upload ' + uploadN;
      const face = new FontFace(family, buf.slice(0));
      await face.load(); document.fonts.add(face);
      const id = 'upload-' + uploadN;
      const cfg = { id, name:file.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Your font', family, weight:'normal', scale:1, buf, local:true, group:'mine' };
      const eng = engineFor(cfg);
      const per = eng ? Math.round(eng.letterAlts / 26) : 0;
      if (per > 0) cfg.forms = per + 1;
      FONTS.push(cfg);
      setQ(''); setV({ font:id });
      toast(!eng ? 'Font added. This format can’t be reshaped, so letters only wobble.'
        : per > 0 ? `Font added with ${per + 1} shapes per letter. It stays until you close this page.`
        : 'Font added. It stays until you close this page.');
    } catch (err) {
      toast('That file isn’t a font this browser can read. Try a .ttf, .otf or .woff2 file.');
    }
    input.value = '';
  };
  return (
    <div className="group">
      <h2>Handwriting</h2>
      <input type="search" className="search" id="font-q" placeholder="Search handwriting" aria-label="Search handwriting" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} />
      <div id="fonts" ref={listRef}>
        {groups.map(([label, list]) => (
          <section className="font-group" key={label}>
            <h3>{label} <span>({list.length})</span></h3>
            <div className="fonts">
              {list.map(f => (
                <button key={f.id} type="button" className="chip" aria-pressed={f.id === V.font} onClick={() => setV({ font:f.id })}>
                  <span className="sample" style={{ fontFamily:familyCss(f), fontWeight:f.weight, fontSize:Math.max(16, Math.round(26 * f.scale)) }}>Homework</span>
                  <span className="name">{f.name}</span>
                  {f.forms > 1 && <span className="forms">{f.forms} shapes per letter</span>}
                </button>
              ))}
            </div>
          </section>
        ))}
        {!groups.length && <p className="no-fonts">No handwriting matches that name.</p>}
        <div className="fonts" style={{ marginTop:10 }}>
          <label className="chip upload">
            <input type="file" className="vh" accept=".ttf,.otf,.woff,.woff2" onChange={onFile} />
            <span>Use your own font</span><span className="name">TTF, OTF or WOFF</span>
          </label>
        </div>
      </div>
    </div>
  );
}

function ScopeBar({ st }) {
  const b = selectedBox();
  const scope = st.scope === 'box' && b ? 'box' : 'all';
  const own = st.doc.boxes.filter(hasOwnStyle).length;
  let hint;
  if (scope === 'box') {
    const n = st.doc.boxes.filter(x => x.page === b.page).indexOf(b) + 1;
    hint = `Changes go to text box ${n} on page ${b.page + 1} only. Paper and line spacing are shared by every page.`;
  } else {
    hint = (b ? 'Changes go to every text box' : 'Changes go to every text box. Select a box on the page to style it on its own')
      + (own ? ` (${own === 1 ? 'one box keeps' : own + ' boxes keep'} its own style).` : '.');
  }
  const setScope = sc => update(s => { s.scope = sc; }, { save:false, layout:false });
  return (
    <div className="scope-group">
      <div className="scope" role="group" aria-label="Which text boxes these settings change">
        <button type="button" className="scope-btn" data-scope="all" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>All text boxes</button>
        <button type="button" className="scope-btn" data-scope="box" aria-pressed={scope === 'box'} disabled={!b} onClick={() => setScope('box')}>This text box</button>
      </div>
      <p className="hint" id="scope-hint">{hint}</p>
      {scope === 'box' && (
        <div className="scope-actions" id="scope-actions">
          <button type="button" className="btn small" id="box-shuffle" onClick={() => shuffleBox(b.id)}>Reshuffle this box</button>
          <button type="button" className="btn small" id="box-reset" disabled={!hasOwnStyle(b)} onClick={resetBoxStyle}>Match the other boxes</button>
        </div>
      )}
    </div>
  );
}

export default function StylePanel({ st, hidden }) {
  const V = view();
  const pen = PENS.find(p => p.id === V.tip) || PENS[1];
  const inkLabel = V.ink === 'custom' ? 'Your colour' : (INKS.find(i => i.id === V.ink) || INKS[0]).name;
  const setS = (k, v) => update(s => { s.S[k] = v; });
  return (
    <section className="panel" id="panel-style" role="tabpanel" aria-label="Style" hidden={hidden}>
      <ScopeBar st={st} />
      <FontPicker V={V} />
      <div className="group">
        <h2>Pen <span className="val" id="pen-name">{pen.name}</span></h2>
        <div className="pens" id="pens">
          {PENS.map(p => (
            <button key={p.id} type="button" className="pen-opt" aria-pressed={p.id === V.tip} onClick={() => setV({ tip:p.id })}>
              <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
                <path d="M3 7 C 25 1, 45 12, 65 5 S 90 4, 97 6" fill="none" stroke="currentColor" strokeWidth={p.w ? Math.min(4.5, p.w * 1.25) : 2.6} strokeLinecap="round"
                  opacity={p.id === 'pencil' ? 0.6 : 1} strokeDasharray={p.id === 'pencil' ? '7 1.2' : undefined} />
              </svg>
              <span>{p.name}</span><small>{p.note}</small>
            </button>
          ))}
        </div>
        <Slider id="weight" label="Line weight" V={V} />
        <p className="hint">Every handwriting is redrawn at the pen’s real line width, so even a bold font can look like a fine ballpoint.</p>
      </div>
      <div className="group">
        <h2>Ink <span className="val" id="ink-name">{inkLabel}</span></h2>
        <div className="inks" id="inks">
          {INKS.map(i => (
            <button key={i.id} type="button" className="ink" style={{ '--c':i.c }} aria-pressed={i.id === V.ink} aria-label={i.name + ' ink'} title={i.name} onClick={() => setV({ ink:i.id })} />
          ))}
          <label className={'ink custom' + (V.ink === 'custom' ? ' set' : '')} title="Pick any colour" style={{ '--c':V.customInk }} aria-pressed={V.ink === 'custom'}>
            <input type="color" value={V.customInk} aria-label="Pick any ink colour" onChange={e => setV({ customInk:e.target.value, ink:'custom' })} />
          </label>
        </div>
      </div>
      <div className="group">
        <h2>Realism</h2>
        <div className="presets" id="presets">
          {PRESETS.map(p => (
            <button key={p.id} type="button" className="preset" data-id={p.id} aria-pressed={Object.keys(p.v).every(k => V[k] === p.v[k])} onClick={() => setV(p.v)}>{p.name}</button>
          ))}
        </div>
        <Slider id="mess" label="Natural movement" V={V} />
        <p className="hint">Lines climb and sag, line starts drift, words tilt and ride off the line, and gaps between words change.</p>
        <Slider id="variety" label="Vary each letter" V={V} />
        <p className="hint">Repeated letters never look exactly the same: each one picks a shape at random and its outline is bent a little differently.</p>
        <Slider id="wobble" label="Letter wobble" V={V} />
        <Slider id="flow" label="Ink flow" V={V} />
        <p className="hint">Pressure changes stroke by stroke, like a real pen: downstrokes press harder, and ink runs darker and lighter along the line.</p>
        <Slider id="mistakes" label="Mistakes" V={V} />
        <p className="hint">Now and then a word is misspelt, crossed out and written again. Words you cross out yourself with <code>~~word~~</code> get the same kinds of cut.</p>
      </div>
      <div className="group">
        <h2>Size and spacing</h2>
        <Slider id="size" label="Letter size" V={V} />
        <Slider id="gap" label="Line spacing" V={st.S} />
        <Slider id="track" label="Letter spacing" V={V} step={0.5} />
        <Slider id="words" label="Word spacing" V={V} step={5} />
      </div>
      <div className="group">
        <h2>Paper</h2>
        <div className="papers" id="papers">
          {Object.entries(PAPERS).map(([id, p]) => (
            <button key={id} type="button" className="paper-opt" aria-pressed={id === st.S.paper} onClick={() => setS('paper', id)}>
              <span className={'pv pv-' + id} aria-hidden="true" style={p.photo ? { backgroundImage:`url("${PHOTO_URL}")` } : undefined} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
        <div className="toggles">
          {[['lighting', 'Room lighting'], ['ghost', 'Show-through'], ['crease', 'Fold crease'], ['holes', 'Punch holes']].map(([k, label]) => (
            <label key={k}><input type="checkbox" id={k} checked={!!st.S[k]} onChange={e => setS(k, e.target.checked)} /> {label}</label>
          ))}
        </div>
        <p className="hint">Show-through adds faint writing from the back of the sheet, the way real notebook paper looks.</p>
      </div>
    </section>
  );
}
