import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConventionsSampleSet } from '../src/modules/conventions/samples.js';
import { ValidationError } from '../src/platform/errors.js';
import type { Container } from '../src/platform/container.js';

/**
 * Sample selection is code-only — no model call. Config files come straight
 * off the clone; source files come from `repoIntel.getConventionSamples`
 * (already implemented, just never called before this feature).
 */
describe('getConventionsSampleSet', () => {
  let clonePath: string | undefined;

  afterEach(async () => {
    if (clonePath) await rm(clonePath, { recursive: true, force: true });
    clonePath = undefined;
  });

  it('reads config files that exist, skips ones that do not, and reads repoIntel-picked source files', async () => {
    clonePath = await mkdtemp(join(tmpdir(), 'devdigest-conv-'));
    await writeFile(join(clonePath, 'tsconfig.json'), '{"compilerOptions":{}}');
    await writeFile(join(clonePath, '.eslintrc.json'), '{"rules":{}}');
    await mkdir(join(clonePath, 'src'), { recursive: true });
    await writeFile(join(clonePath, 'src', 'foo.ts'), 'export const foo = 1;');

    const container = {
      repoIntel: { getConventionSamples: async () => ['src/foo.ts'] },
      git: { currentHead: async () => 'abc123' },
    } as unknown as Container;

    const sample = await getConventionsSampleSet(container, {
      id: 'repo-1',
      owner: 'acme',
      name: 'demo',
      clonePath,
    });

    expect(sample.configFiles).toEqual(
      expect.arrayContaining([
        { path: 'tsconfig.json', content: '{"compilerOptions":{}}' },
        { path: '.eslintrc.json', content: '{"rules":{}}' },
      ]),
    );
    // .prettierrc etc. were never written — must not appear.
    expect(sample.configFiles).toHaveLength(2);
    expect(sample.sourceFiles).toEqual([{ path: 'src/foo.ts', content: 'export const foo = 1;' }]);
    expect(sample.sourceSha).toBe('abc123');
  });

  it('throws when the repo has never been cloned (clonePath is null)', async () => {
    const container = {
      repoIntel: { getConventionSamples: async () => [] },
      git: { currentHead: async () => 'abc123' },
    } as unknown as Container;

    await expect(
      getConventionsSampleSet(container, { id: 'repo-1', owner: 'acme', name: 'demo', clonePath: null }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
