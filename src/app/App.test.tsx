import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App';

test('a missing document goes home with a message', async () => {
  location.hash = '#/d/missing/write';
  render(<App />);
  await waitFor(() => expect(location.hash).toBe('#/'));
  expect(await screen.findByText('That document isn’t on this device.')).toBeInTheDocument();
});
