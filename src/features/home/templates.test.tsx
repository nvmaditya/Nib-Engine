import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseHash } from '@/app/route';
import { TopBar } from '@/shell/TopBar';
import { matchLook, STYLE_LOOKS } from '@/features/style/looks';
import { useHeaderDefault } from '@/features/doc/headerDefault';
import { createDoc, getDoc, listDocs } from '@/store/documents';
import { get, lastToast } from '@/test/docs';
import { openTemplate, TEMPLATES, templateRecord, templateSettings, type TemplateId } from './templates';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }), Toaster: () => null }));
vi.mock('@/store/documents', async orig => {
  const actual = await orig<typeof import('@/store/documents')>();
  return { ...actual, createDoc: vi.fn(actual.createDoc) };
});

const NOW = new Date(2026, 10, 7, 10), T = (id: TemplateId) => TEMPLATES.find(t => t.id === id)!;

test('six templates, in this order, with what each is', () => expect(TEMPLATES.map(t => [t.id, t.name, t.note])).toEqual([
  ['blank', 'Blank page', 'Ruled, nothing on it yet'], ['assignment', 'Assignment', 'Header, title and headings'], ['notes', 'Class notes', 'Grid paper and lists'],
  ['letter', 'Letter', 'Plain paper, joined-up'], ['journal', 'Journal page', 'Yellow pad, relaxed'], ['card', 'Card', 'One big message'],
]));

test('each starts with its own look and paper', () => {
  const v = (id: TemplateId) => { const S = templateSettings(T(id)); return [S.font, S.tip, S.ink, S.paper, S.mess, S.wobble, S.variety, S.flow, S.size]; };
  expect(TEMPLATES.map(t => v(t.id))).toEqual([
    ['labelle', 'ball', 'blue', 'ruled', 45, 30, 60, 55, 30], ['labelle', 'ball', 'blue', 'ruled', 45, 30, 60, 55, 30], ['patrick', 'gel', 'blueblack', 'grid', 15, 12, 35, 30, 30],
    ['cedarville', 'fine', 'black', 'plain', 45, 30, 60, 55, 30], ['caveat', 'felt', 'purple', 'yellow', 45, 30, 60, 55, 30], ['cedarville', 'fine', 'black', 'plain', 45, 30, 60, 55, 38],
  ]);
  for (const t of TEMPLATES) expect(matchLook(templateSettings(t), templateSettings(t), STYLE_LOOKS, true)?.id).toBe(t.look);
});

test('…and the content it implies', () => {
  const r = (id: TemplateId) => templateRecord(T(id), NOW).doc.boxes.map(b => [b.kind, b.name, b.text, b.x, b.y]);
  expect(r('blank')).toEqual([['text', 'Main text', '', 112, 76]]);
  expect(r('assignment')).toEqual([['header', 'Header', 'Name:\nClass:\nDate: 7 November 2026', 446, 76], ['text', 'Main text', '# Title\n\n## Introduction\n', 112, 178]]);
  expect(r('notes')).toEqual([['text', 'Main text', '# Notes\n\n## Topic\n- First point\n- Second point', 74, 76]]);
  expect(r('letter')).toEqual([['text', 'Main text', 'Dear …,\n\n\n\nWith love,', 74, 76]]);
  expect(r('journal')).toEqual([['text', 'Main text', '7 November 2026\n\n', 112, 76]]);
  expect(r('card')).toEqual([['text', 'Main text', '# Happy birthday!', 74, 416]]);
  expect(TEMPLATES.map(t => templateRecord(t, NOW).title)).toEqual(['Untitled', 'Assignment', 'Class notes', 'Letter', 'Journal page', 'Card']);
});

test('the Assignment header starts from the remembered default, and a template’s fields have the same ids each time', () => {
  useHeaderDefault.setState({ fields: [{ label: 'Name', value: 'Asha' }, { label: 'Section', value: 'B' }, { label: 'Due', value: '1 May 2026', today: true }] });
  try {
    const head = () => templateRecord(T('assignment'), NOW).doc.boxes[0];
    expect([head().kind, head().text]).toEqual(['header', 'Name: Asha\nSection: B\nDue: 7 November 2026']);
    expect(head().fields).toEqual(head().fields);
    expect(head().fields!.map(f => f.id)).toEqual(['f1', 'f2', 'f3']);
  } finally { useHeaderDefault.setState({ fields: null }); }
  expect(templateRecord(T('assignment'), NOW).doc.boxes[0].text).toBe('Name:\nClass:\nDate: 7 November 2026');
});

test('a template opens as a new document on Write, the caret at the end of its main text, with nothing to undo', async () => {
  location.hash = '#/'; expect(await openTemplate('assignment', NOW)).toBe(true);
  const main = get().doc.boxes[1];
  expect(parseHash(location.hash)).toMatchObject({ name: 'doc', stage: 'write' }); expect(get().caret).toMatchObject({ boxId: main.id, offset: main.text.length });
  expect([get().title, get().canUndo, (await getDoc(get().docId!))?.settings.font]).toEqual(['Assignment', false, 'labelle']);
});

test('New document in the top bar is a Blank page', async () => {
  location.hash = '#/'; render(<TopBar route={{ name: 'home' }} ready={false} />); await userEvent.click(screen.getByRole('button', { name: 'New document' }));
  await waitFor(() => expect(get().doc.boxes.map(b => [b.name, b.text])).toEqual([['Main text', '']])); expect(get().title).toBe('Untitled');
});

/** The documents made since `before` (a set of the ids there were), by title. */
const madeSince = async (before: Set<string>) => (await listDocs()).filter(d => !before.has(d.id));
const ids = async () => new Set((await listDocs()).map(d => d.id));

test('New document pressed again before the first has opened makes one Blank page, with the caret in it', async () => {
  const before = await ids();
  expect(await Promise.all([openTemplate('blank'), openTemplate('blank')])).toEqual([true, true]); // a double click
  const made = await madeSince(before);
  expect(made.map(d => d.title)).toEqual(['Untitled']);
  expect(get().docId).toBe(made[0].id);
  expect(get().caret).toMatchObject({ boxId: made[0].doc.boxes[0].id, offset: 0 });
});

test('two different templates pressed close together make one document each', async () => {
  const before = await ids();
  await Promise.all([openTemplate('letter'), openTemplate('journal'), openTemplate('letter')]);
  expect((await madeSince(before)).map(d => d.title).sort()).toEqual(['Journal page', 'Letter']);
});

test('each document a template makes has block ids of its own', async () => {
  const before = await ids();
  await openTemplate('assignment', NOW); await openTemplate('assignment', NOW);
  const made = (await madeSince(before)).flatMap(d => d.doc.boxes.map(b => b.id));
  expect(made).toHaveLength(4); expect(new Set(made).size).toBe(4);
  expect(made.some(id => id.startsWith('tpl-'))).toBe(false); // (not the ids the cards’ pictures are drawn with)
});

test('once it has opened, New document makes another', async () => {
  const before = await ids();
  await openTemplate('blank'); await openTemplate('blank');
  expect(await madeSince(before)).toHaveLength(2);
});

test('a template this device can’t store says so', async () => {
  vi.mocked(createDoc).mockRejectedValueOnce(new Error('blocked'));
  expect(await openTemplate('letter')).toBe(false); expect(lastToast()).toBe('Nib can’t create documents on this device right now.');
});
