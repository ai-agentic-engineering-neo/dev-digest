import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import { BlastRadiusResponse, PriorPullsResponseSchema } from '../src/modules/blast/schemas.js';
import { MAX_PRIOR_SHARED_FILES } from '../src/modules/blast/domain/types.js';
import type {
  BlastResult,
  IndexResult,
  IndexState,
  RepoIntel,
  RepoMapResult,
} from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const INDEXED_SHA = 'indexed-sha-1';
const INDEX_RESULT: IndexResult = { status: 'full', filesIndexed: 2, filesSkipped: 0, durationMs: 1 };

/** Fake facade: only getBlastRadius / getIndexState return data; the rest are inert. */
class FakeRepoIntel implements RepoIntel {
  blastCalls: Array<{ repoId: string; files: string[] }> = [];

  async indexRepo(): Promise<IndexResult> {
    return INDEX_RESULT;
  }
  async refreshIndex(): Promise<IndexResult> {
    return INDEX_RESULT;
  }
  async getIndexState(repoId: string): Promise<IndexState> {
    return { ...INDEX_RESULT, repoId, lastIndexedSha: INDEXED_SHA, indexerVersion: 1, updatedAt: new Date() };
  }
  async getBlastRadius(repoId: string, files: string[]): Promise<BlastResult> {
    this.blastCalls.push({ repoId, files });
    return {
      changedSymbols: [{ name: 'createUser', file: 'src/a.ts', kind: 'function' }],
      callers: [
        { file: 'src/b.ts', symbol: 'postUsers', viaFile: 'src/a.ts', viaSymbol: 'createUser', line: 7, rank: 1 },
      ],
      impactedEndpoints: ['POST /users'],
      factsByFile: { 'src/b.ts': { endpoints: ['POST /users'], crons: [] } },
      callersOmitted: 0,
    };
  }
  async getRepoMap(): Promise<RepoMapResult> {
    return { text: '', tokens: 0, cached: false, degraded: true };
  }
  async getFileRank() {
    return [];
  }
  async getSymbolsInFiles() {
    return [];
  }
  async getCallerSignatures() {
    return [];
  }
  async getUnresolvedReferences() {
    return [];
  }
  async getConventionSamples() {
    return [];
  }
  async getTopFilesByRank() {
    return [];
  }
  async getCriticalPaths() {
    return [];
  }
}

d('Blast routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let seq = 500;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'blast-app', fullName: 'acme/blast-app', clonePath: '/clones/b' })
      .returning();
    repoId = r!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newPr(ws: string, repo: string, paths: string[]): Promise<string> {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws, repoId: repo, number: seq++, title: 'Blast', author: 'a', branch: 'feat/x',
        base: 'main', headSha: 'abc123',
      })
      .returning();
    if (paths.length) {
      await pg.handle.db.insert(t.prFiles).values(paths.map((path) => ({ prId: pr!.id, path })));
    }
    return pr!.id;
  }

  async function makeApp(intel: FakeRepoIntel) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        git: new MockGitClient({ files: {} }),
        repoIntel: intel,
      },
    });
  }

  it('GET /pulls/:id/blast returns the contract body', async () => {
    const intel = new FakeRepoIntel();
    const app = await makeApp(intel);
    const prId = await newPr(workspaceId, repoId, ['src/a.ts', 'src/c.ts']);

    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadiusResponse.parse(res.json());
    expect(body.head_sha).toBe('abc123');
    expect(body.link_sha).toBe(INDEXED_SHA);
    expect(body.indexed_sha).toBe(INDEXED_SHA);
    expect(intel.blastCalls).toHaveLength(1);
    expect(intel.blastCalls[0]!.repoId).toBe(repoId);
    expect([...intel.blastCalls[0]!.files].sort()).toEqual(['src/a.ts', 'src/c.ts']);
    await app.close();
  });

  it('a PR of another workspace is 404 and never reaches the facade', async () => {
    const intel = new FakeRepoIntel();
    const app = await makeApp(intel);
    const [ws2] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-blast' }).returning();
    const [r2] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws2!.id, owner: 'zed', name: 'other', fullName: 'zed/other', clonePath: '/clones/z' })
      .returning();
    const foreign = await newPr(ws2!.id, r2!.id, ['src/a.ts']);

    const res = await app.inject({ method: 'GET', url: `/pulls/${foreign}/blast` });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).toContain('not_found');
    expect(intel.blastCalls).toHaveLength(0);
    await app.close();
  });

  it('GET /pulls/:id/prior-pulls lists earlier PRs of the same repo sharing a path, newest first', async () => {
    const app = await makeApp(new FakeRepoIntel());
    // Own repo: PRs of earlier tests in the shared repo would otherwise count as "prior".
    const [ownRepo, otherRepo] = await pg.handle.db
      .insert(t.repos)
      .values([
        { workspaceId, owner: 'acme', name: 'prior-app', fullName: 'acme/prior-app', clonePath: '/clones/pa' },
        { workspaceId, owner: 'acme', name: 'other-app', fullName: 'acme/other-app', clonePath: '/clones/o' },
      ])
      .returning();
    const repo = ownRepo!.id;
    const many = Array.from({ length: MAX_PRIOR_SHARED_FILES + 2 }, (_, i) => `lib/f${i}.ts`);
    const olderOne = await newPr(workspaceId, repo, ['src/a.ts', 'src/x.ts']); // shares a
    const noOverlap = await newPr(workspaceId, repo, ['src/zzz.ts']);
    const otherRepoPr = await newPr(workspaceId, otherRepo!.id, ['src/a.ts']); // same path, other repo
    const olderMany = await newPr(workspaceId, repo, ['src/b.ts', ...many]); // shares b + 7
    const current = await newPr(workspaceId, repo, ['src/a.ts', 'src/b.ts', ...many]);
    const later = await newPr(workspaceId, repo, ['src/a.ts']); // higher number: not "prior"

    const res = await app.inject({ method: 'GET', url: `/pulls/${current}/prior-pulls` });
    expect(res.statusCode).toBe(200);
    const body = PriorPullsResponseSchema.parse(res.json());
    expect(body.pr_id).toBe(current);
    expect(body.total).toBe(2);
    expect(body.pulls.map((p) => p.pr_id)).toEqual([olderMany, olderOne]);
    const ids = body.pulls.map((p) => p.pr_id);
    for (const excluded of [current, noOverlap, otherRepoPr, later]) expect(ids).not.toContain(excluded);
    expect(body.pulls[0]!.shared_count).toBe(MAX_PRIOR_SHARED_FILES + 2 + 1);
    expect(body.pulls[0]!.shared_files).toHaveLength(MAX_PRIOR_SHARED_FILES);
    expect(body.pulls[0]!.shared_files).toEqual([...body.pulls[0]!.shared_files].sort());
    expect(body.pulls[1]).toMatchObject({ shared_count: 1, shared_files: ['src/a.ts'], title: 'Blast' });
    await app.close();
  });

  it('prior-pulls of a PR with no earlier overlap is an empty list, and another workspace is 404', async () => {
    const app = await makeApp(new FakeRepoIntel());
    const lonely = await newPr(workspaceId, repoId, ['only/here.ts']);
    const empty = await app.inject({ method: 'GET', url: `/pulls/${lonely}/prior-pulls` });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ pr_id: lonely, total: 0, pulls: [] });

    const [ws3] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-prior' }).returning();
    const [r3] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws3!.id, owner: 'zed', name: 'prior', fullName: 'zed/prior', clonePath: '/clones/p' })
      .returning();
    const foreign = await newPr(ws3!.id, r3!.id, ['only/here.ts']);
    const res = await app.inject({ method: 'GET', url: `/pulls/${foreign}/prior-pulls` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('rejects a non-uuid id (validation errors are 422 in this app)', async () => {
    const app = await makeApp(new FakeRepoIntel());
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
