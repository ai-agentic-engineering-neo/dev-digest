import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import { CiRepository } from '../src/modules/ci/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-performance] Docker not available — skipping integration tests.');
}

/**
 * plans/16-agent-performance-dashboard.md — `CiRepository.performanceRows`/
 * `costByModel` exercised against a REAL Postgres, since the bugs these seams
 * guard against (D1/D2, the `to` upper bound, per-day bucketing) live in the
 * actual SQL windowing/join, not in the pure JS reduction already covered by
 * `_shared/perf.test.ts`. Calls `CiRepository` directly (same pattern
 * `ci-ingest.it.test.ts` uses for `new CiRepository(pg.handle.db)`) rather
 * than going through HTTP — nothing here needs a Fastify app or auth.
 */
d('CiRepository Agent Performance aggregation (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: CiRepository;

  beforeAll(async () => {
    pg = await startPg();
    repo = new CiRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  let seq = 0;

  async function createWorkspace(): Promise<string> {
    const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: `ci-perf-ws-${seq++}` }).returning();
    return ws!.id;
  }

  async function createAgent(workspaceId: string): Promise<string> {
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `ci-perf-agent-${seq++}`,
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'Review the diff.',
      })
      .returning();
    return agent!.id;
  }

  async function insertRun(
    workspaceId: string,
    agentId: string,
    overrides: Partial<typeof t.agentRuns.$inferInsert> = {},
  ) {
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId,
        status: 'done',
        source: 'local',
        ranAt: new Date(),
        ...overrides,
      })
      .returning();
    return run!;
  }

  /** A minimal repo + PR pair, just enough to satisfy `reviews.pr_id`'s FK —
   *  content is irrelevant to `performanceRows`, which never reads it. */
  async function createRepoAndPr(workspaceId: string) {
    const name = `ci-perf-repo-${seq++}`;
    const [repoRow] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repoRow!.id,
        number: 1,
        title: 'Test PR',
        author: 'tester',
        branch: 'feat/x',
        base: 'main',
        headSha: 'deadbeef',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'open',
      })
      .returning();
    return pr!;
  }

  describe('D1 — running/failed runs count into `runs` but not into countedRuns/costedRuns/timedRuns', () => {
    it('a done + a failed + a running run: runsLocal=3, countedRuns=1, costedRuns=1, timedRuns=2', async () => {
      const workspaceId = await createWorkspace();
      const agentId = await createAgent(workspaceId);
      const from = new Date(Date.now() - 60 * 60 * 1000);
      const to = new Date(Date.now() + 60 * 60 * 1000);
      const ranAt = new Date();

      await insertRun(workspaceId, agentId, { status: 'done', costUsd: 5, durationMs: 1000, ranAt });
      // A failed run's durationMs is NOT null, only its costUsd is (server/LEARNINGS.md).
      await insertRun(workspaceId, agentId, { status: 'failed', costUsd: null, durationMs: 800, ranAt });
      await insertRun(workspaceId, agentId, { status: 'running', costUsd: null, durationMs: null, ranAt });

      const [row] = await repo.performanceRows(workspaceId, from, to);
      expect(row).toBeDefined();
      expect(row!.runsLocal).toBe(3); // raw total includes running/failed
      expect(row!.countedRuns).toBe(1); // only the 'done' run
      expect(row!.costedRuns).toBe(1); // only the run with a real cost
      expect(row!.timedRuns).toBe(2); // done + failed both have real duration
      expect(row!.totalCostUsd).toBe(5);
      expect(row!.totalDurationMs).toBe(1800);
    });
  });

  describe("D2 — findings are windowed by the run's own ranAt, not reviews.createdAt", () => {
    it('a run just inside the period, whose review committed just outside it, still has its findings counted', async () => {
      const workspaceId = await createWorkspace();
      const agentId = await createAgent(workspaceId);
      const pr = await createRepoAndPr(workspaceId);

      const from = new Date('2026-05-01T00:00:00Z');
      const to = new Date('2026-05-08T00:00:00Z');
      const runRanAt = new Date('2026-05-07T23:59:00Z'); // just inside [from, to]
      const reviewCreatedAt = new Date('2026-05-08T02:00:00Z'); // just OUTSIDE [from, to]

      const run = await insertRun(workspaceId, agentId, { status: 'done', ranAt: runRanAt, costUsd: 1 });
      const [review] = await pg.handle.db
        .insert(t.reviews)
        .values({
          workspaceId,
          prId: pr.id,
          agentId,
          runId: run.id,
          kind: 'review',
          createdAt: reviewCreatedAt,
        })
        .returning();
      await pg.handle.db.insert(t.findings).values({
        reviewId: review!.id,
        file: 'src/foo.ts',
        startLine: 1,
        endLine: 1,
        severity: 'WARNING',
        category: 'style',
        title: 'A finding',
        rationale: 'Because.',
        confidence: 0.9,
        acceptedAt: new Date('2026-05-07T23:59:30Z'),
      });

      const [row] = await repo.performanceRows(workspaceId, from, to);
      expect(row).toBeDefined();
      // Would be 0 if windowed by reviews.createdAt (D2's bug) — the run's
      // OWN ranAt is inside the window, so its finding must still count.
      expect(row!.accepted).toBe(1);
    });
  });

  describe('the `to` upper bound is inclusive of exactly `to`, exclusive of anything after it', () => {
    it('a run at ranAt === to is included; a run one minute after `to` is excluded', async () => {
      const workspaceId = await createWorkspace();
      const agentId = await createAgent(workspaceId);
      const from = new Date('2026-06-01T00:00:00Z');
      const to = new Date('2026-06-08T00:00:00Z');

      await insertRun(workspaceId, agentId, { ranAt: to }); // exactly at the boundary
      await insertRun(workspaceId, agentId, { ranAt: new Date(to.getTime() + 60_000) }); // just after

      const [row] = await repo.performanceRows(workspaceId, from, to);
      expect(row).toBeDefined();
      expect(row!.runsLocal).toBe(1);
    });
  });

  describe('runsByDay buckets run counts per UTC day, for the trend sparkline', () => {
    it('two runs on day 1, one on day 2, three on day 3 — sorted ascending, exact counts', async () => {
      const workspaceId = await createWorkspace();
      const agentId = await createAgent(workspaceId);
      const from = new Date('2026-07-01T00:00:00Z');
      const to = new Date('2026-07-05T00:00:00Z');

      const day1 = new Date('2026-07-01T10:00:00Z');
      const day2 = new Date('2026-07-02T10:00:00Z');
      const day3 = new Date('2026-07-03T10:00:00Z');
      for (const ranAt of [day1, day1, day2, day3, day3, day3]) {
        await insertRun(workspaceId, agentId, { ranAt });
      }

      const [row] = await repo.performanceRows(workspaceId, from, to);
      expect(row).toBeDefined();
      expect(row!.runsByDay).toEqual([
        { day: '2026-07-01', count: 2 },
        { day: '2026-07-02', count: 1 },
        { day: '2026-07-03', count: 3 },
      ]);
    });
  });

  describe('costByModel respects the same `to` upper bound as performanceRows', () => {
    it('sums only cost within [from, to]; a run just after `to` is excluded from the total', async () => {
      const workspaceId = await createWorkspace();
      const agentId = await createAgent(workspaceId);
      const from = new Date('2026-08-01T00:00:00Z');
      const to = new Date('2026-08-08T00:00:00Z');

      await insertRun(workspaceId, agentId, { ranAt: from, model: 'gpt-4.1', costUsd: 3 });
      await insertRun(workspaceId, agentId, { ranAt: to, model: 'gpt-4.1', costUsd: 2 });
      await insertRun(workspaceId, agentId, {
        ranAt: new Date(to.getTime() + 60_000),
        model: 'gpt-4.1',
        costUsd: 100, // outside the window — must not be summed
      });

      const byModel = await repo.costByModel(workspaceId, from, to);
      const gpt = byModel.find((m) => m.model === 'gpt-4.1');
      expect(gpt).toBeDefined();
      expect(gpt!.cost).toBe(5);
    });
  });
});
