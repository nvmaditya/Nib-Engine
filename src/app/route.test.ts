import { parseHash, formatRoute } from './route';

test.each([
  ['', { name: 'home' }],
  ['#', { name: 'home' }],
  ['#/', { name: 'home' }],
  ['#/nope', { name: 'home' }],
  ['#/d/abc', { name: 'doc', id: 'abc', stage: 'write' }],
  ['#/d/abc/style', { name: 'doc', id: 'abc', stage: 'style' }],
  ['#/d/abc/zzz', { name: 'doc', id: 'abc', stage: 'write' }],
])('parse %s', (h, r) => expect(parseHash(h)).toEqual(r));

test('format round-trips', () => {
  const r = { name: 'doc', id: 'x1', stage: 'export' } as const;
  expect(parseHash(formatRoute(r))).toEqual(r);
});
