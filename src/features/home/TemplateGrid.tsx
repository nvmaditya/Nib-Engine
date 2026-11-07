import { useMemo, useState } from 'react';
import { today } from '@/features/doc/model';
import { PageThumb } from './PageThumb';
import { TEMPLATES, openTemplate, templateRecord, type TemplateId } from './templates';
import { TEMPLATE_PX } from './thumbs';

export function TemplateGrid() {
  const [busy, setBusy] = useState(false);
  const day = today();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the day is the only thing the records read from the clock
  const records = useMemo(() => TEMPLATES.map(t => templateRecord(t, new Date())), [day]);
  const start = async (id: TemplateId) => {
    if (busy) return;
    setBusy(true);
    try { await openTemplate(id); } finally { setBusy(false); }
  };
  return (
    <section aria-labelledby="templates-h" className="flex flex-col gap-3">
      <div>
        <h2 id="templates-h" className="text-base font-semibold">Start something new</h2>
        <p className="text-sm text-muted">Each template starts with its own look. You can change everything later.</p>
      </div>
      <div aria-busy={busy} className="grid grid-cols-2 gap-4 sm:grid-cols-3 wide:grid-cols-6">
        {TEMPLATES.map((t, i) => (
          <button key={t.id} type="button" disabled={busy} onClick={() => { void start(t.id); }}
            className="group flex flex-col gap-2 text-left disabled:opacity-60">
            <PageThumb owner={'tpl:' + t.id} S={records[i].settings} doc={records[i].doc} px={TEMPLATE_PX} className="motion-safe:transition-transform motion-safe:group-hover:-translate-y-[3px]" />
            <span className="text-[13.5px] font-semibold">{t.name}</span>
            <span className="text-[13px] text-muted">{t.note}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
