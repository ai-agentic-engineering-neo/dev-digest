import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkClone } from '../src/modules/repo-intel/pipeline/walk.js';
import { makeReadText } from '../src/modules/repo-intel/pipeline/index-rows.js';
import { TsModuleResolverFactory } from '../src/adapters/tsresolve/index.js';

// SPEC-18 edge case: "Symlink inside the clone pointing outside it — not
// followed; the target is treated as unresolved." Repository contents are
// attacker-controlled, so a planted symlink must never make the indexer read
// host files (walk, tsconfig reads) or resolve into them. Links are created at
// test time rather than committed: committed symlinks break on Windows/CI.
describe('repo-intel — symlinks never lead outside the clone', () => {
  let base: string;
  let clone: string;

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'devdigest-symlink-'));
    clone = join(base, 'clone');
    const outside = join(base, 'outside');
    mkdirSync(join(clone, 'src'), { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'secret.ts'), 'export const SECRET = 1;\n');
    writeFileSync(join(outside, 'tsconfig.json'), '{"compilerOptions":{"paths":{"@x/*":["../outside/*"]}}}');
    writeFileSync(join(clone, 'src', 'a.ts'), "import { SECRET } from './leak/secret';\nexport const a = SECRET;\n");
    symlinkSync(outside, join(clone, 'src', 'leak'), 'dir');
    symlinkSync(join(outside, 'secret.ts'), join(clone, 'src', 'linked.ts'), 'file');
    symlinkSync(join(outside, 'tsconfig.json'), join(clone, 'tsconfig.json'), 'file');
  });

  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('walkClone skips symlinked files and directories', async () => {
    const walk = await walkClone(clone);
    expect(walk.files).toEqual(['src/a.ts']);
    expect(walk.jsonFiles).toEqual([]);
  });

  it('makeReadText refuses a symlinked file even when it sits inside the clone', () => {
    const read = makeReadText(clone);
    expect(read('tsconfig.json')).toBeNull();
    expect(read('src/linked.ts')).toBeNull();
    expect(read('../outside/secret.ts')).toBeNull();
    expect(read('src/a.ts')).toContain('SECRET');
  });

  it('an import through a symlinked directory stays unresolved', async () => {
    const walk = await walkClone(clone);
    const r = new TsModuleResolverFactory().create({
      root: clone,
      files: new Set([...walk.files, ...walk.jsonFiles]),
      readText: makeReadText(clone),
    });
    expect(r.resolve('src/a.ts', './leak/secret')).toEqual({ kind: 'unresolved', reason: 'missing' });
    expect(r.tsconfigFailures()).toEqual([]);
  });
});
