/** blast: route smoke test without a database (fake repository and facade ports). */
import { describe, it, expect } from 'vitest';
import { BlastRadiusResponse } from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import type { BlastRepositoryPort } from '../src/modules/blast/ports.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const PR = '11111111-1111-4111-8111-111111111111';
const REPO = '33333333-3333-4333-8333-333333333333';

const fakeRepo: BlastRepositoryPort = {
  getInputs: async (_w, id) =>
    id === PR ? { prId: PR, repoId: REPO, headSha: 'abc123', changedPaths: ['src/a.ts'] } : undefined,
  getPriorPulls: async () => [
    {
      number: 7,
      title: 'Earlier change',
      author: 'sam',
      openedAt: null,
      updatedAt: new Date('2026-01-02T00:00:00Z'),
      body: 'Moved a.ts.',
      filesOverlap: ['src/a.ts'],
    },
  ],
};

const calls: unknown[][] = [];
const fakeIntel = {
  getBlastRadius: async (repoId: string, files: string[]) => {
    calls.push([repoId, files]);
    return {
      changedSymbols: [{ file: 'src/a.ts', name: 'a', kind: 'function' }],
      callers: [{ file: 'src/b.ts', symbol: 'b', viaSymbol: 'a', line: 3, rank: 1 }],
      impactedEndpoints: ['GET /b'],
      degraded: true as const,
      reason: 'no_data' as const,
    };
  },
} as unknown as RepoIntel;

const makeApp = () =>
  buildApp({ config, overrides: { auth: new MockAuthProvider(), blastRepo: fakeRepo, repoIntel: fakeIntel } });

describe('blast routes (no DB)', () => {
  it('GET /pulls/:id/blast returns a BlastRadiusResponse built from the facade and the history', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${PR}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadiusResponse.parse(res.json());
    expect(calls.at(-1)).toEqual([REPO, ['src/a.ts']]);
    expect(body.head_sha).toBe('abc123');
    expect(body.degraded).toBe(true);
    expect(body.reason).toBe('no_data');
    expect(body.downstream[0]).toMatchObject({ symbol: 'a', endpoints_affected: ['GET /b'] });
    expect(body.downstream[0]!.callers[0]).toEqual({ name: 'b', file: 'src/b.ts', line: 3 });
    expect(body.history[0]).toMatchObject({ pr_number: 7, notes: 'Moved a.ts.', files_overlap: ['src/a.ts'] });
    await app.close();
  });

  it('unknown PR gives a 404 envelope; a bad id gives 422', async () => {
    const app = await makeApp();
    const missing = await app.inject({ method: 'GET', url: '/pulls/22222222-2222-4222-8222-222222222222/blast' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBeDefined();
    const bad = await app.inject({ method: 'GET', url: '/pulls/nope/blast' });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });
});
