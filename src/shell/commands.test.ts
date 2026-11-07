import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Route } from '@/app/route';
import { openImport } from '@/features/doc/actions';
import { DEFAULT_PREFS, useExportPrefs } from '@/features/export/state';
import { openImportPicker } from '@/features/home/actions';
import { openTemplate } from '@/features/home/templates';
import { setThemePref } from '@/lib/theme';
import { get, rec } from '@/test/docs';
import { flushSave, openDocument } from '@/store/editor';
import { paletteCommands, type CommandContext } from './commands';
import { closeOverlay, openOverlay, useOverlays } from './overlayStore';

vi.mock('@/features/doc/actions', async orig => ({ ...(await orig<typeof import('@/features/doc/actions')>()), openImport: vi.fn() }));
vi.mock('@/features/home/actions', async orig => ({ ...(await orig<typeof import('@/features/home/actions')>()), openImportPicker: vi.fn() }));
vi.mock('@/features/home/templates', async orig => ({ ...(await orig<typeof import('@/features/home/templates')>()), openTemplate: vi.fn(async () => true) }));
vi.mock('@/store/documents', async orig => ({ ...(await orig<typeof import('@/store/documents')>()), putDoc: vi.fn(async () => 1) }));

const NOW = new Date(2026, 10, 7, 12).getTime();
const ctx = (route: Route, more: Partial<CommandContext> = {}): CommandContext => ({
  route, docs: [{ id: 'd1', title: 'The Water Cycle', updatedAt: NOW }, { id: 'd2', title: 'Essay', updatedAt: NOW - 86_400_000 }],
  looks: [], theme: 'system', now: NOW, ...more,
});
const inDoc = (stage: Extract<Route, { name: 'doc' }>['stage'] = 'write'): Route => ({ name: 'doc', id: 'd1', stage });
const labels = (c: ReturnType<typeof paletteCommands>, group: string) => c.filter(x => x.group === group).map(x => x.label);

beforeEach(() => { location.hash = '#/d/d1/write'; useOverlays.setState({ open: null }); useExportPrefs.setState({ ...DEFAULT_PREFS }); vi.clearAllMocks(); });
afterEach(async () => { setThemePref('system'); await flushSave(); });

test('on Home: documents, create, theme and help', () => {
  const c = paletteCommands(ctx({ name: 'home' }));
  expect([...new Set(c.map(x => x.group))]).toEqual(['Documents', 'Create', 'Theme', 'Help']);
  expect(c.filter(x => x.group === 'Documents').map(x => [x.label, x.meta])).toEqual([['The Water Cycle', 'Edited today'], ['Essay', 'Edited yesterday']]);
  expect(c.find(x => x.id === 'theme:system')!.meta).toBe('Current');
});

test('in a document: the other stages, the other documents, export, looks for the whole document', () => {
  const c = paletteCommands(ctx({ name: 'doc', id: 'd1', stage: 'write' }));
  expect(c.filter(x => x.group === 'Go to').map(x => x.label)).toEqual(['Outline', 'Style', 'Export', 'Home']);
  expect(c.filter(x => x.group === 'Documents').map(x => x.label)).toEqual(['Essay']);
  expect(c.filter(x => x.group === 'Export').map(x => x.label)).toEqual(['Export as PDF', 'Export as PNG', 'Export as JPG']);
  expect(c.filter(x => x.group === 'Looks for the whole document').map(x => x.label)).toEqual(['Exam answer', 'Neat notes', 'Letter', 'Quick scribble', 'Journal', 'School copy']);
});

test('every group in the order of the copy, each item named as it says', () => {
  const c = paletteCommands(ctx(inDoc('outline'), { theme: 'dark', looks: [{ id: 'l1', name: 'My exam', v: { font: 'caveat' } }] }));
  expect([...new Set(c.map(x => x.group))]).toEqual(['Go to', 'Documents', 'Create', 'Export', 'Looks for the whole document', 'Theme', 'Help']);
  expect(labels(c, 'Go to')).toEqual(['Write', 'Style', 'Export', 'Home']); // Outline is the stage on screen
  expect(labels(c, 'Create')).toEqual(['New document', 'Import a file…']);
  expect(labels(c, 'Looks for the whole document').slice(6)).toEqual(['My exam']); // saved looks after the six
  expect(c.filter(x => x.group === 'Theme').map(x => [x.label, x.meta])).toEqual([['System theme', undefined], ['Light theme', undefined], ['Dark theme', 'Current']]);
  expect(c.filter(x => x.group === 'Help').map(x => [x.label, x.shortcut])).toEqual([['Keyboard shortcuts', '?']]);
  expect(c.map(x => x.id)).toEqual([
    'stage:write', 'stage:style', 'stage:export', 'home', 'doc:d2', 'new', 'import', 'export:pdf', 'export:png', 'export:jpg',
    'look:exam', 'look:notes', 'look:letter', 'look:scribble', 'look:journal', 'look:school', 'look:l1', 'theme:system', 'theme:light', 'theme:dark', 'shortcuts',
  ]);
});

test('a document edited longer ago says when', () => {
  const c = paletteCommands(ctx({ name: 'home' }, { docs: [{ id: 'd3', title: 'Old', updatedAt: new Date(2025, 2, 4).getTime() }] }));
  expect(c.find(x => x.id === 'doc:d3')!.meta).toBe('Edited 4 March 2025');
});

test('the keywords start with the label, then the words each item can also be found by', () => {
  const all = [...paletteCommands(ctx(inDoc('write'))), ...paletteCommands(ctx(inDoc('export')))]; // every stage, in one or the other
  const kw = (id: string) => all.find(x => x.id === id)!.keywords;
  expect(kw('stage:write')).toEqual(['Write', 'pages', 'typed', 'handwritten']);
  expect(kw('stage:outline')).toEqual(['Outline', 'pages', 'blocks', 'structure']);
  expect(kw('stage:style')).toEqual(['Style', 'hand', 'pen', 'ink', 'paper', 'looks']);
  expect(kw('stage:export')).toEqual(['Export', 'download', 'pdf', 'png', 'jpg']);
  expect(kw('home')).toEqual(['Home', 'documents', 'recent', 'templates']);
  expect(kw('doc:d2')).toEqual(['Essay']);
  expect(kw('new')).toEqual(['New document', 'blank', 'page']);
  expect(kw('import')).toEqual(['Import a file…', 'pdf', 'word', 'docx', 'text']);
  for (const c of all) expect(c.keywords[0]).toBe(c.label);
});

/* ---------- What each one does ---------- */

const run = (route: Route, id: string) => paletteCommands(ctx(route)).find(x => x.id === id)!.run();

test('a stage, Home and another document are places to go', () => {
  run(inDoc(), 'stage:style'); expect(location.hash).toBe('#/d/d1/style');
  run(inDoc('style'), 'stage:outline'); expect(location.hash).toBe('#/d/d1/outline');
  run(inDoc(), 'doc:d2'); expect(location.hash).toBe('#/d/d2/write');
  run(inDoc(), 'home'); expect(location.hash).toBe('#/');
});

test('New document makes a blank one', () => {
  run({ name: 'home' }, 'new');
  expect(openTemplate).toHaveBeenCalledWith('blank');
});

test('Import a file… opens Import in a document, and the file picker on Home', () => {
  run(inDoc(), 'import');
  expect(openImport).toHaveBeenCalledTimes(1); expect(openImportPicker).not.toHaveBeenCalled();
  run({ name: 'home' }, 'import');
  expect(openImportPicker).toHaveBeenCalledTimes(1); expect(openImport).toHaveBeenCalledTimes(1);
});

test('…and Import gives the focus back to what had it before the palette, not to the palette’s field', () => {
  const had = document.body.appendChild(document.createElement('button'));
  had.focus();
  openOverlay('palette');
  run(inDoc(), 'import');
  expect(openImport).toHaveBeenCalledWith(null, had);
  closeOverlay(); had.remove();
});

test('Export as… chooses the format, then goes to Export', () => {
  run(inDoc(), 'export:jpg');
  expect(useExportPrefs.getState().format).toBe('jpg');
  expect(location.hash).toBe('#/d/d1/export');
});

test('a look goes on the whole document, the theme changes, and the shortcuts open', () => {
  openDocument(rec('A', 'x'));
  run(inDoc(), 'look:journal');
  expect([get().S.font, get().S.ink, get().S.paper]).toEqual(['caveat', 'purple', 'yellow']);
  run(inDoc(), 'theme:dark'); expect(document.documentElement).toHaveClass('dark');
  run(inDoc(), 'theme:light'); expect(document.documentElement).not.toHaveClass('dark');
  run(inDoc(), 'shortcuts'); expect(useOverlays.getState().open).toBe('shortcuts');
});
