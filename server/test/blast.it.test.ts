/**
 * Blast Radius — GET /pulls/:id/blast.
 *
 * Follows the same Testcontainers-backed `startPg`/`buildApp`/`seed` template
 * as `smart-diff.it.test.ts`. This is the one real-Postgres test for the
 * `blast` module + its facade fixes — the things that only break in SQL:
 *   - a self-file reference (fromPath === declFile) must NOT show up as a
 *     caller (repo-intel/repository.ts `getResolvedCallers`'s new `ne(...)`).
 *   - endpoint impact reaches a file that only imports (never calls) a
 *     changed file, via the reverse-import BFS (repo-intel `getDependentFiles`)
 *     — surfaced PR-wide (`summary`), deliberately NOT folded into any one
 *     symbol's `endpoints_affected` (see `blast/helpers.ts`'s comment on why:
 *     a composition-root file sits ~2 import-hops from almost everything, so
 *     per-symbol attribution would tag unrelated symbols with the same route).
 * The pure caller-cap / mapping logic is covered hermetically in
 * `repo-intel-blast-persistent.test.ts` and `blast-helpers.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import { BlastRadius } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const PUBLIC_TS = 'src/api/public.ts';
const INDEX_TS = 'src/api/index.ts';
const WEBHOOKS_TS = 'src/api/webhooks.ts';

d('Blast Radius (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repo: RepoIntelRepository;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    repo = new RepoIntelRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function setupRepoAndPr() {
    const [repoRow] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'blast-repo', fullName: 'acme/blast-repo' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repoRow!.id,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: null,
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values([
      { prId: pr!.id, path: PUBLIC_TS, additions: 1, deletions: 0, patch: '@@ -5 +5 @@\n+ function rateLimit() {}' },
    ]);
    return { repoRow: repoRow!, pr: pr! };
  }

  /**
   * Index graph: `index.ts` imports `public.ts` (real caller of `rateLimit`,
   * at line 23); `webhooks.ts` imports `index.ts` — two hops from `public.ts`
   * — and registers an HTTP route, reached only via the reverse-import BFS,
   * never via a resolved call. `public.ts` also carries a synthetic self-edge
   * so a same-file reference resolves `decl_file === from_path`, exercising
   * the new exclusion.
   */
  async function seedIndex(repoId: string) {
    await repo.insertSymbols([
      {
        repoId,
        path: PUBLIC_TS,
        name: 'rateLimit',
        kind: 'function',
        line: 5,
        endLine: 8,
        exported: true,
        signature: 'function rateLimit()',
        contentHash: 'h-public',
      },
      {
        repoId,
        path: INDEX_TS,
        name: 'handler',
        kind: 'function',
        line: 20,
        endLine: 30,
        exported: true,
        signature: 'function handler(req)',
        contentHash: 'h-index',
      },
    ]);
    await repo.insertReferences([
      { repoId, fromPath: INDEX_TS, toSymbol: 'rateLimit', line: 23, contentHash: 'r-caller' },
      { repoId, fromPath: PUBLIC_TS, toSymbol: 'rateLimit', line: 6, contentHash: 'r-self' },
    ]);
    await repo.replaceEdges(repoId, [
      { fromFile: INDEX_TS, toFile: PUBLIC_TS },
      { fromFile: PUBLIC_TS, toFile: PUBLIC_TS }, // synthetic self-edge
      { fromFile: WEBHOOKS_TS, toFile: INDEX_TS },
    ]);
    await repo.replaceFileRank(repoId, [
      { filePath: PUBLIC_TS, pagerank: 0.1, hotness: 0, rank: 1, percentile: 50 },
      { filePath: INDEX_TS, pagerank: 0.2, hotness: 0, rank: 2, percentile: 80 },
      { filePath: WEBHOOKS_TS, pagerank: 0.05, hotness: 0, rank: 3, percentile: 20 },
    ]);
    await repo.replaceFileFacts(repoId, [
      { filePath: WEBHOOKS_TS, endpoints: ['POST /api/public/webhooks'], crons: [] },
    ]);
    await repo.resolveReferences(repoId, { reset: false });
    await repo.upsertIndexState({
      repoId,
      lastIndexedSha: 'a1b2c3d4',
      indexerVersion: 1,
      status: 'full',
      filesIndexed: 3,
      filesSkipped: 0,
      stats: {},
    });
  }

  it('returns the real caller, excludes the self-reference, and reaches an endpoint two import-hops away (PR-wide, not per-symbol)', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const { repoRow, pr } = await setupRepoAndPr();
    await seedIndex(repoRow.id);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const parsed = BlastRadius.parse(res.json());

    expect(parsed.changed_symbols).toEqual([{ name: 'rateLimit', file: PUBLIC_TS, kind: 'function' }]);
    expect(parsed.downstream).toHaveLength(1);

    const rateLimit = parsed.downstream[0]!;
    expect(rateLimit.symbol).toBe('rateLimit');
    // Only the real cross-file caller — the same-file self-reference
    // (decl_file === from_path) must not appear.
    expect(rateLimit.callers).toEqual([{ name: 'handler', file: INDEX_TS, line: 23 }]);
    expect(rateLimit.callers.some((c) => c.file === PUBLIC_TS)).toBe(false);
    // webhooks.ts never calls rateLimit — it's reached only by walking the
    // reverse import graph two hops (public.ts <- index.ts <- webhooks.ts),
    // not through a real caller, so it must NOT show up on this symbol.
    expect(rateLimit.endpoints_affected).toEqual([]);
    // The reverse-import reach isn't lost — it still surfaces PR-wide.
    expect(parsed.summary).toContain('1 endpoint');

    expect(parsed.summary.length).toBeGreaterThan(0);
    expect(parsed.summary).not.toMatch(/partial index/i);

    await app.close();
  });

  it('404s for an unknown PR', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const res = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/blast',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
