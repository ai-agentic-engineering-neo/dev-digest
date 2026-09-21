/**
 * specs/09-project-context-folder.md — path containment (AC-27).
 *
 * No DB, no fs mocking: builds a real tmpdir fixture (checkout + a symlink
 * escaping it) and asserts `resolveContainedPath`/`isRelativeSafePath`
 * refuse every escape shape, never read the target, and give distinct
 * reasons for "escapes" vs "doesn't exist".
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ContainmentError,
  MissingPathError,
  isRelativeSafePath,
  resolveContainedPath,
} from '../src/modules/_shared/checkout-paths.js';

describe('isRelativeSafePath', () => {
  it('accepts ordinary repository-relative paths', () => {
    expect(isRelativeSafePath('specs/foo.md')).toBe(true);
    expect(isRelativeSafePath('.devdigest/specs/bar.md')).toBe(true);
    expect(isRelativeSafePath('a')).toBe(true);
  });

  it('rejects absolute paths', () => {
    expect(isRelativeSafePath('/etc/passwd')).toBe(false);
  });

  it('rejects any `..` segment, anywhere in the path', () => {
    expect(isRelativeSafePath('../secrets.md')).toBe(false);
    expect(isRelativeSafePath('specs/../../etc/passwd')).toBe(false);
    expect(isRelativeSafePath('specs/..')).toBe(false);
  });

  it('rejects empty string, "~", backslashes, and empty segments', () => {
    expect(isRelativeSafePath('')).toBe(false);
    expect(isRelativeSafePath('~/x.md')).toBe(false);
    expect(isRelativeSafePath('a\\b.md')).toBe(false);
    expect(isRelativeSafePath('a//b.md')).toBe(false);
  });

  it('round-trips paths with spaces, non-ASCII, and "#" unchanged', () => {
    for (const p of ['specs/a b.md', 'specs/résumé.md', 'specs/a#b.md']) {
      expect(isRelativeSafePath(p)).toBe(true);
    }
  });
});

describe('resolveContainedPath', () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'project-context-paths-'));
    outside = await mkdtemp(join(tmpdir(), 'project-context-paths-outside-'));
    await mkdir(join(root, 'specs'), { recursive: true });
    await writeFile(join(root, 'specs', 'a.md'), '# A');
    await writeFile(join(outside, 'secret.md'), '# secret');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('resolves an ordinary contained path', async () => {
    const resolved = await resolveContainedPath(root, 'specs/a.md');
    expect(resolved.endsWith(join('specs', 'a.md'))).toBe(true);
  });

  it('refuses a `..` escape without reading anything', async () => {
    await expect(resolveContainedPath(root, '../outside/secret.md')).rejects.toThrow(
      ContainmentError,
    );
  });

  it('refuses an absolute path', async () => {
    await expect(resolveContainedPath(root, join(outside, 'secret.md'))).rejects.toThrow(
      ContainmentError,
    );
  });

  it('refuses a symlink whose target escapes the checkout', async () => {
    await symlink(join(outside, 'secret.md'), join(root, 'specs', 'escape.md'));
    await expect(resolveContainedPath(root, 'specs/escape.md')).rejects.toThrow(ContainmentError);
  });

  it('a symlink that stays INSIDE the checkout still resolves', async () => {
    await symlink(join(root, 'specs', 'a.md'), join(root, 'specs', 'alias.md'));
    const resolved = await resolveContainedPath(root, 'specs/alias.md');
    expect(resolved.endsWith(join('specs', 'a.md'))).toBe(true);
  });

  it('a missing path throws MissingPathError, distinct from a containment refusal', async () => {
    await expect(resolveContainedPath(root, 'specs/does-not-exist.md')).rejects.toThrow(
      MissingPathError,
    );
  });

  it('paths with spaces / non-ASCII / "#" round-trip unchanged', async () => {
    await writeFile(join(root, 'specs', 'a b résumé#1.md'), '# weird name');
    const resolved = await resolveContainedPath(root, 'specs/a b résumé#1.md');
    expect(resolved).toContain('a b résumé#1.md');
  });
});
