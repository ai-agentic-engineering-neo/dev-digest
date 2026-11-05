import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

/**
 * readFile must not leave the clone: a cloned repo can contain a symlink that
 * points outside it (e.g. tsconfig.json -> ../../../.env), and readFile callers
 * send file contents to an LLM. Directory junctions work on Windows without admin.
 */
describe('SimpleGitClient.readFile — clone boundary', () => {
  let base: string;
  let client: SimpleGitClient;
  const repo = { owner: 'acme', name: 'app' };

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'git-guard-'));
    const clones = join(base, 'clones');
    const clone = join(clones, 'acme', 'app');
    const outside = join(base, 'outside');
    mkdirSync(join(clone, 'src'), { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(clone, 'src', 'a.ts'), 'export const a = 1;\n');
    writeFileSync(join(outside, 'secret.env'), 'TOKEN=shh\n');
    symlinkSync(outside, join(clone, 'linked'), 'junction');
    mkdirSync(join(clone, 'inner'), { recursive: true });
    symlinkSync(join(clone, 'src'), join(clone, 'inner', 'src-link'), 'junction');
    // git metadata inside the clone, reachable through an in-clone link
    mkdirSync(join(clone, '.git'), { recursive: true });
    writeFileSync(join(clone, '.git', 'config'), '[remote "origin"]\n\turl = https://x:ghp_token@github.com/a/b\n');
    symlinkSync(join(clone, '.git'), join(clone, 'cfg'), 'junction');
    client = new SimpleGitClient(clones);
  });
  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it('reads files inside the clone, including through an in-clone link', async () => {
    expect(await client.readFile(repo, 'src/a.ts')).toContain('export const a');
    expect(await client.readFile(repo, 'inner/src-link/a.ts')).toContain('export const a');
  });

  it('refuses a link that resolves outside the clone, and .. paths', async () => {
    await expect(client.readFile(repo, 'linked/secret.env')).rejects.toThrow(/outside the clone/);
    await expect(client.readFile(repo, '../../../outside/secret.env')).rejects.toThrow(/outside the clone/);
  });

  it('refuses .git metadata, directly or through a link that stays inside the clone', async () => {
    await expect(client.readFile(repo, '.git/config')).rejects.toThrow(/git metadata/);
    await expect(client.readFile(repo, 'cfg/config')).rejects.toThrow(/git metadata/);
  });
});
