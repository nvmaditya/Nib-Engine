import { expect, test } from 'vitest';
import { typing } from './typing';

const el = (html: string, pick = '[data-pick]') => { document.body.innerHTML = html; return document.querySelector(pick); };

test('a field or an editor is where keys are typed', () => {
  for (const html of ['<input data-pick>', '<input type="checkbox" data-pick>', '<textarea data-pick></textarea>', '<select data-pick></select>',
    '<div contenteditable="true" data-pick></div>', '<div contenteditable="" data-pick></div>', '<div contenteditable="true"><p><b data-pick>x</b></p></div>']) {
    expect(typing(el(html)), html).toBe(true);
  }
});

test('anything else is not', () => {
  for (const html of ['<button data-pick></button>', '<div tabindex="0" data-pick></div>', '<div contenteditable="false" data-pick></div>', '<a href="#" data-pick></a>',
    // a control in an editor's widget (a page break's line), which the editor leaves alone
    '<div contenteditable="true"><div contenteditable="false"><button data-pick></button></div></div>']) {
    expect(typing(el(html)), html).toBe(false);
  }
  expect(typing(null)).toBe(false);
  expect(typing(window)).toBe(false);
  expect(typing(document)).toBe(false);
});
