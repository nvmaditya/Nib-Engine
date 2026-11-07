import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateGrid } from './TemplateGrid';
import { openTemplate, TEMPLATES } from './templates';
import { thumbFor, thumbSig } from './thumbs';

vi.mock('./thumbs', async orig => ({
  ...(await orig<typeof import('./thumbs')>()),
  thumbFor: vi.fn(async () => ({ url: 'data:image/jpeg;base64,AAAA', pages: 1 })),
  peekThumb: vi.fn(() => null),
}));
vi.mock('./templates', async orig => ({ ...(await orig<typeof import('./templates')>()), openTemplate: vi.fn() }));

test('Start something new: six templates, each with its own page drawn', async () => {
  render(<TemplateGrid />);
  expect(screen.getByRole('heading', { level: 2, name: 'Start something new' })).toBeInTheDocument(); expect(screen.getByText('Each template starts with its own look. You can change everything later.')).toBeInTheDocument();
  expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(TEMPLATES.map(t => t.name + t.note));
  await waitFor(() => expect(document.querySelectorAll('img[src^="data:image/jpeg"]')).toHaveLength(6));
  expect(vi.mocked(thumbFor).mock.calls.map(c => [c[0], c[1].font, c[1].paper, c[3]])).toEqual([
    ['tpl:blank', 'labelle', 'ruled', 360], ['tpl:assignment', 'labelle', 'ruled', 360], ['tpl:notes', 'patrick', 'grid', 360],
    ['tpl:letter', 'cedarville', 'plain', 360], ['tpl:journal', 'caveat', 'yellow', 360], ['tpl:card', 'cedarville', 'plain', 360],
  ]);
});

test('Home shown again asks for the same pictures, so they come from the device instead of being drawn again', async () => {
  const sigs = () => vi.mocked(thumbFor).mock.calls.map(c => thumbSig(c[1], c[2], c[3]));
  vi.mocked(thumbFor).mockClear();
  const first = render(<TemplateGrid />); await waitFor(() => expect(thumbFor).toHaveBeenCalledTimes(6));
  const before = sigs(); first.unmount(); vi.mocked(thumbFor).mockClear();
  render(<TemplateGrid />); await waitFor(() => expect(thumbFor).toHaveBeenCalledTimes(6));
  expect(sigs()).toEqual(before);
  await waitFor(() => expect(document.querySelectorAll('img[src^="data:image/jpeg"]')).toHaveLength(6));
});

test('a card makes that template’s document, and meanwhile the cards wait', async () => {
  let done!: (v: boolean) => void; vi.mocked(openTemplate).mockReturnValue(new Promise(r => { done = r; }));
  render(<TemplateGrid />); const letter = screen.getByRole('button', { name: /^Letter/ });
  await userEvent.click(letter); await userEvent.click(letter);
  expect(openTemplate).toHaveBeenCalledTimes(1); expect(openTemplate).toHaveBeenCalledWith('letter'); expect(letter).toBeDisabled();
  await act(async () => done(true)); expect(letter).toBeEnabled();
});

test('when a template can’t be made, focus goes back to the card that was pressed', async () => {
  let done!: (v: boolean) => void; vi.mocked(openTemplate).mockReturnValue(new Promise(r => { done = r; }));
  render(<TemplateGrid />); const card = screen.getByRole('button', { name: /^Journal page/ });
  card.focus(); await userEvent.keyboard('{Enter}');
  card.blur(); expect(card).toBeDisabled(); // a browser drops focus from a disabled button
  await act(async () => done(false));
  expect(card).toBeEnabled(); expect(card).toHaveFocus();
});
