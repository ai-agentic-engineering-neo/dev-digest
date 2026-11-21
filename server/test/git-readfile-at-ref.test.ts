import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

/** repo-intel's per-file budget, passed explicitly as the indexer will. */
const MAX = 400 * 1024;

const repo = { owner: 'o', name: 'r' };
let root: string;
let dir: string;
let git: SimpleGitClient;
let sha1: string;
let sha2: string;

const run = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'gitref-'));
  dir = join(root, 'o', 'r');
  mkdirSync(join(dir, 'src'), { recursive: true });
  run('init', '-q');
  run('config', 'user.email', 't@t.t');
  run('config', 'user.name', 't');
  run('config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'src/a.ts'), 'v1\n');
  run('add', '.');
  run('commit', '-qm', 'one');
  sha1 = run('rev-parse', 'HEAD');
  writeFileSync(join(dir, 'src/a.ts'), 'v2\n');
  writeFileSync(join(dir, 'big.txt'), 'x'.repeat(401 * 1024));
  run('add', '.');
  run('commit', '-qm', 'two');
  sha2 = run('rev-parse', 'HEAD');
  git = new SimpleGitClient(root);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('GitClient.readFileAtRef / hasObject', () => {
  it('reads an older sha and leaves the working tree untouched', async () => {
    const status = run('status', '--porcelain');
    expect(await git.readFileAtRef(repo, sha1, 'src/a.ts', MAX)).toBe('v1\n');
    expect(await git.readFileAtRef(repo, sha2, 'src/a.ts', MAX)).toBe('v2\n');
    expect(readFileSync(join(dir, 'src/a.ts'), 'utf8')).toBe('v2\n');
    expect(run('rev-parse', 'HEAD')).toBe(sha2);
    expect(run('status', '--porcelain')).toBe(status);
  });

  it('returns null for a missing path, a directory, and an unknown sha', async () => {
    expect(await git.readFileAtRef(repo, sha1, 'nope.ts', MAX)).toBeNull();
    expect(await git.readFileAtRef(repo, sha1, 'src', MAX)).toBeNull();
    expect(await git.readFileAtRef(repo, 'a'.repeat(40), 'src/a.ts', MAX)).toBeNull();
  });

  it('rejects an invalid sha', async () => {
    for (const bad of ['HEAD', sha1.slice(0, 7), '--help', sha1.toUpperCase(), `${sha1}\n`]) {
      expect(await git.readFileAtRef(repo, bad, 'src/a.ts', MAX)).toBeNull();
    }
  });

  it('rejects traversal, absolute, NUL and non-normalised paths', async () => {
    for (const bad of ['../x', 'src/../src/a.ts', '/etc/passwd', 'src//a.ts', './src/a.ts', 'src/a.ts\0', 'src\\a.ts', '']) {
      expect(await git.readFileAtRef(repo, sha1, bad, MAX)).toBeNull();
    }
  });

  it('rejects option-injection paths', async () => {
    expect(await git.readFileAtRef(repo, sha1, '--output=/tmp/pwned', MAX)).toBeNull();
    expect(await git.readFileAtRef(repo, sha1, '-p', MAX)).toBeNull();
  });

  it('returns null for content over MAX_FILE_SIZE (and honours maxBytes)', async () => {
    expect(await git.readFileAtRef(repo, sha2, 'big.txt', MAX)).toBeNull();
    expect(await git.readFileAtRef(repo, sha2, 'big.txt', 1024 * 1024)).toHaveLength(401 * 1024);
    expect(await git.readFileAtRef(repo, sha2, 'src/a.ts', 1)).toBeNull();
  });

  it('hasObject: true for a present commit, false otherwise', async () => {
    expect(await git.hasObject(repo, sha1)).toBe(true);
    expect(await git.hasObject(repo, 'b'.repeat(40))).toBe(false);
    expect(await git.hasObject(repo, 'HEAD')).toBe(false);
  });
});
