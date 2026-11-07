// The Style panel: what the handwriting looks like, for the whole document or only the selected block.
// Its sticky header (title, New variation, the page count notice and scope), then Looks, Handwriting,
// Pen, Ink, Paper, How natural, and Size and spacing. The sections get the document's state as props
// from here, and this redraws on every change only while the Style stage is shown.
import { scopeBox, view } from '@/features/doc/actions';
import { useStageActive } from '@/features/doc/StageHost';
import { useEditor } from '@/store/editor';
import { docStart } from './hands';
import { HandSection } from './HandSection';
import { LooksSection } from './LooksSection';
import { NaturalSection } from './NaturalSection';
import { PageCountNotice } from './PageCountNotice';
import { PaperSection } from './PaperSection';
import { PenInkSection } from './PenInkSection';
import { ScopeBar } from './ScopeBar';
import { SizeSection } from './SizeSection';

export function StylePanel({ pages }: { pages: number | null }) {
  const S = useEditor(s => s.S);
  const active = useStageActive();
  useEditor(s => (active ? s.version : -1)); // redraw on every change only while the stage is shown
  const V = view(), box = scopeBox(), blockScope = !!box;
  return (
    <section aria-label="Style">
      <ScopeBar notice={<PageCountNotice pages={pages} />} />
      <LooksSection V={V} S={S} blockScope={blockScope} />
      <HandSection V={V} start={docStart(useEditor.getState().doc)} blockName={box?.name ?? null} />
      <PenInkSection V={V} />
      <PaperSection S={S} blockScope={blockScope} />
      <NaturalSection V={V} />
      <SizeSection V={V} S={S} blockScope={blockScope} />
    </section>
  );
}
