// What the command palette (Ctrl+K, ⌘K) offers, in its groups and order. The document that is open and the stage
// on screen are left out, so every item takes you somewhere or changes something.
import { navigate, type Route, type Stage } from '@/app/route';
import { openImport } from '@/features/doc/actions';
import type { Format } from '@/features/export/plan';
import { setExportPrefs } from '@/features/export/state';
import { openImportPicker } from '@/features/home/actions';
import { relativeTime } from '@/features/home/recent';
import { openTemplate } from '@/features/home/templates';
import { pickDocumentLook, STYLE_LOOKS } from '@/features/style/looks';
import type { SavedLook } from '@/features/style/prefs';
import { setThemePref, type ThemePref } from '@/lib/theme';
import { focusBeforeOverlay, openOverlay } from './overlays';

export type CommandGroupName = 'Go to' | 'Documents' | 'Create' | 'Export' | 'Looks for the whole document' | 'Theme' | 'Help';

export interface PaletteCommand {
  id: string;
  group: CommandGroupName;
  label: string;
  /** What the palette searches: the label first, then other words it can be found by. */
  keywords: string[];
  /** Muted on the right: when a document was edited, or the theme in use. */
  meta?: string;
  /** A key on the right. */
  shortcut?: string;
  run(): void;
}

export interface CommandContext {
  route: Route;
  /** The documents on this device, newest first. */
  docs: { id: string; title: string; updatedAt: number }[];
  /** The looks saved on this device. */
  looks: SavedLook[];
  theme: ThemePref;
  now?: number;
}

const STAGES: { stage: Stage; label: string; words: string }[] = [
  { stage: 'write', label: 'Write', words: 'pages typed handwritten' },
  { stage: 'outline', label: 'Outline', words: 'pages blocks structure' },
  { stage: 'style', label: 'Style', words: 'hand pen ink paper looks' },
  { stage: 'export', label: 'Export', words: 'download pdf png jpg' },
];
const FORMATS: [Format, string][] = [['pdf', 'PDF'], ['png', 'PNG'], ['jpg', 'JPG']];
const THEMES: [ThemePref, string][] = [['system', 'System theme'], ['light', 'Light theme'], ['dark', 'Dark theme']];

export function paletteCommands(ctx: CommandContext): PaletteCommand[] {
  const doc = ctx.route.name === 'doc' ? ctx.route : null;
  const out: PaletteCommand[] = [];
  const add = (group: CommandGroupName, id: string, label: string, run: () => void, o: { words?: string; meta?: string; shortcut?: string } = {}) =>
    out.push({ id, group, label, keywords: [label, ...(o.words ? o.words.split(' ') : [])], meta: o.meta, shortcut: o.shortcut, run });

  if (doc) {
    for (const s of STAGES) if (s.stage !== doc.stage) add('Go to', `stage:${s.stage}`, s.label, () => navigate({ ...doc, stage: s.stage }), { words: s.words });
    add('Go to', 'home', 'Home', () => navigate({ name: 'home' }), { words: 'documents recent templates' });
  }
  for (const d of ctx.docs) {
    if (d.id !== doc?.id) add('Documents', `doc:${d.id}`, d.title, () => navigate({ name: 'doc', id: d.id, stage: 'write' }), { meta: relativeTime(d.updatedAt, ctx.now) });
  }
  add('Create', 'new', 'New document', () => { void openTemplate('blank'); }, { words: 'blank page' });
  add('Create', 'import', 'Import a file…', () => (doc ? openImport(null, focusBeforeOverlay()) : openImportPicker()), { words: 'pdf word docx text' });
  if (doc) {
    for (const [format, name] of FORMATS) add('Export', `export:${format}`, `Export as ${name}`, () => { setExportPrefs({ format }); navigate({ ...doc, stage: 'export' }); });
    for (const look of [...STYLE_LOOKS, ...ctx.looks]) add('Looks for the whole document', `look:${look.id}`, look.name, () => pickDocumentLook(look));
  }
  for (const [pref, label] of THEMES) add('Theme', `theme:${pref}`, label, () => setThemePref(pref), { meta: ctx.theme === pref ? 'Current' : undefined });
  add('Help', 'shortcuts', 'Keyboard shortcuts', () => openOverlay('shortcuts'), { shortcut: '?' });
  return out;
}
