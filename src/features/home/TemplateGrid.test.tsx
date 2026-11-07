import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateGrid } from './TemplateGrid';
import { openTemplate, TEMPLATES } from './templates';
import { thumbFor } from './thumbs';

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

test('a card makes that template’s document, and meanwhile the cards wait', async () => {
  let done!: (v: boolean) => void; vi.mocked(openTemplate).mockReturnValue(new Promise(r => { done = r; }));
  render(<TemplateGrid />); const letter = screen.getByRole('button', { name: /^Letter/ });
  await userEvent.click(letter); await userEvent.click(letter);
  expect(openTemplate).toHaveBeenCalledTimes(1); expect(openTemplate).toHaveBeenCalledWith('letter'); expect(letter).toBeDisabled();
  await act(async () => done(true)); expect(letter).toBeEnabled();
});
