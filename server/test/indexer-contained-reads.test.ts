import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseChangedFiles } from '../src/adapters/astgrep/index.js';

/**
 * S6 — the diff-scoped ast-grep parse (and the indexer pipelines, which use
 * the same readContainedFile) must not follow a committed symlink out of the
 * clone: whatever it reads becomes symbols in the index and the prompt.
 */
describe('ast-grep diff parse — symlink containment', () => {
  let base: string;
  let clone: string;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'dd-index-'));
    clone = join(base, 'clone');
    await mkdir(join(clone, 'src'), { recursive: true });
    // Parseable TS outside the clone, so a leaked read would surface as a symbol.
    await writeFile(join(base, 'outside.ts'), 'export function leakedSecret() { return 1; }\n');
    await writeFile(join(clone, 'src', 'ok.ts'), 'export function insideClone() { return 2; }\n');
    await symlink(join(base, 'outside.ts'), join(clone, 'src', 'evil.ts'));
  });

  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('parses files inside the clone and skips an escaping symlink', async () => {
    const res = await parseChangedFiles(clone, ['src/ok.ts', 'src/evil.ts']);
    const dump = JSON.stringify(res);
    expect(dump).toContain('insideClone');
    expect(dump).not.toContain('leakedSecret');
  });
});
