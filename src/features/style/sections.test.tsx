// Pen, Ink, Paper, How natural, and Size and spacing.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { DEFAULTS } from '@/engine/config.js';
import { select, view } from '@/features/doc/actions';
import { flushSave, undo, update, useEditor } from '@/store/editor';
import { box, docOf, get, open } from '@/test/docs';
import { NaturalSection } from './NaturalSection';
import { EFFECT_WORKS, PaperSection } from './PaperSection';
import { PenInkSection } from './PenInkSection';
import { SizeSection } from './SizeSection';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));

beforeEach(async () => { await flushSave(); localStorage.clear(); });

function Live() {
  useEditor(s => s.version);
  const V = view(), { S, scope, selectedId } = get(), blockScope = scope === 'box' && !!selectedId;
  return (<><PenInkSection V={V} /><PaperSection S={S} blockScope={blockScope} /><NaturalSection V={V} /><SizeSection V={V} S={S} blockScope={blockScope} /></>);
}
const styleBox = (id: string) => act(() => { select(id); update(s => { s.scope = 'box'; }, { save: false, layout: false }); });
const fold = (name: string) => userEvent.click(screen.getByRole('button', { name }));

test('five pens; As drawn is not one of them', () => {
  open(docOf(box())); render(<Live />);
  expect(within(screen.getByRole('group', { name: 'Pen' })).getAllByRole('button').map(b => b.textContent))
    .toEqual(['Fineliner0.4 mm', 'Ballpoint0.7 mm', 'Gel pen1.0 mm', 'Felt tip1.5 mm', 'PencilHB']);
  expect(screen.queryByText('As drawn')).toBeNull();
});

test('a document drawn As drawn shows no pen chosen, and can move to a real pen', async () => {
  open(docOf(box()));
  update(s => { s.S.tip = 'font'; }, { history: false });
  render(<Live />);
  expect(within(screen.getByRole('group', { name: 'Pen' })).queryByRole('button', { pressed: true })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: /^Gel pen/ }));
  expect(get().S.tip).toBe('gel');
});

test.each([
  ['button', /^Gel pen/, 'tip', 'gel', false],
  ['button', 'Red ink', 'ink', 'red', false],
  ['button', 'Grid', 'paper', 'grid', false],
  ['switch', 'Show-through', 'ghost', false, true],
  ['button', 'Messy', 'mess', 100, false],
] as const)('%s %s is one undo step', async (role, name, key, value, inFold) => {
  open(docOf(box())); render(<Live />);
  if (inFold) await fold('Paper effects');
  await userEvent.click(screen.getByRole(role, { name }));
  expect(get().S[key]).toBe(value);
  undo();
  expect(get().S[key]).toBe(DEFAULTS[key]);
  expect(get().canUndo).toBe(false);
});

test('any ink colour: one session in the colour picker is one undo step', () => {
  open(docOf(box())); render(<Live />);
  const c = screen.getByLabelText('Pick any ink colour');
  fireEvent.input(c, { target: { value: '#112233' } });
  fireEvent.input(c, { target: { value: '#445566' } });
  fireEvent.blur(c);
  expect([get().S.ink, get().S.customInk]).toEqual(['custom', '#445566']);
  expect(screen.getByText('Your colour')).toBeInTheDocument();
  undo();
  expect([get().S.ink, get().S.customInk]).toEqual(['blue', '#5a2d82']);
  expect(get().canUndo).toBe(false);
});

test('a second session in the colour picker is a step of its own', () => {
  open(docOf(box())); render(<Live />);
  const c = screen.getByLabelText('Pick any ink colour');
  fireEvent.input(c, { target: { value: '#112233' } }); fireEvent.blur(c);
  fireEvent.input(c, { target: { value: '#445566' } }); fireEvent.blur(c);
  undo();
  expect(get().S.customInk).toBe('#112233');
});

test('in Only a block, pen and ink are the block’s; paper is the document’s and says so', async () => {
  open(docOf(box({ id: 'n' }), box({ id: 'm', name: 'Second' })));
  styleBox('m'); render(<Live />);
  await userEvent.click(screen.getByRole('button', { name: /^Pencil/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Yellow pad' }));
  expect(get().doc.boxes[1].style).toEqual({ tip: 'pencil' });
  expect(get().S.paper).toBe('yellow');
  expect(screen.getAllByText('shared by every page')).toHaveLength(2);
});

test('in Whole document scope nothing says shared by every page', () => {
  open(docOf(box())); render(<Live />);
  expect(screen.queryByText('shared by every page')).toBeNull();
});

test('effects this paper can’t show are off and say so', async () => {
  open(docOf(box())); render(<Live />);
  await fold('Paper effects');
  await userEvent.click(screen.getByRole('button', { name: 'Spiral' }));
  expect(screen.getByRole('switch', { name: 'Punch holes' })).toBeDisabled();
  expect(screen.getByText('Not on this paper')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Photo' }));
  expect(screen.getByRole('switch', { name: 'Room lighting' })).toBeDisabled();
  expect(screen.getByRole('switch', { name: 'Room lighting' })).not.toBeChecked();
  expect(get().S.lighting).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Ruled' }));
  expect(screen.getByRole('switch', { name: 'Punch holes' })).toBeEnabled();
  expect(screen.queryByText('Not on this paper')).toBeNull();
});

test('EFFECT_WORKS follows each paper', () => {
  expect(EFFECT_WORKS.lighting({ photo: true } as never)).toBe(false);
  expect(EFFECT_WORKS.holes({} as never)).toBe(false);
  expect(EFFECT_WORKS.holes({ holes: true } as never)).toBe(true);
  expect(EFFECT_WORKS.ghost({} as never) && EFFECT_WORKS.crease({} as never)).toBe(true);
});

test('the fold crease shows only while it is on, and only turns off', async () => {
  open(docOf(box()));
  update(s => { s.S.crease = true; }, { history: false });
  render(<Live />);
  await fold('Paper effects');
  const c = screen.getByRole('switch', { name: 'Fold crease' });
  expect(c).toBeChecked();
  await userEvent.click(c);
  expect(get().S.crease).toBe(false);
  expect(screen.queryByRole('switch', { name: 'Fold crease' })).toBeNull();
});

test('the fold crease switch is absent while it is off', async () => {
  open(docOf(box())); render(<Live />);
  await fold('Paper effects');
  expect(screen.queryByRole('switch', { name: 'Fold crease' })).toBeNull();
});

test('How natural: a preset, or Fine-tuned by you', async () => {
  open(docOf(box())); render(<Live />);
  expect(screen.getByRole('button', { name: 'Natural' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByText('Fine-tuned by you.')).toBeNull();
  await fold('Fine-tune');
  screen.getByRole('slider', { name: 'Letter wobble' }).focus();
  await userEvent.keyboard('{ArrowRight}');
  expect(within(screen.getByRole('group', { name: 'How natural' })).queryByRole('button', { pressed: true })).toBeNull();
  expect(screen.getByText('Fine-tuned by you.')).toBeInTheDocument();
});

test('Fine-tune holds the five realism sliders, folded away', async () => {
  open(docOf(box())); render(<Live />);
  expect(screen.queryByRole('slider', { name: 'Mistakes' })).toBeNull();
  await fold('Fine-tune');
  expect(['Natural movement', 'Vary each letter', 'Letter wobble', 'Ink flow', 'Mistakes'].map(n => screen.getByRole('slider', { name: n }))).toHaveLength(5);
});

test('letter and word spacing are folded away', async () => {
  open(docOf(box())); render(<Live />);
  expect(screen.getByRole('slider', { name: 'Letter size' })).toBeInTheDocument();
  expect(screen.getByRole('slider', { name: 'Line spacing' })).toBeInTheDocument();
  expect(screen.queryByRole('slider', { name: 'Letter spacing' })).toBeNull();
  await fold('Letter and word spacing');
  expect(screen.getByRole('slider', { name: 'Word spacing' })).toBeInTheDocument();
  expect(screen.getByRole('slider', { name: 'Letter spacing' })).toBeInTheDocument();
});
