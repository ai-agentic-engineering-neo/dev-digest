import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BlastRadiusResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel, BlastResult } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
  let pg: PgFixture;
  let prId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    const workspaceId = ws!.id;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'bl', fullName: 'acme/bl' })
      .returning();
    repoId = repo!.id;
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 1,
        title: 'x',
        author: 'a',
        branch: 'f',
        base: 'main',
        headSha: 'abc',
        additions: 2,
        deletions: 0,
        filesCount: 2,
        status: 'needs_review',
      })
      .returning();
    prId = pr!.id;
    await db.insert(t.prFiles).values(
      ['src/a.ts', 'src/b.ts'].map((path) => ({ prId, path, additions: 1, deletions: 0 })),
    );
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('returns the contract shape from the facade and 404s for unknown PRs', async () => {
    const calls: Array<[string, string[]]> = [];
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'a', kind: 'function' }],
      callers: [{ file: 'src/c.ts', symbol: 'c', viaSymbol: 'a', line: 4, rank: 0 }],
      impactedEndpoints: ['GET /c'],
      factsByFile: { 'src/c.ts': { endpoints: ['GET /c'], crons: [] } },
    };
    const repoIntel = {
      getBlastRadius: async (id: string, paths: string[]) => {
        calls.push([id, [...paths].sort()]);
        return result;
      },
    } as unknown as RepoIntel;
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { repoIntel },
    });
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadiusResponse.parse(res.json());
    expect(body.downstream[0]).toMatchObject({ symbol: 'a', endpoints_affected: ['GET /c'] });
    expect(body.degraded).toBe(false);
    expect(calls).toEqual([[repoId, ['src/a.ts', 'src/b.ts']]]);

    const missing = await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/blast` });
    expect(missing.statusCode).toBe(404);
    expect(calls).toHaveLength(1);
    await app.close();
  });

  it('404s for a PR in another workspace and never calls the facade', async () => {
    const db = pg.handle.db;
    const [other] = await db.insert(t.workspaces).values({ name: 'other' }).returning();
    const [otherRepo] = await db
      .insert(t.repos)
      .values({ workspaceId: other!.id, owner: 'zed', name: 'x', fullName: 'zed/x' })
      .returning();
    const [otherPr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: other!.id,
        repoId: otherRepo!.id,
        number: 1,
        title: 'x',
        author: 'a',
        branch: 'f',
        base: 'main',
        headSha: 'def',
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'needs_review',
      })
      .returning();
    let called = 0;
    const repoIntel = {
      getBlastRadius: async () => {
        called++;
        return { changedSymbols: [], callers: [], impactedEndpoints: [] } as BlastResult;
      },
    } as unknown as RepoIntel;
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db,
      overrides: { repoIntel },
    });
    const res = await app.inject({ method: 'GET', url: `/pulls/${otherPr!.id}/blast` });
    expect(res.statusCode).toBe(404);
    expect(called).toBe(0);
    await app.close();
  });
});
