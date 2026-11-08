import { describe, it, expect, vi } from 'vitest';
import { BlastService, type BlastDeps } from '../src/modules/blast/service.js';
import { BlastRadiusResponse, PriorPullsResponseSchema } from '../src/modules/blast/schemas.js';
import { MAX_PRIOR_PULLS } from '../src/modules/blast/domain/types.js';
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
  const listPriorPulls = vi.fn(async (_ws: string, _prId: string, _limit: number) => ({
    total: 12,
    rows: [
      {
        id: '0b4a7c3e-1d2f-4e5a-8b6c-7d8e9f0a1b2c',
        number: 41,
        title: 'Rate-limit public API',
        author: 'dev',
        status: 'merged',
        updatedAt: new Date('2026-11-01T10:00:00.000Z'),
        sharedCount: 7,
        sharedFiles: ['src/a.ts', 'src/b.ts'],
      },
      { id: '1c5b8d4f-2e3a-4f6b-9c7d-8e9f0a1b2c3d', number: 40, title: 'Old', author: 'dev', status: 'open', updatedAt: null, sharedCount: 1, sharedFiles: ['src/a.ts'] },
    ],
  }));
  const deps: BlastDeps = {
    reviewRepo: {
      // Only PR_ID in WS exists; any other workspace gets undefined.
      getPull: async (workspaceId, prId) =>
        workspaceId === WS && prId === PR_ID ? { id: PR_ID, repoId: REPO_ID, headSha: 'head-sha' } : undefined,
    },
    blastRepo: {
      listChangedPaths: async () => over.paths ?? ['src/a.ts', 'src/x.ts'],
      listPriorPulls,
    },
    repoIntel: { getBlastRadius, getIndexState },
    config: { repoIntelEnabled: over.enabled ?? true },
  };
  return { deps, getBlastRadius, getIndexState, listPriorPulls };
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

describe('BlastService.priorPulls', () => {
  it('throws NotFoundError for a PR of another workspace and never queries storage', async () => {
    const { deps, listPriorPulls } = makeDeps();
    await expect(new BlastService(deps).priorPulls('other-ws', PR_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(listPriorPulls).not.toHaveBeenCalled();
  });

  it('maps rows to the snake_case contract with the workspace-checked PR id and the cap', async () => {
    const { deps, listPriorPulls } = makeDeps();
    const dto = await new BlastService(deps).priorPulls(WS, PR_ID);
    expect(listPriorPulls).toHaveBeenCalledWith(WS, PR_ID, MAX_PRIOR_PULLS);
    expect(() => PriorPullsResponseSchema.parse(dto)).not.toThrow();
    expect(dto).toMatchObject({ pr_id: PR_ID, total: 12 });
    expect(dto.pulls[0]).toEqual({
      pr_id: '0b4a7c3e-1d2f-4e5a-8b6c-7d8e9f0a1b2c',
      number: 41,
      title: 'Rate-limit public API',
      author: 'dev',
      status: 'merged',
      updated_at: '2026-11-01T10:00:00.000Z',
      shared_count: 7,
      shared_files: ['src/a.ts', 'src/b.ts'],
    });
    expect(dto.pulls[1]!.updated_at).toBeNull();
  });
});

describe('PriorPullsResponseSchema', () => {
  it('rejects a total smaller than the listed pulls', () => {
    const pull = {
      pr_id: '0b4a7c3e-1d2f-4e5a-8b6c-7d8e9f0a1b2c', number: 1, title: 't', author: 'a', status: 'open',
      updated_at: null, shared_count: 1, shared_files: ['a.ts'],
    };
    expect(PriorPullsResponseSchema.safeParse({ pr_id: PR_ID, total: 0, pulls: [pull] }).success).toBe(false);
    expect(PriorPullsResponseSchema.safeParse({ pr_id: PR_ID, total: 1, pulls: [pull] }).success).toBe(true);
  });
});
