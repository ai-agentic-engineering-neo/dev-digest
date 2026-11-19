import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readContainedFile } from '../src/platform/contained-read.js';
import { parseChangedFiles } from '../src/adapters/astgrep/index.js';

/**
 * S6 — a cloned repo is untrusted: a committed symlink must never let a read
 * escape the clone (into ~/.devdigest/secrets.json, .env, …).
 */
describe('readContainedFile', () => {
  let base: string;
  let clone: string;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'dd-contained-'));
    clone = join(base, 'clone');
    await mkdir(join(clone, 'src'), { recursive: true });
    // Parseable TS, so a leaked read would surface as an extra symbol.
    await writeFile(join(base, 'secret.env'), 'export function leakedSecret() { return 1; }\n');
    await writeFile(join(clone, 'src', 'ok.ts'), 'export const ok = 1;\n');
    await symlink(join(base, 'secret.env'), join(clone, 'src', 'evil.ts'));
    await symlink('ok.ts', join(clone, 'src', 'alias.ts'));
    await writeFile(join(clone, 'big.txt'), 'x'.repeat(64));
  });

  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('reads a regular file inside the clone', async () => {
    expect(await readContainedFile(clone, 'src/ok.ts')).toBe('export const ok = 1;\n');
  });

  it('follows a symlink that stays inside the clone', async () => {
    expect(await readContainedFile(clone, 'src/alias.ts')).toBe('export const ok = 1;\n');
  });

  it('refuses a symlink pointing outside the clone', async () => {
    expect(await readContainedFile(clone, 'src/evil.ts')).toBeNull();
  });

  it('refuses ../ traversal, absolute paths, directories and oversize files', async () => {
    expect(await readContainedFile(clone, '../secret.env')).toBeNull();
    expect(await readContainedFile(clone, join(base, 'secret.env'))).toBeNull();
    expect(await readContainedFile(clone, 'src')).toBeNull();
    expect(await readContainedFile(clone, 'big.txt', { maxBytes: 10 })).toBeNull();
    expect(await readContainedFile(clone, 'missing.ts')).toBeNull();
  });

  it('the diff-scoped ast-grep parse skips an escaping symlink', async () => {
    const both = await parseChangedFiles(clone, ['src/ok.ts', 'src/evil.ts']);
    const okOnly = await parseChangedFiles(clone, ['src/ok.ts']);
    expect(both.symbols).toEqual(okOnly.symbols);
    expect(JSON.stringify(both)).not.toContain('leakedSecret');
  });
});
