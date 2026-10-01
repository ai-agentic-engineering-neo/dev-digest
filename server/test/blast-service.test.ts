import { describe, it, expect, vi } from 'vitest';
import { BlastService } from '../src/modules/blast/service.js';
import { NotFoundError } from '../src/platform/errors.js';
import type { BlastRepo } from '../src/modules/blast/repository.js';
import type { RepoIntel, BlastResult } from '../src/modules/repo-intel/types.js';

const result: BlastResult = {
  changedSymbols: [{ file: 'a.ts', name: 'a', kind: 'function' }],
  callers: [],
  impactedEndpoints: [],
};

function make(scope: { repoId: string; headSha: string } | undefined) {
  const repo: BlastRepo = {
    getPullScope: vi.fn(async () => scope),
    getChangedPaths: vi.fn(async () => ['a.ts', 'b.ts']),
  };
  const getBlastRadius = vi.fn(async () => result);
  const repoIntel = { getBlastRadius } as unknown as RepoIntel;
  return { repo, getBlastRadius, service: new BlastService({ repo, repoIntel }) };
}

describe('BlastService.getBlast', () => {
  it('makes a single facade call with the PR paths and maps the result', async () => {
    const { service, getBlastRadius, repo } = make({ repoId: 'r1', headSha: 'sha' });
    const res = await service.getBlast('w1', 'p1');
    expect(repo.getPullScope).toHaveBeenCalledWith('w1', 'p1');
    expect(getBlastRadius).toHaveBeenCalledTimes(1);
    expect(getBlastRadius).toHaveBeenCalledWith('r1', ['a.ts', 'b.ts']);
    expect(res.changed_symbols).toHaveLength(1);
    expect(res.degraded).toBe(false);
  });

  it('throws NotFoundError and never calls the facade for a missing PR', async () => {
    const { service, getBlastRadius } = make(undefined);
    await expect(service.getBlast('w1', 'p1')).rejects.toBeInstanceOf(NotFoundError);
    expect(getBlastRadius).not.toHaveBeenCalled();
  });
});
