import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { simpleGit } from 'simple-git';
import { RepoInput } from '@devdigest/shared';
import { parseRepoUrl } from '../src/modules/repos/helpers.js';
import {
  SimpleGitClient,
  githubAuthConfig,
  stripUrlCredentials,
} from '../src/adapters/git/simple-git.js';

/**
 * Phase 0 security: repo URLs must not escape the clone dir (path traversal),
 * and the GitHub PAT must never be persisted into a clone's .git/config.
 */

describe('parseRepoUrl — anchored GitHub URL parsing', () => {
  it.each([
    ['https://github.com/acme/widgets', 'acme', 'widgets'],
    ['https://github.com/acme/widgets.git', 'acme', 'widgets'],
    ['https://github.com/acme/widgets/', 'acme', 'widgets'],
    ['https://github.com/vercel/next.js', 'vercel', 'next.js'],
    ['https://github.com/acme/.github', 'acme', '.github'],
    ['https://github.com/my_org/my-repo_2', 'my_org', 'my-repo_2'],
    ['git@github.com:acme/widgets.git', 'acme', 'widgets'],
    ['git@github.com:acme/widgets', 'acme', 'widgets'],
  ])('accepts %s', (url, owner, name) => {
    expect(parseRepoUrl(url)).toEqual({ owner, name });
  });

  it.each([
    'https://github.com/../src',
    'https://github.com/acme/..',
    'https://github.com/./widgets',
    'https://github.com/acme/.',
    'https://github.com/-acme/widgets',
    'https://github.com/acme/-widgets',
    'https://github.com/acme/.git',
    'https://evil.com/github.com/acme/widgets',
    'https://github.com.evil.com/acme/widgets',
    'http://github.com/acme/widgets',
    'https://github.com/acme/widgets/tree/main',
    'https://github.com/acme/wid gets',
    'https://github.com/acme/widgets?x=1',
    'https://user:pass@github.com/acme/widgets',
    'https://github.com/acme%2F..%2F/widgets',
    'git@github.com:../widgets.git',
    'file:///etc/passwd',
    '',
  ])('rejects %s', (url) => {
    expect(() => parseRepoUrl(url)).toThrow(/Could not parse/);
  });
});

describe('RepoInput contract', () => {
  it('accepts https and ssh GitHub URLs', () => {
    expect(RepoInput.safeParse({ url: 'https://github.com/acme/widgets' }).success).toBe(true);
    expect(RepoInput.safeParse({ url: 'git@github.com:acme/widgets.git' }).success).toBe(true);
  });

  it('rejects traversal and non-GitHub URLs with a friendly message', () => {
    for (const url of ['https://github.com/../src', 'https://gitlab.com/acme/widgets']) {
      const r = RepoInput.safeParse({ url });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]!.message).toMatch(/GitHub repository URL/);
    }
  });
});

describe('SimpleGitClient.clonePathFor — confined to cloneDir', () => {
  const cloneDir = '/tmp/devdigest-clones-test';
  const git = new SimpleGitClient(cloneDir);

  it('resolves owner/name under cloneDir', () => {
    expect(git.clonePathFor({ owner: 'acme', name: 'widgets' })).toBe(
      resolve(cloneDir, 'acme', 'widgets'),
    );
  });

  it.each([
    { owner: '..', name: 'src' },
    { owner: 'acme', name: '..' },
    { owner: '.', name: 'x' },
    { owner: 'a/../..', name: 'x' },
    { owner: '/etc', name: 'passwd' },
    { owner: '', name: 'x' },
    { owner: 'acme', name: '' },
  ])('throws for %o', (ref) => {
    expect(() => git.clonePathFor(ref)).toThrow(/outside the clone directory|Invalid/);
  });
});

describe('SimpleGitClient.readFile — confined to the repo clone', () => {
  let cloneDir: string;
  let client: SimpleGitClient;
  const ref = { owner: 'acme', name: 'widgets' };

  beforeAll(async () => {
    cloneDir = await mkdtemp(join(tmpdir(), 'devdigest-readfile-'));
    client = new SimpleGitClient(cloneDir);
    const repoDir = client.clonePathFor(ref);
    await mkdir(join(repoDir, 'src'), { recursive: true });
    await writeFile(join(repoDir, 'src', 'a.ts'), 'export const a = 1;\n');
    // A sibling repo's file and a file directly in cloneDir — both outside `ref`.
    await mkdir(join(cloneDir, 'acme', 'other'), { recursive: true });
    await writeFile(join(cloneDir, 'acme', 'other', 'secret.txt'), 'nope');
    await writeFile(join(cloneDir, 'root.txt'), 'nope');
  });
  afterAll(async () => {
    await rm(cloneDir, { recursive: true, force: true });
  });

  it('reads a file inside the clone', async () => {
    await expect(client.readFile(ref, 'src/a.ts')).resolves.toContain('export const a');
    await expect(client.readFile(ref, './src/../src/a.ts')).resolves.toContain('export const a');
  });

  it.each(['../other/secret.txt', '../../root.txt', '/etc/passwd', 'src/../../other/secret.txt', '.', ''])(
    'throws for %s',
    async (path) => {
      await expect(client.readFile(ref, path)).rejects.toThrow(/outside the clone/);
    },
  );
});

describe('git auth is per-command, never persisted', () => {
  it('githubAuthConfig scopes a Basic extraHeader to https://github.com/', () => {
    const [entry, ...rest] = githubAuthConfig('tok123');
    expect(rest).toHaveLength(0);
    const expected = Buffer.from('x-access-token:tok123').toString('base64');
    expect(entry).toBe(`http.https://github.com/.extraHeader=Authorization: Basic ${expected}`);
  });

  it('stripUrlCredentials removes user:token from an https URL', () => {
    expect(stripUrlCredentials('https://x-access-token:SECRET@github.com/acme/w.git')).toBe(
      'https://github.com/acme/w.git',
    );
    expect(stripUrlCredentials('https://github.com/acme/w.git')).toBe(
      'https://github.com/acme/w.git',
    );
    expect(stripUrlCredentials('git@github.com:acme/w.git')).toBe('git@github.com:acme/w.git');
  });

  describe('real git (local origin)', () => {
    let root: string;
    let origin: string;
    const TOKEN = 'ghp_SUPERSECRET_should_never_be_written';

    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), 'dd-git-sec-'));
      origin = join(root, 'origin');
      await mkdir(origin);
      const o = simpleGit(origin);
      await o.init(['-b', 'main']);
      await o.addConfig('user.email', 't@t');
      await o.addConfig('user.name', 't');
      await writeFile(join(origin, 'a.txt'), 'hello');
      await o.add('a.txt');
      await o.commit('init');
    });
    afterAll(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it('clone with a token leaves no token in .git/config', async () => {
      const client = new SimpleGitClient(join(root, 'clones'), async () => TOKEN);
      const { path } = await client.clone({ owner: 'acme', name: 'w' }, `file://${origin}`, {
        depth: 1,
      });
      const cfg = await readFile(join(path, '.git', 'config'), 'utf8');
      expect(cfg).not.toContain(TOKEN);
      expect(cfg).not.toContain('extraHeader');
      expect(cfg).not.toContain('extraheader');
    });

    it('re-clone of an existing clone scrubs a token-bearing origin URL', async () => {
      const client = new SimpleGitClient(join(root, 'clones'), async () => TOKEN);
      const ref = { owner: 'acme', name: 'w' };
      const g = simpleGit(client.clonePathFor(ref));
      // Simulate a legacy clone made with a token-embedded URL. Point it at a
      // github.com URL; the scrub must run before any network fetch, so swap
      // back to the local origin only via the clean-URL path below.
      await g.remote(['set-url', 'origin', `https://x-access-token:${TOKEN}@github.com/acme/w.git`]);
      await client.scrubOrigin(ref);
      const url = (await g.remote(['get-url', 'origin'])) as string;
      expect(url.trim()).toBe('https://github.com/acme/w.git');
      const cfg = await readFile(join(client.clonePathFor(ref), '.git', 'config'), 'utf8');
      expect(cfg).not.toContain(TOKEN);
    });
  });
});
