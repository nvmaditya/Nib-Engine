import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App';

test('a missing document goes home with a message', async () => {
  location.hash = '#/d/missing/write';
  render(<App />);
  await waitFor(() => expect(location.hash).toBe('#/'));
  expect(await screen.findByText('That document isn’t on this device.')).toBeInTheDocument();
});

test('blocked storage opens the document in memory and Home lists it', async () => {
  vi.resetModules();
  vi.doMock('./LegacyDocument.jsx', () => ({ default: () => null }));
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
