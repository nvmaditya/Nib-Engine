import { applyTheme, getThemePref, setThemePref } from './theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

test('system preference follows the OS', () => {
  applyTheme('system', true);
  expect(document.documentElement).toHaveClass('dark');
  applyTheme('system', false);
  expect(document.documentElement).not.toHaveClass('dark');
});

test('explicit choice wins and is stored', () => {
  setThemePref('dark');
  expect(localStorage.getItem('nib.theme')).toBe('dark');
  expect(getThemePref()).toBe('dark');
  expect(document.documentElement).toHaveClass('dark');
});

test('unknown stored value falls back to system', () => {
  localStorage.setItem('nib.theme', 'pink');
  expect(getThemePref()).toBe('system');
});
