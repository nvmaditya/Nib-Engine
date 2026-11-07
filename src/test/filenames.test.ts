// No two files under src/ may differ only in letter case once the extension is dropped. On a case-insensitive disk
// (macOS, Windows) `import … from './Tips'` tries `./Tips.ts` before `./Tips.tsx`, and `Tips.ts` finds `tips.ts`:
// the wrong module would load, with no error until something it lacks is used.
import { readdirSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every file under `dir`, as a path relative to src/ with `/` between its parts. */
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const at = join(dir, e.name);
    return e.isDirectory() ? files(at) : [relative(SRC, at).split(/[\\/]/).join('/')];
  });
}

/** Files whose paths, without their last extension, are the same but for letter case: each such group, sorted. */
function caseClashes(paths: string[]): string[][] {
  const groups = new Map<string, Set<string>>();
  for (const p of paths) {
    const bare = p.slice(0, p.length - extname(p).length);
    const key = bare.toLowerCase();
    groups.set(key, (groups.get(key) ?? new Set()).add(p));
  }
  return [...groups.values()]
    .filter(g => new Set([...g].map(p => p.slice(0, p.length - extname(p).length))).size > 1)
    .map(g => [...g].sort());
}

test('no two files under src/ differ only in letter case once the extension is dropped', () => {
  expect(caseClashes(files(SRC))).toEqual([]);
});

test('the check finds a case-only pair in a folder, but not a .ts beside its own .tsx or .d.ts', () => {
  expect(caseClashes(['shell/overlays.ts', 'shell/Overlays.tsx', 'shell/AppMenu.tsx'])).toEqual([['shell/Overlays.tsx', 'shell/overlays.ts']]);
  expect(caseClashes(['doc/tips.ts', 'doc/Tips.tsx', 'doc/Tips.test.tsx'])).toEqual([['doc/Tips.tsx', 'doc/tips.ts']]);
  expect(caseClashes(['Write/a.ts', 'write/b.ts', 'write/A.ts'])).toEqual([['Write/a.ts', 'write/A.ts']]);
  expect(caseClashes(['engine/core.js', 'engine/core.d.ts', 'app/App.tsx', 'app/App.test.tsx', 'lib/media.ts', 'test/media.ts'])).toEqual([]);
});
