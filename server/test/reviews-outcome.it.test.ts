/**
 * DB-4: a finished run's outcome (review + findings + run completion + trace)
 * is saved in one transaction, and only while the run is still `running`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Finding, RunTrace } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import type { ReviewOutcome } from '../src/modules/reviews/ports.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 'f1',
  severity: 'WARNING',
  category: 'bug',
  title: 'Off by one',
  file: 'src/a.ts',
  start_line: 3,
  end_line: 3,
  rationale: 'Loop bound is wrong.',
  confidence: 0.8,
  kind: 'finding',
  ...over,
});

const trace: RunTrace = {
  config: { agent: 'Sec', version: '1', provider: 'openai', model: 'gpt-4.1', pr: 1, source: 'local' },
  stats: { duration_ms: 5, tokens_in: 1, tokens_out: 1, cost_usd: null, findings: 1, grounding: '1/1 passed' },
  prompt_assembly: { system: 's', skills: null, memory: null, specs: null, user: '' },
  tool_calls: [],
  raw_output: '',
  memory_pulled: [],
  specs_read: [],
  log: [],
};

d('ReviewRepository.saveReviewOutcome (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: ReviewRepository;
  let workspaceId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    repo = new ReviewRepository(db);
    const [ws] = await db.insert(t.workspaces).values({ name: 'ws' }).returning();
    workspaceId = ws!.id;
    const [r] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'api', fullName: 'acme/api' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({ workspaceId, repoId: r!.id, number: 1, title: 'x', author: 'a', branch: 'b', base: 'main', headSha: 'h' })
      .returning();
    prId = pr!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newRun(): Promise<string> {
    return repo.createAgentRun({ workspaceId, agentId: null, prId, provider: 'openai', model: 'gpt-4.1' });
  }

  function outcome(runId: string, findings: Finding[]): ReviewOutcome {
    return {
      runId,
      review: {
        workspaceId,
        prId,
        agentId: null,
        runId,
        kind: 'review',
        verdict: 'comment',
        summary: 's',
        score: 80,
        model: 'gpt-4.1',
      },
      findings,
      completion: {
        status: 'done',
        durationMs: 5,
        tokensIn: 1,
        tokensOut: 1,
        costUsd: null,
        findingsCount: findings.length,
        grounding: '1/1 passed',
        score: 80,
        blockers: 0,
        error: null,
      },
      trace,
    };
  }

  async function state(runId: string) {
    const db = pg.handle.db;
    const [run] = await db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    const reviews = await db.select().from(t.reviews).where(eq(t.reviews.runId, runId));
    const traces = await db.select().from(t.runTraces).where(eq(t.runTraces.runId, runId));
    return { status: run!.status, reviews: reviews.length, traces: traces.length };
  }

  it('saves the review, its findings, the done run and the trace together', async () => {
    const runId = await newRun();
    const saved = await repo.saveReviewOutcome(outcome(runId, [finding()]));

    expect(saved).not.toBeNull();
    expect(await state(runId)).toEqual({ status: 'done', reviews: 1, traces: 1 });
    const rows = await pg.handle.db.select().from(t.findings).where(eq(t.findings.reviewId, saved!.reviewId));
    expect(rows).toHaveLength(1);
  });

  it('a failure inside the save leaves no review row and the run still running', async () => {
    const runId = await newRun();
    // start_line beyond Postgres `integer` makes the findings insert fail
    // after the run update and the review insert have already run.
    const bad = finding({ start_line: 2 ** 40, end_line: 2 ** 40 });

    await expect(repo.saveReviewOutcome(outcome(runId, [bad]))).rejects.toThrow();
    expect(await state(runId)).toEqual({ status: 'running', reviews: 0, traces: 0 });
  });

  it('a run cancelled before the save stores nothing and stays cancelled', async () => {
    const runId = await newRun();
    await repo.cancelRunIfRunning(runId);

    expect(await repo.saveReviewOutcome(outcome(runId, [finding()]))).toBeNull();
    expect(await state(runId)).toEqual({ status: 'cancelled', reviews: 0, traces: 0 });
  });
});
