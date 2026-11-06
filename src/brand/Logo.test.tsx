import { render, screen } from '@testing-library/react';
import { Logo } from './Logo';

test('ink logo is labelled and uses the ink background', () => {
  render(<Logo size={16} />);
  const svg = screen.getByRole('img', { name: 'Nib' });
  expect(svg).toHaveAttribute('width', '16');
  expect(svg.querySelector('rect')!.getAttribute('style')).toContain('#1E2B7C');
});

test('paper variant uses paper', () => {
  render(<Logo variant="paper" />);
  expect(screen.getByRole('img', { name: 'Nib' }).querySelector('rect')!.getAttribute('style')).toContain('#FBFBF7');
});
