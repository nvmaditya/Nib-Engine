// Import options: where it goes, the file's pages, a look drawn in its own hand, and an optional header block.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { FONTS } from '@/engine/config.js';
import { drawSample, loadFont } from '@/engine/core.js';
import { cleanSettings } from '@/engine/doc.js';
import { paperTint } from '@/features/style/HandSample';
import { useStylePrefs } from '@/features/style/prefs';
import { box, docOf, fieldsOf, fontsLoad, get, open } from '@/test/docs';
import { ImportOptions } from './ImportOptions';
import { initialOptions, lookById, type ImportOptionsValue, type ImportTarget } from './options';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}), getPref: vi.fn(async () => undefined), setPref: vi.fn(async () => {}) }));
vi.mock('@/engine/core.js', async orig => ({ ...(await orig<typeof import('@/engine/core.js')>()), drawSample: vi.fn(() => 120) }));

fontsLoad();
// Every hand's file arrives first: a card whose hand arrived after its test ended would draw again outside act.
beforeAll(async () => { await Promise.all(FONTS.map(f => loadFont(f.id))); });
const NOW = new Date(2026, 10, 7);
let value: ImportOptionsValue;
function Harness({ target, parts = 1 }: { target: ImportTarget; parts?: number }) {
  const [v, setV] = useState(() => initialOptions(target, target === 'open' ? get().doc : null, NOW)); value = v;
  return <ImportOptions target={target} value={v} onChange={setV} fileParts={parts} base={cleanSettings(null, false)} />;
}
const looks = () => within(screen.getByRole('radiogroup', { name: 'Look' })).getAllByRole('radio');
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); useStylePrefs.setState({ looks: [] }); vi.mocked(drawSample).mockClear(); });
afterEach(() => { vi.useRealTimers(); });

test('a new document: a look, Exam answer to start, and a header block; nothing about where', () => {
  render(<Harness target="new" />);
  expect(screen.queryByRole('radiogroup', { name: 'Where it goes' })).toBeNull();
  expect(looks().map(r => r.getAttribute('aria-label'))).toEqual(['Exam answer', 'Neat notes', 'Letter', 'Quick scribble', 'Journal', 'School copy']);
  expect(screen.getByRole('radio', { name: 'Exam answer' })).toBeChecked(); expect(screen.getByRole('checkbox', { name: 'Add a header block' })).not.toBeChecked();
  expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Look', 'Header']);
});
test('an open document: Replace to start, and its own look first and chosen', () => {
  open(docOf(box())); render(<Harness target="open" />);
  expect(screen.getByRole('radio', { name: 'Replace what’s on the pages' })).toBeChecked();
  expect(looks()[0]).toHaveAccessibleName('Keep this document’s look'); expect(looks()[0]).toBeChecked(); expect(value.look).toBeNull();
});
test('saved looks come after the built-in ones', () => { useStylePrefs.setState({ looks: [{ id: 'mine', name: 'My look', v: { font: 'caveat' } }] }); render(<Harness target="new" />); expect(looks().at(-1)).toHaveAccessibleName('My look'); });
test('Add after the last page: no header, and it says where the text goes', async () => {
  open(docOf(box())); render(<Harness target="open" />); await userEvent.click(screen.getByRole('radio', { name: 'Add after the last page' }));
  expect(value.where).toBe('append'); expect(screen.queryByRole('checkbox', { name: 'Add a header block' })).toBeNull();
  expect(screen.getByText('It carries on the writing that ends on the last page, from the top of a new page.')).toBeInTheDocument();
});
test('Start a new page where the file does: only for a file with pages of its own', async () => {
  const { unmount } = render(<Harness target="new" />); expect(screen.queryByRole('checkbox', { name: 'Start a new page where the file does' })).toBeNull(); unmount();
  render(<Harness target="new" parts={3} />); await userEvent.click(screen.getByRole('checkbox', { name: 'Start a new page where the file does' })); expect(value.breaks).toBe(true);
});
test('Add a header block: Name, Class and today’s Date, and what was typed comes back', async () => {
  render(<Harness target="new" />); const tick = screen.getByRole('checkbox', { name: 'Add a header block' }); await userEvent.click(tick);
  expect(screen.getByRole('textbox', { name: 'Date' })).toHaveValue('7 November 2026'); await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Asha');
  expect(value.header!.map(f => [f.label, f.value])).toEqual([['Name', 'Asha'], ['Class', ''], ['Date', '7 November 2026']]); expect(screen.getByText('At the top right of page 1.')).toBeInTheDocument();
  await userEvent.click(tick); expect(value.header).toBeNull(); await userEvent.click(tick); expect(value.header!.map(f => [f.label, f.value])).toEqual([['Name', 'Asha'], ['Class', ''], ['Date', '7 November 2026']]);
});
test('an open document with a header starts with it, fields and all', () => {
  open(docOf(box({ kind: 'header', name: 'Header', fields: fieldsOf({ name: 'Ravi', class: '9', subject: 'Art', date: '1 May 2026' }), text: 'x' }))); render(<Harness target="open" />);
  expect(screen.getByRole('checkbox', { name: 'Add a header block' })).toBeChecked(); expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Ravi');
  expect(value.header!.map(f => [f.label, f.value])).toEqual([['Name', 'Ravi'], ['Class', '9'], ['Subject', 'Art'], ['Date', '1 May 2026']]);
});
test('each look is written in its own hand on its own paper', () => {
  render(<Harness target="new" />); const card = screen.getByRole('radio', { name: 'Journal' });
  expect(card.querySelector<HTMLElement>('span[style]')!.style.background).toBe(paperTint('yellow')); expect(card.querySelector('canvas')).not.toBeNull();
});
test('arrow keys move between the looks', async () => { render(<Harness target="new" />); act(() => screen.getByRole('radio', { name: 'Exam answer' }).focus()); await userEvent.keyboard('{ArrowRight>}'); await waitFor(() => expect(value.look).toBe('notes')); await userEvent.keyboard('{/ArrowRight}'); });
test('lookById finds built-in and saved looks', () => { useStylePrefs.setState({ looks: [{ id: 'mine', name: 'My look', v: {} }] }); expect([lookById('journal')?.name, lookById('mine')?.name, lookById(null), lookById('gone')]).toEqual(['Journal', 'My look', null, null]); });
test('each card is drawn with its own look’s settings, and Keep with the document’s own', () => {
  open(docOf(box())); render(<Harness target="open" />);
  const fonts = vi.mocked(drawSample).mock.calls.map(c => c[1].font);
  expect(fonts).toEqual(['labelle', 'labelle', 'patrick', 'cedarville', 'reenie', 'caveat', 'playwrite']);
});
test('a look’s name may take a second line rather than be cut short, so Keep this document’s look reads in full', () => {
  open(docOf(box())); render(<Harness target="open" />);
  const name = screen.getByText('Keep this document’s look');
  expect(name).toHaveClass('line-clamp-2'); expect(name).not.toHaveClass('truncate');
});
