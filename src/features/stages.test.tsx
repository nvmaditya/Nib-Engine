import { Profiler } from 'react';
import type { Editor } from '@tiptap/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cleanSettings, sampleDoc } from '@/engine/doc.js';
import { createDoc } from '@/store/documents';
import { App } from '@/app/App';
import type { Stage } from '@/app/route';
import { StageHost } from '@/features/doc/StageHost';
import { ExportPanel } from '@/features/export/ExportPanel';
import { StylePanel } from '@/features/style/StylePanel';
import { PagesView } from '@/features/write/PagesView';
import { editBox, select } from '@/features/doc/actions';
import { offsetAt } from '@/features/editor/positions';
import { placeCaret, update, useEditor } from '@/store/editor';
import { fontsLoad } from '@/test/docs';

let id = '';
beforeAll(async () => {
  // jsdom does no layout: give the pages a width, and the hands' fonts, so Write shows its typed pages.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
  fontsLoad();
  const S = cleanSettings(null, false);
  id = (await createDoc({ title: 'Seeded', settings: S, doc: sampleDoc(S) })).id;
});
afterAll(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  vi.unstubAllGlobals();
});

/** The button in the Stages nav whose label ends with `name` ('1 Write' for Write). */
const stageButton = (name: string) =>
  within(screen.getByRole('navigation', { name: 'Stages' })).getByRole('button', { name: new RegExp(`${name}$`) });
const search = () => screen.findByRole('searchbox', { name: 'Search handwriting' });

test('Style shows the scope switch and hides the removed options', async () => {
  location.hash = `#/d/${id}/style`;
  render(<App />);
  expect(await screen.findByRole('button', { name: 'Whole document' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Only this block' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /New variation/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Gel pen/ })).toBeInTheDocument();
  expect(screen.queryByText('As drawn')).toBeNull();
  expect(screen.queryByText('Fold crease')).toBeNull();
  expect(screen.queryByRole('textbox', { name: /^Main text/ })).toBeNull();
});

test('a document with the fold crease on can turn it off, and then the switch goes', async () => {
  const S = cleanSettings({ crease: true }, false);
  const creased = (await createDoc({ title: 'Creased', settings: S, doc: sampleDoc(S) })).id;
  location.hash = `#/d/${creased}/style`;
  render(<App />);
  const crease = await screen.findByRole('switch', { name: 'Fold crease' });
  expect(crease).toBeChecked();
  await userEvent.click(crease);
  await waitFor(() => expect(screen.queryByRole('switch', { name: 'Fold crease' })).toBeNull());
  expect(useEditor.getState().S.crease).toBe(false);
  expect(screen.getByRole('switch', { name: 'Punch holes' })).toBeInTheDocument();
});

test('Export shows the download controls', async () => {
  location.hash = `#/d/${id}/export`;
  render(<App />);
  expect(await screen.findByRole('button', { name: 'Download PDF' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download page 1 as PNG' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'File name' })).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Camera tilt' })).toBeInTheDocument();
});

test('switching stages keeps the Style search', async () => {
  location.hash = `#/d/${id}/style`;
  render(<App />);
  await userEvent.type(await search(), 'cav');
  await userEvent.click(stageButton('Write'));
  await userEvent.click(stageButton('Style'));
  expect(screen.getByRole('searchbox', { name: 'Search handwriting' })).toHaveValue('cav');
});

test('an inactive stage stays in the page but hidden', async () => {
  location.hash = `#/d/${id}/style`;
  render(<App />);
  await search();
  await userEvent.click(stageButton('Write'));
  expect(await screen.findByRole('textbox', { name: 'Main text, page 1' })).toBeVisible();
  const box = screen.getByRole('searchbox', { name: 'Search handwriting', hidden: true });
  expect(box).not.toBeVisible();
  expect(box.closest('[inert]')).not.toBeNull();
  expect(screen.queryByRole('searchbox', { name: 'Search handwriting' })).toBeNull();
});

test('a caret request goes to the Write view on screen, not to a hidden one', async () => {
  location.hash = `#/d/${id}/outline`;
  render(<App />);
  await screen.findByRole('button', { name: 'Outline', pressed: true });
  await userEvent.click(stageButton('Style'));
  location.hash = `#/d/${id}/write`;
  const shown = await screen.findByRole('textbox', { name: 'Main text, page 1' });
  act(() => placeCaret('b1', 5));
  await waitFor(() => expect(document.activeElement).toBe(shown));
  const ed = (shown as HTMLElement & { editor: Editor }).editor;
  expect(offsetAt(ed.state.doc, useEditor.getState().doc.boxes[1].text, ed.state.selection.from)).toBe(5);
  expect(shown.closest('[data-stage]')).toHaveAttribute('data-stage', 'write');
  expect(useEditor.getState().caret).toBeNull();
});

test('editing a block from Style goes back to the Write view used last', async () => {
  location.hash = `#/d/${id}/outline`;
  render(<App />);
  await screen.findByRole('button', { name: 'Outline', pressed: true });
  await userEvent.click(stageButton('Style'));
  await search();
  act(() => editBox('b1'));
  await waitFor(() => expect(location.hash).toBe(`#/d/${id}/outline`));
});

test('Escape in a rich-text editor doesn’t leave the block', async () => {
  location.hash = `#/d/${id}/write`;
  render(<App />);
  await screen.findByRole('textbox', { name: 'Main text, page 1' });
  act(() => select('b1'));
  const ed = document.createElement('div');
  ed.setAttribute('contenteditable', 'true'); ed.tabIndex = 0;
  document.body.append(ed); ed.focus();
  await userEvent.keyboard('{Escape}');
  expect(useEditor.getState().selectedId).toBe('b1');
  ed.remove();
  await userEvent.keyboard('{Escape}');
  expect(useEditor.getState().selectedId).toBeNull();
});

test('a menu left in a hidden stage doesn’t keep Escape from leaving the block', async () => {
  location.hash = `#/d/${id}/style`;
  render(<App />);
  await search();
  await userEvent.click(stageButton('Write'));
  await screen.findByRole('group', { name: 'Show' });
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  document.querySelector('[data-stage="style"]')!.append(menu);
  act(() => select('b1'));
  await userEvent.keyboard('{Escape}');
  expect(useEditor.getState().selectedId).toBeNull();
});

test('Write goes back to the Write view you used last', async () => {
  location.hash = `#/d/${id}/outline`;
  render(<App />);
  await screen.findByRole('button', { name: 'Outline', pressed: true });
  await userEvent.click(stageButton('Style'));
  await search();
  await userEvent.click(stageButton('Write'));
  expect(location.hash).toBe(`#/d/${id}/outline`);
});

test('a hidden stage’s panel doesn’t redraw on every change', () => {
  const renders: Partial<Record<Stage, number>> = {};
  const panel = (s: Stage) => (
    <Profiler id={s} onRender={() => { renders[s] = (renders[s] ?? 0) + 1; }}>
      {s === 'write' ? <PagesView layout={null} /> : s === 'style' ? <StylePanel /> : <ExportPanel pages={1} />}
    </Profiler>
  );
  const host = (stage: Stage) => <StageHost stage={stage} render={panel} />;
  const { rerender } = render(host('write'));
  rerender(host('style'));
  rerender(host('export'));
  for (const k of Object.keys(renders) as Stage[]) renders[k] = 0;
  act(() => update(null, { save: false, layout: false }));
  expect([renders.write, renders.style]).toEqual([0, 0]);
  expect(renders.export).toBeGreaterThan(0);
});
