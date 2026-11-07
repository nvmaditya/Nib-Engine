import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanSettings } from '@/engine/doc.js';
import { getDb } from '@/store/db';
import { getPref } from '@/store/documents';
import { box, docOf, fontsLoad, lines } from '@/test/docs';
import { PageThumb } from './PageThumb';
import { clearThumbMemory, thumbFor } from './thumbs';

const S = cleanSettings(null, false), two = () => docOf(box({ id: 'm', text: lines(40) }));
beforeEach(async () => { clearThumbMemory(); await (await getDb()).clear('prefs'); fontsLoad(); });
afterEach(() => { vi.unstubAllGlobals(); });

test('the paper’s colour until page 1 is drawn, then the picture, and the page count', async () => {
  const onPages = vi.fn(), { container } = render(<PageThumb owner="doc:p" S={S} doc={two()} px={156} onPages={onPages} />);
  const tile = container.querySelector<HTMLElement>('[data-owner="doc:p"]')!;
  expect(tile.style.background).toBe('rgb(251, 251, 247)'); expect(tile.querySelector('img')).toBeNull();
  await waitFor(() => expect(tile.querySelector('img')).toHaveAttribute('src', expect.stringMatching(/^data:image\/jpeg;base64,/)));
  expect(tile.querySelector('img')).toHaveAttribute('alt', ''); expect(onPages).toHaveBeenCalledWith(2);
});
test('a thumbnail already kept shows at once', async () => {
  const d = two(); await thumbFor('doc:q', S, d, 156);
  const { container } = render(<PageThumb owner="doc:q" S={S} doc={d} px={156} />); expect(container.querySelector('img')).not.toBeNull();
});
test('one far out of view waits until it comes near', async () => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} }); // never intersecting
  render(<PageThumb owner="doc:r" S={S} doc={two()} px={156} />); await act(() => new Promise(r => setTimeout(r, 50)));
  expect(await getPref('thumb:doc:r')).toBeUndefined();
});
