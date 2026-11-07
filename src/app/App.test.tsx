import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast as sonner } from 'sonner';
import { FONTS } from '@/engine/config.js';
import { cleanSettings, sampleDoc } from '@/engine/doc.js';
import { addFontFile } from '@/features/style/fonts';
import { fontFile } from '@/test/fonts';
import { deleteBlock } from '@/features/doc/actions';
import { createDoc, getDoc } from '@/store/documents';
import { flushSave, useEditor } from '@/store/editor';
import { TopBar } from '@/shell/TopBar';
import { App } from './App';
import { parseHash } from './route';

// Messages outlive a test (sonner keeps them in a module); start each test without any.
afterEach(() => { act(() => { sonner.dismiss(); }); });

const docName = () => screen.findByRole('textbox', { name: 'Document name' });
const openId = () => { const r = parseHash(location.hash); return r.name === 'doc' ? r.id : ''; };

test('a missing document goes home with a message', async () => {
  location.hash = '#/d/missing/write';
  render(<App />);
  await waitFor(() => expect(location.hash).toBe('#/'));
  expect(await screen.findByText('That document isn’t on this device.')).toBeInTheDocument();
});

test('a document renamed on Home opens with its new name and keeps it after an edit', async () => {
  const user = userEvent.setup();
  location.hash = '#/';
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'New document' }));
  await waitFor(async () => expect(await docName()).toHaveValue('Untitled'));
  const id = openId();

  await user.click(screen.getByRole('link', { name: 'Home' }));
  await user.click(await screen.findByRole('button', { name: 'More for Untitled' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  const dlg = await screen.findByRole('dialog', { name: 'Rename document' });
  await user.clear(within(dlg).getByRole('textbox', { name: 'Document name' }));
  await user.type(within(dlg).getByRole('textbox', { name: 'Document name' }), 'Essay');
  await user.click(within(dlg).getByRole('button', { name: 'Rename' }));

  await user.click(await screen.findByText('Essay'));
  await waitFor(async () => expect(await docName()).toHaveValue('Essay'));
  await user.click(within(screen.getByRole('navigation', { name: 'Stages' })).getByRole('button', { name: /Style$/ }));
  await user.click(await screen.findByRole('button', { name: /^Gel pen/ })); // an edit, which is saved
  await act(() => flushSave());
  const saved = await getDoc(id);
  expect(saved?.title).toBe('Essay');
  expect(saved?.settings.tip).toBe('gel');
  expect(await docName()).toHaveValue('Essay');
});

test('a document deleted on Home stays deleted when Back opens its address again', async () => {
  const user = userEvent.setup();
  const rec = await createDoc({ title: 'Doomed' });
  location.hash = `#/d/${rec.id}/write`;
  render(<App />);
  await waitFor(async () => expect(await docName()).toHaveValue('Doomed'));

  await user.click(screen.getByRole('link', { name: 'Home' }));
  await user.click(await screen.findByRole('button', { name: 'More for Doomed' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(screen.queryByText('Doomed')).toBeNull());

  act(() => { history.back(); }); // to the document the user just left
  expect(await screen.findByText('That document isn’t on this device.')).toBeInTheDocument();
  await waitFor(() => expect(location.hash).toBe('#/'));
  await act(() => flushSave());
  expect(await getDoc(rec.id)).toBeUndefined();
});

test('Undo and Redo take a rename back and forth in the top bar', async () => {
  const user = userEvent.setup();
  const rec = await createDoc({ title: 'First name' });
  location.hash = `#/d/${rec.id}/write`;
  render(<App />);
  const input = await docName();
  await waitFor(() => expect(input).toHaveValue('First name'));
  await user.clear(input);
  await user.type(input, 'Second name{Enter}');
  expect(useEditor.getState().title).toBe('Second name');

  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(input).toHaveValue('First name');
  await user.click(screen.getByRole('button', { name: 'Redo' }));
  expect(input).toHaveValue('Second name');
  await act(() => flushSave());
  expect((await getDoc(rec.id))?.title).toBe('Second name');
});

test('going Home clears a message whose Undo belongs to the document', async () => {
  const user = userEvent.setup();
  const S = cleanSettings(null, false);
  const rec = await createDoc({ title: 'Two blocks', settings: S, doc: sampleDoc(S) });
  location.hash = `#/d/${rec.id}/write`;
  render(<App />);
  await screen.findByRole('group', { name: 'Write view' });
  act(() => deleteBlock(useEditor.getState().doc.boxes[0].id));
  expect(await screen.findByText('Deleted “Header”.')).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Home' }));
  await waitFor(() => expect(screen.queryByText('Deleted “Header”.')).toBeNull());
});

test('blocked storage opens the document in memory and Home lists it', async () => {
  vi.resetModules();
  vi.doMock('@/store/bootstrap', () => ({ bootstrapDocuments: async () => ({ ok: false }) }));
  const { App: Fresh } = await import('./App');
  location.hash = '';
  render(<Fresh />);
  expect(await screen.findByText('Nib can\'t save on this device right now. Your work stays until you close this tab.')).toBeInTheDocument();
  await waitFor(() => expect(location.hash).toBe('#/d/memory/write'));
  location.hash = '#/';
  expect(await screen.findByText('The Water Cycle')).toBeInTheDocument();
  vi.doUnmock('@/store/bootstrap');
});

test('while a document opens its name field says Opening…', () => {
  render(<TopBar route={{ name: 'doc', id: 'x', stage: 'write' }} ready={false} />);
  const f = screen.getByRole('textbox', { name: 'Document name' });
  expect(f).toBeDisabled();
  expect(f).toHaveAttribute('placeholder', 'Opening…');
  expect(f).toHaveValue('');
  expect(screen.queryByText('Saved')).toBeNull();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('a document that uses an uploaded hand opens with it on a fresh page', async () => {
  const r = await addFontFile(fontFile('caveat', 'Mine.woff')) as { id: string };
  const rec = await createDoc({ title: 'U', settings: { ...cleanSettings(null, false), font: r.id } });
  FONTS.splice(FONTS.findIndex(f => f.id === r.id), 1); // as a fresh page has it: not registered yet
  location.hash = `#/d/${rec.id}/write`; render(<App />);
  await waitFor(() => expect(useEditor.getState().docId).toBe(rec.id));
  expect(useEditor.getState().S.font).toBe(r.id);
});
