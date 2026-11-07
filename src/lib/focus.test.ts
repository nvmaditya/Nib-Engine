import { afterEach, expect, test } from 'vitest';
import { giveFocusBack, installFocusMemory, rememberedFocus } from './focus';

const button = (name: string, parent: HTMLElement = document.body): HTMLButtonElement => {
  const b = document.createElement('button');
  b.textContent = name;
  parent.append(b);
  return b;
};

afterEach(() => { document.body.innerHTML = ''; });

test('remembers focus outside the messages, and gives it back only when it was lost', () => {
  const off = installFocusMemory();
  const toaster = document.createElement('ol');
  toaster.setAttribute('data-sonner-toaster', '');
  document.body.append(toaster);
  const write = button('Write'), other = button('Other'), undo = button('Undo', toaster);

  write.focus();
  expect(rememberedFocus()).toBe(write);
  undo.focus(); // a message's button is never what had the focus
  expect(rememberedFocus()).toBe(write);

  giveFocusBack(write); // the focus is on a message's button: it goes back
  expect(write).toHaveFocus();

  other.focus();
  giveFocusBack(write); // the focus is somewhere else on purpose: it stays there
  expect(other).toHaveFocus();

  other.blur(); // lost to the page itself
  expect(document.activeElement).toBe(document.body);
  giveFocusBack(write);
  expect(write).toHaveFocus();

  undo.focus();
  giveFocusBack(null);
  expect(undo).toHaveFocus();

  // Never to something gone, or inert, or hidden.
  const gone = button('Gone'); gone.remove();
  giveFocusBack(gone);
  expect(undo).toHaveFocus();
  const inert = document.createElement('div'); inert.setAttribute('inert', ''); document.body.append(inert);
  giveFocusBack(button('Behind a dialog', inert));
  expect(undo).toHaveFocus();
  const hidden = document.createElement('div'); hidden.hidden = true; document.body.append(hidden);
  giveFocusBack(button('In a hidden stage', hidden));
  expect(undo).toHaveFocus();

  off();
  other.focus();
  expect(rememberedFocus()).toBe(write); // no longer listening
});
