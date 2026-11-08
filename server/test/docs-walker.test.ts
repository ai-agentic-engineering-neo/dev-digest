import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { FsDocWalker } from '../src/adapters/docs/index.js';

// Fixtures under cwd: on Windows a root on another drive than cwd behaves differently (server INSIGHTS).
let root: string;

async function put(rel: string, body = '# x\n'): Promise<void> {
  const full = join(root, ...rel.split('/'));
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, body);
}

beforeAll(async () => {
  root = await mkdtemp(join(process.cwd(), '.docs-walker-test-'));
  for (const rel of [
    'README.md',
    'docs/a.md',
    'docs/b.txt',
    'docs/img.png',
    'node_modules/x/docs/c.md',
    'server/src/vendor/docs/d.md',
    'clones/r/README.md',
    '.git/x.md',
  ]) {
    await put(rel);
  }
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('FsDocWalker (AC-1)', () => {
  it('lists only markdown outside excluded folders, as sorted POSIX paths', async () => {
    const out = await new FsDocWalker().listMarkdown(root);
    expect(out).toEqual(['README.md', 'docs/a.md']);
    expect(out.some((p) => p.includes('\\'))).toBe(false);
  });

  it('keeps upper-case .MD files and nested folders', async () => {
    await put('specs/deep/X.MD');
    try {
      expect(await new FsDocWalker().listMarkdown(root)).toContain('specs/deep/X.MD');
    } finally {
      await rm(join(root, 'specs'), { recursive: true, force: true });
    }
  });

  it('does not follow symlinks', async () => {
    const outside = await mkdtemp(join(process.cwd(), '.docs-walker-outside-'));
    try {
      await writeFile(join(outside, 'secret.md'), 'secret');
      try {
        await symlink(outside, join(root, 'linked'), 'junction');
      } catch {
        return; // symlinks not permitted on this machine — nothing to test
      }
      const out = await new FsDocWalker().listMarkdown(root);
      expect(out.some((p) => p.startsWith('linked'))).toBe(false);
    } finally {
      await rm(join(root, 'linked'), { recursive: true, force: true }).catch(() => undefined);
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('returns [] for a missing root', async () => {
    expect(await new FsDocWalker().listMarkdown(join(root, 'does-not-exist'))).toEqual([]);
  });
});
