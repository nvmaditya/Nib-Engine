// The six templates: each a look and paper, and what a page of its kind starts with. They are built by the
// same builder as an import, so a template is an ordinary document that the engine draws unchanged.
import { snapY } from '@/engine/core.js';
import { cleanSettings } from '@/engine/doc.js';
import type { EngineDoc, Settings } from '@/engine/types';
import { newDocument, geomFor } from '@/features/doc/build';
import { today } from '@/features/doc/model';
import { STYLE_LOOKS, lookPatch } from '@/features/style/looks';
import { placeCaret } from '@/store/editor';
import { createAndOpen } from './actions';

export type TemplateId = 'blank' | 'assignment' | 'notes' | 'letter' | 'journal' | 'card';

export interface Template {
  id: TemplateId; name: string; note: string; title: string;
  /** The id of the built-in Look it starts from. */
  look: string;
  extra: Partial<Settings>;
  /** A Header block at the top right of page 1. */
  header: boolean;
  text(now: Date): string;
  /** Main text on the middle line of the page instead of the first. */
  middle: boolean;
}

const t = (p: Omit<Template, 'extra' | 'header' | 'middle'> & Partial<Pick<Template, 'extra' | 'header' | 'middle'>>): Template =>
  ({ extra: {}, header: false, middle: false, ...p });

export const TEMPLATES: readonly Template[] = [
  t({ id: 'blank', name: 'Blank page', note: 'Ruled, nothing on it yet', title: 'Untitled', look: 'exam', text: () => '' }),
  t({ id: 'assignment', name: 'Assignment', note: 'Header, title and headings', title: 'Assignment', look: 'exam', header: true, text: () => '# Title\n\n## Introduction\n' }),
  t({ id: 'notes', name: 'Class notes', note: 'Grid paper and lists', title: 'Class notes', look: 'notes', extra: { paper: 'grid' }, text: () => '# Notes\n\n## Topic\n- First point\n- Second point' }),
  t({ id: 'letter', name: 'Letter', note: 'Plain paper, joined-up', title: 'Letter', look: 'letter', text: () => 'Dear …,\n\n\n\nWith love,' }),
  t({ id: 'journal', name: 'Journal page', note: 'Yellow pad, relaxed', title: 'Journal page', look: 'journal', text: now => today(now) + '\n\n' }),
  t({ id: 'card', name: 'Card', note: 'One big message', title: 'Card', look: 'letter', extra: { size: 38 }, middle: true, text: () => '# Happy birthday!' }),
];

export function templateSettings(tpl: Template): Settings {
  const look = STYLE_LOOKS.find(l => l.id === tpl.look)!;
  return { ...cleanSettings(null, false), ...lookPatch(look, false), ...tpl.extra };
}

export function templateRecord(tpl: Template, now: Date = new Date()): { title: string; settings: Settings; doc: EngineDoc } {
  const settings = templateSettings(tpl);
  const doc = newDocument(settings, tpl.text(now), tpl.header ? { name: '', class: '', date: today(now) } : null);
  if (tpl.middle) doc.boxes[doc.boxes.length - 1].y = snapY(400, geomFor(settings));
  return { title: tpl.title, settings, doc };
}

/** The templates still making their document, by id. */
const opening = new Map<TemplateId, Promise<boolean>>();

/**
 * Make the template's document and open it on Write with the caret at the end of its Main text. False, having said
 * so, when it can't be made. Pressed again before the first one has opened (a double click on New document), it is
 * the same press: each record gets new block ids, so only the template tells two presses apart.
 */
export function openTemplate(id: TemplateId, now: Date = new Date()): Promise<boolean> {
  let made = opening.get(id);
  if (!made) {
    made = (async () => {
      const rec = templateRecord(TEMPLATES.find(x => x.id === id)!, now);
      if (!(await createAndOpen(rec))) return false;
      const main = rec.doc.boxes[rec.doc.boxes.length - 1]; // (of the record this press made and opened)
      placeCaret(main.id, main.text.length);
      return true;
    })().finally(() => { opening.delete(id); });
    opening.set(id, made);
  }
  return made;
}
