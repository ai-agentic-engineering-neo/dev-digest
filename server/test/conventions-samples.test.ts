import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConventionsSampleSet } from '../src/modules/conventions/samples.js';
import { ValidationError } from '../src/platform/errors.js';
import { CONFIG_SAMPLE_PATTERNS, SOURCE_SAMPLE_COUNT } from '../src/modules/conventions/constants.js';
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

/**
 * Characterization pins for SPEC-16. The object under test is always built via
 * `makeDeps()` / `makeContainer()` so Phase 2 only has to change those.
 */
function makeDeps(opts: { sourcePaths?: string[]; head?: string } = {}) {
  const getConventionSamples = vi.fn(async (_repoId: string, _n: number) => opts.sourcePaths ?? []);
  const currentHead = vi.fn(async (_repo: { owner: string; name: string }) => opts.head ?? 'sha-1');
  return { getConventionSamples, currentHead, repoIntel: { getConventionSamples }, git: { currentHead } };
}
function makeContainer(deps: ReturnType<typeof makeDeps>) {
  return { repoIntel: deps.repoIntel, git: deps.git } as unknown as Container;
}

describe('getConventionsSampleSet — pins', () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('returns configFiles in CONFIG_SAMPLE_PATTERNS order, not write/alphabetical order', async () => {
    dir = await mkdtemp(join(tmpdir(), 'devdigest-conv-'));
    // Written in reverse of the pattern order.
    await writeFile(join(dir, 'tsconfig.json'), 'ts');
    await writeFile(join(dir, '.prettierrc'), 'pr');
    await writeFile(join(dir, '.eslintrc.cjs'), 'cjs');
    await writeFile(join(dir, '.eslintrc'), 'plain');

    const res = await getConventionsSampleSet(makeContainer(makeDeps()), {
      id: 'r', owner: 'o', name: 'n', clonePath: dir,
    });

    expect(res.configFiles).toEqual([
      { path: '.eslintrc', content: 'plain' },
      { path: '.eslintrc.cjs', content: 'cjs' },
      { path: '.prettierrc', content: 'pr' },
      { path: 'tsconfig.json', content: 'ts' },
    ]);
    expect(res.configFiles.map((f) => f.path)).toEqual(
      CONFIG_SAMPLE_PATTERNS.filter((p) => ['.eslintrc', '.eslintrc.cjs', '.prettierrc', 'tsconfig.json'].includes(p)),
    );
  });

  it('asks repoIntel for SOURCE_SAMPLE_COUNT (=12) samples of the given repo id', async () => {
    dir = await mkdtemp(join(tmpdir(), 'devdigest-conv-'));
    const deps = makeDeps();
    await getConventionsSampleSet(makeContainer(deps), { id: 'repo-42', owner: 'o', name: 'n', clonePath: dir });
    expect(SOURCE_SAMPLE_COUNT).toBe(12);
    expect(deps.getConventionSamples).toHaveBeenCalledTimes(1);
    expect(deps.getConventionSamples).toHaveBeenCalledWith('repo-42', 12);
  });

  it('skips unreadable source files, keeps order of the readable ones', async () => {
    dir = await mkdtemp(join(tmpdir(), 'devdigest-conv-'));
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src', 'b.ts'), 'B');
    await writeFile(join(dir, 'src', 'a.ts'), 'A');
    const deps = makeDeps({ sourcePaths: ['src/b.ts', 'src/missing.ts', 'src/a.ts'] });

    const res = await getConventionsSampleSet(makeContainer(deps), { id: 'r', owner: 'o', name: 'n', clonePath: dir });

    expect(res.sourceFiles).toEqual([
      { path: 'src/b.ts', content: 'B' },
      { path: 'src/a.ts', content: 'A' },
    ]);
  });

  it('takes sourceSha from git.currentHead({owner,name}) and returns empty arrays for an empty clone', async () => {
    dir = await mkdtemp(join(tmpdir(), 'devdigest-conv-'));
    const deps = makeDeps({ head: 'deadbeef' });
    const res = await getConventionsSampleSet(makeContainer(deps), { id: 'r', owner: 'acme', name: 'demo', clonePath: dir });
    expect(res).toEqual({ configFiles: [], sourceFiles: [], sourceSha: 'deadbeef' });
    expect(deps.currentHead).toHaveBeenCalledWith({ owner: 'acme', name: 'demo' });
  });

  it('clonePath null → ValidationError with the exact message, before any dependency is touched', async () => {
    const deps = makeDeps();
    const err = await getConventionsSampleSet(makeContainer(deps), {
      id: 'r', owner: 'o', name: 'n', clonePath: null,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as Error).message).toBe('Repo has not been cloned yet — refresh it before extracting conventions');
    expect(deps.getConventionSamples).not.toHaveBeenCalled();
    expect(deps.currentHead).not.toHaveBeenCalled();
  });
});
