import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConventionsSampleSet, readClone } from '../src/modules/conventions/samples.js';
import { RepoIntelService, spreadPick } from '../src/modules/repo-intel/service.js';

let clone: string;

beforeAll(async () => {
  clone = await mkdtemp(join(tmpdir(), 'conv-samples-'));
  await mkdir(join(clone, 'src/api'), { recursive: true });
  await mkdir(join(clone, 'src/__tests__'), { recursive: true });
  await writeFile(join(clone, 'tsconfig.json'), '{ "compilerOptions": { "strict": true } }');
  await writeFile(join(clone, 'src/api/users.ts'), 'export const users = 1;');
  await writeFile(join(clone, 'src/lib.ts'), 'export const lib = 1;');
  await writeFile(join(clone, 'src/__tests__/users.test.ts'), 'test();');
});
afterAll(async () => {
  await rm(clone, { recursive: true, force: true });
});

describe('getConventionsSampleSet', () => {
  it('reads existing config files and the source paths repo-intel picks, skipping missing ones', async () => {
    const repoIntel = { getConventionSamples: async () => ['src/api/users.ts', 'src/gone.ts'] };
    const sample = await getConventionsSampleSet(repoIntel, { id: 'r1', clonePath: clone });
    expect(sample.configFiles.map((f) => f.path)).toEqual(['tsconfig.json']);
    expect(sample.sourceFiles).toEqual([{ path: 'src/api/users.ts', content: 'export const users = 1;' }]);
  });
});

describe('readClone', () => {
  it('refuses paths that escape the clone', async () => {
    expect(await readClone(join(clone, 'src'), '../tsconfig.json')).toBeNull();
    expect(await readClone(clone, '/etc/hosts')).toBeNull();
    expect(await readClone(clone, 'src/lib.ts')).toBe('export const lib = 1;');
  });
});

describe('RepoIntelService.getConventionSamples fallback', () => {
  it('walks the clone (minus tests) when there is no rank', async () => {
    const svc = new RepoIntelService({ config: { repoIntelEnabled: false }, db: {} } as never);
    (svc as unknown as { repo: Record<string, unknown> }).repo = {
      getRepoBasics: async () => ({ id: 'r1', owner: 'o', name: 'n', defaultBranch: 'main', clonePath: clone }),
    };
    expect(await svc.getConventionSamples('r1', 12)).toEqual(['src/api/users.ts', 'src/lib.ts']);
  });

  it('spreadPick takes an even cross-section', () => {
    expect(spreadPick(['a', 'b', 'c', 'd', 'e', 'f'], 3)).toEqual(['a', 'c', 'e']);
    expect(spreadPick(['a'], 3)).toEqual(['a']);
  });
});
