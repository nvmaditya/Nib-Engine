import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseHash } from '@/app/route';
import { TopBar } from '@/shell/TopBar';
import { matchLook, STYLE_LOOKS } from '@/features/style/looks';
import { createDoc, getDoc } from '@/store/documents';
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

test('a template this device can’t store says so', async () => {
  vi.mocked(createDoc).mockRejectedValueOnce(new Error('blocked'));
  expect(await openTemplate('letter')).toBe(false); expect(lastToast()).toBe('Nib can’t create documents on this device right now.');
});
