import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSpecFile } from '../src/modules/brief/clone.js';
import { MAX_SPEC_BYTES } from '../src/modules/brief/constants.js';

/**
 * specs/11-why-risk-brief.md — `readSpecFile` (planner finding 5): the
 * containment-checked spec-document read, distinct from `intent/clone.ts`'s
 * bare `readClone`. AC-7: every failure mode degrades to `null`, never
 * throws — this feature's fact assembly must never fail because a spec
 * reference turned out to be unreadable.
 */
describe('readSpecFile', () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'brief-clone-'));
    outside = await mkdtemp(join(tmpdir(), 'brief-clone-outside-'));
    await mkdir(join(root, 'specs'), { recursive: true });
    await writeFile(join(root, 'specs', '11-why-risk-brief.md'), '# Spec: PR Why + Risk Brief');
    await writeFile(join(outside, 'secret.md'), '# secret');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('reads a real, contained spec file', async () => {
    const content = await readSpecFile(root, 'specs/11-why-risk-brief.md');
    expect(content).toBe('# Spec: PR Why + Risk Brief');
  });

  it('AC-7: a missing file degrades to null rather than throwing', async () => {
    await expect(readSpecFile(root, 'specs/does-not-exist.md')).resolves.toBeNull();
  });

  it('AC-7: a `..` escape degrades to null rather than throwing, and never reads the target', async () => {
    await expect(readSpecFile(root, '../outside/secret.md')).resolves.toBeNull();
  });

  it('AC-7: a symlink whose target escapes the checkout degrades to null', async () => {
    await symlink(join(outside, 'secret.md'), join(root, 'specs', 'escape.md'));
    await expect(readSpecFile(root, 'specs/escape.md')).resolves.toBeNull();
  });

  it('a path that resolves to a directory, not a file, degrades to null', async () => {
    await expect(readSpecFile(root, 'specs')).resolves.toBeNull();
  });

  it(`a file larger than MAX_SPEC_BYTES (${MAX_SPEC_BYTES}) degrades to null rather than being truncated`, async () => {
    await writeFile(join(root, 'specs', 'huge.md'), 'x'.repeat(MAX_SPEC_BYTES + 1));
    await expect(readSpecFile(root, 'specs/huge.md')).resolves.toBeNull();
  });

  it('a file exactly at the MAX_SPEC_BYTES ceiling is still read in full', async () => {
    const body = 'x'.repeat(MAX_SPEC_BYTES);
    await writeFile(join(root, 'specs', 'exact.md'), body);
    await expect(readSpecFile(root, 'specs/exact.md')).resolves.toBe(body);
  });
});
