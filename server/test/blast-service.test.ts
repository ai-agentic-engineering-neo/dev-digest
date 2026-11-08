import { describe, it, expect, vi } from 'vitest';
import { BlastService, type BlastDeps } from '../src/modules/blast/service.js';
import { BlastRadiusResponse } from '../src/modules/blast/schemas.js';
import { NotFoundError } from '../src/platform/errors.js';
import type { BlastIndexSnapshot, BlastIntelResult } from '../src/modules/blast/domain/types.js';

const WS = 'ws-1';
const PR_ID = '6f1c1a52-3b0e-4a57-9c1d-2f6a8b7d9e10';
const REPO_ID = 'repo-1';
const INDEX: BlastIndexSnapshot = { status: 'full', lastIndexedSha: 'idx-sha' };

const RESULT: BlastIntelResult = {
  changedSymbols: [{ name: 'createUser', file: 'src/a.ts', kind: 'function' }],
  callers: [{ file: 'src/b.ts', symbol: 'postUsers', viaFile: 'src/a.ts', viaSymbol: 'createUser', line: 7, rank: 1 }],
  impactedEndpoints: ['POST /users'],
  factsByFile: { 'src/b.ts': { endpoints: ['POST /users'], crons: [] } },
  callersOmitted: 0,
};

function makeDeps(over: { enabled?: boolean; paths?: string[] } = {}) {
  const getBlastRadius = vi.fn(async (_repoId: string, _files: string[]) => RESULT);
  const getIndexState = vi.fn(async (_repoId: string) => INDEX);
  const deps: BlastDeps = {
    reviewRepo: {
      // Only PR_ID in WS exists; any other workspace gets undefined.
      getPull: async (workspaceId, prId) =>
        workspaceId === WS && prId === PR_ID ? { id: PR_ID, repoId: REPO_ID, headSha: 'head-sha' } : undefined,
    },
    blastRepo: { listChangedPaths: async () => over.paths ?? ['src/a.ts', 'src/x.ts'] },
    repoIntel: { getBlastRadius, getIndexState },
    config: { repoIntelEnabled: over.enabled ?? true },
  };
  return { deps, getBlastRadius, getIndexState };
}

describe('BlastService.forPull', () => {
  it('throws NotFoundError for a PR of another workspace and never calls the facade', async () => {
    const { deps, getBlastRadius, getIndexState } = makeDeps();
    await expect(new BlastService(deps).forPull('other-ws', PR_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(getBlastRadius).not.toHaveBeenCalled();
    expect(getIndexState).not.toHaveBeenCalled();
  });

  it('skips the facade blast call when the PR has no changed paths', async () => {
    const { deps, getBlastRadius } = makeDeps({ paths: [] });
    const dto = await new BlastService(deps).forPull(WS, PR_ID);
    expect(getBlastRadius).not.toHaveBeenCalled();
    expect(dto.degraded).toBe(false);
    expect(dto.counts).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0 });
  });

  it('takes repoId from the PR for both facade calls', async () => {
    const { deps, getBlastRadius, getIndexState } = makeDeps();
    await new BlastService(deps).forPull(WS, PR_ID);
    expect(getIndexState).toHaveBeenCalledWith(REPO_ID);
    expect(getBlastRadius).toHaveBeenCalledWith(REPO_ID, ['src/a.ts', 'src/x.ts']);
  });

  it('reports flag_off when repo-intel is disabled', async () => {
    const { deps } = makeDeps({ enabled: false });
    const dto = await new BlastService(deps).forPull(WS, PR_ID);
    expect(dto.degraded).toBe(true);
    expect(dto.reason).toBe('flag_off');
  });

  it('produces a body that passes BlastRadiusResponse and links to the indexed sha', async () => {
    const { deps } = makeDeps();
    const dto = await new BlastService(deps).forPull(WS, PR_ID);
    expect(() => BlastRadiusResponse.parse(dto)).not.toThrow();
    expect(dto.head_sha).toBe('head-sha');
    expect(dto.link_sha).toBe('idx-sha');
  });
});
