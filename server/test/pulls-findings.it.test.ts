/**
 * GET /repos/:id/pulls — the FINDINGS / SCORE / COST aggregate on each PR row.
 *
 * All three describe **each agent's latest review, unioned** — not the single
 * newest review. The regression that forced this: a multi-agent review writes
 * one row per agent seconds apart, so taking the newest made a PR read clean
 * whenever the last agent to finish happened to find nothing.
 *
 * The tally must exclude dismissed findings, `score` must be recomputed from
 * the union so it can't contradict the badges, and "never reviewed" (null) must
 * stay distinguishable from "reviewed, nothing outstanding" (all-zero).
 * DB-backed because the whole point is the reviews/findings join.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { PrMeta, Severity } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let seq = 0;

type Db = PgFixture['handle']['db'];

async function makeRepoAndPr(db: Db, workspaceId: string) {
  const name = `findings-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'deadbeef',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'open',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

/** One persisted review plus its findings. `createdAt` decides which is latest. */
async function addReview(
  db: Db,
  args: {
    workspaceId: string;
    prId: string;
    score: number;
    createdAt: Date;
    /** Distinct agents are unioned; omit for the no-agent (seed-like) bucket. */
    agentId?: string;
    findings: { severity: Severity; dismissed?: boolean }[];
  },
) {
  const [review] = await db
    .insert(t.reviews)
    .values({
      workspaceId: args.workspaceId,
      prId: args.prId,
      agentId: args.agentId ?? null,
      kind: 'review',
      verdict: 'comment',
      summary: 'ok',
      score: args.score,
      createdAt: args.createdAt,
    })
    .returning();
  let n = 0;
  for (const f of args.findings) {
    await db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'src/config.ts',
      startLine: 1 + n,
      endLine: 1 + n,
      severity: f.severity,
      category: 'bug',
      title: `finding ${n}`,
      rationale: 'because',
      confidence: 0.9,
      dismissedAt: f.dismissed ? new Date() : null,
    });
    n += 1;
  }
  return review!;
}

async function listPulls(db: Db, repoId: string): Promise<PrMeta[]> {
  const app = await buildApp({ config: config(), db });
  const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
  expect(res.statusCode).toBe(200);
  return res.json() as PrMeta[];
}

d('PR list findings breakdown (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('is null for a PR that has never been reviewed', async () => {
    const db = pg.handle.db;
    const { repo } = await makeRepoAndPr(db, workspaceId);
    const [row] = await listPulls(db, repo.id);
    expect(row!.score).toBeNull();
    expect(row!.findings ?? null).toBeNull();
  });

  it('tallies per severity for a single-agent PR', async () => {
    const db = pg.handle.db;
    const { repo, pr } = await makeRepoAndPr(db, workspaceId);
    await addReview(db, {
      workspaceId,
      prId: pr.id,
      score: 61,
      createdAt: new Date('2026-06-11T10:00:00Z'),
      findings: [
        { severity: 'CRITICAL' },
        { severity: 'CRITICAL' },
        { severity: 'WARNING' },
        { severity: 'SUGGESTION' },
      ],
    });

    const [row] = await listPulls(db, repo.id);
    expect(row!.findings).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
  });

  it('excludes dismissed findings', async () => {
    const db = pg.handle.db;
    const { repo, pr } = await makeRepoAndPr(db, workspaceId);
    await addReview(db, {
      workspaceId,
      prId: pr.id,
      score: 61,
      createdAt: new Date('2026-06-11T10:00:00Z'),
      findings: [
        { severity: 'CRITICAL' },
        { severity: 'CRITICAL', dismissed: true },
        { severity: 'WARNING', dismissed: true },
      ],
    });

    const [row] = await listPulls(db, repo.id);
    expect(row!.findings).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
  });

  it('is all-zero (not null) for a review with nothing outstanding', async () => {
    const db = pg.handle.db;
    const { repo, pr } = await makeRepoAndPr(db, workspaceId);
    await addReview(db, {
      workspaceId,
      prId: pr.id,
      score: 100,
      createdAt: new Date('2026-06-11T10:00:00Z'),
      findings: [],
    });

    const [row] = await listPulls(db, repo.id);
    expect(row!.findings).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    expect(row!.score).toBe(100);
  });

  it('supersedes an older review by the SAME agent', async () => {
    const db = pg.handle.db;
    const { repo, pr } = await makeRepoAndPr(db, workspaceId);
    const agentId = randomUUID();
    await addReview(db, {
      workspaceId,
      prId: pr.id,
      agentId,
      score: 30,
      createdAt: new Date('2026-06-10T10:00:00Z'),
      findings: [{ severity: 'CRITICAL' }, { severity: 'CRITICAL' }],
    });
    await addReview(db, {
      workspaceId,
      prId: pr.id,
      agentId,
      score: 88,
      createdAt: new Date('2026-06-12T10:00:00Z'),
      findings: [{ severity: 'WARNING' }],
    });

    const [row] = await listPulls(db, repo.id);
    // Only the newer review for that agent counts — the two criticals are gone.
    expect(row!.findings).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 0 });
    expect(row!.score).toBe(88); // 100 − 12
  });

  it('unions DIFFERENT agents instead of letting the last one to finish win', async () => {
    const db = pg.handle.db;
    const { repo, pr } = await makeRepoAndPr(db, workspaceId);
    // The exact shape that regressed: three agents seconds apart, and the very
    // newest found nothing. Taking "the latest review" read this PR as clean.
    await addReview(db, {
      workspaceId,
      prId: pr.id,
      agentId: randomUUID(),
      score: 85,
      createdAt: new Date('2026-06-12T07:36:58Z'),
      findings: [{ severity: 'WARNING' }, { severity: 'SUGGESTION' }],
    });
    await addReview(db, {
      workspaceId,
      prId: pr.id,
      agentId: randomUUID(),
      score: 73,
      createdAt: new Date('2026-06-12T07:37:20Z'),
      findings: [
        { severity: 'WARNING' },
        { severity: 'WARNING' },
        { severity: 'SUGGESTION' },
      ],
    });
    await addReview(db, {
      workspaceId,
      prId: pr.id,
      agentId: randomUUID(),
      score: 100,
      createdAt: new Date('2026-06-12T07:37:28Z'),
      findings: [],
    });

    const [row] = await listPulls(db, repo.id);
    expect(row!.findings).toEqual({ CRITICAL: 0, WARNING: 3, SUGGESTION: 2 });
    // Recomputed from the union: 100 − 3·12 − 2·3. Not 100 (newest), and not
    // 73 (worst stored) — neither describes the five findings on the row.
    expect(row!.score).toBe(58);
  });

  it('score always reconciles with the badge counts via the S2 penalties', async () => {
    const db = pg.handle.db;
    const { repo, pr } = await makeRepoAndPr(db, workspaceId);
    await addReview(db, {
      workspaceId,
      prId: pr.id,
      agentId: randomUUID(),
      score: 999, // deliberately bogus: the row must not read this
      createdAt: new Date('2026-06-12T10:00:00Z'),
      findings: [{ severity: 'CRITICAL' }, { severity: 'SUGGESTION' }],
    });

    const [row] = await listPulls(db, repo.id);
    const f = row!.findings!;
    expect(row!.score).toBe(100 - 35 * f.CRITICAL - 12 * f.WARNING - 3 * f.SUGGESTION);
    expect(row!.score).toBe(62);
  });

  it('keeps each PR’s tally to its own review', async () => {
    const db = pg.handle.db;
    const { repo, pr } = await makeRepoAndPr(db, workspaceId);
    const [other] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 2,
        title: 'Second PR',
        author: 'deepak.r',
        branch: 'feat/two',
        base: 'main',
        headSha: 'cafebabe',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'open',
      })
      .returning();

    await addReview(db, {
      workspaceId,
      prId: pr.id,
      score: 61,
      createdAt: new Date('2026-06-11T10:00:00Z'),
      findings: [{ severity: 'CRITICAL' }],
    });
    await addReview(db, {
      workspaceId,
      prId: other!.id,
      score: 72,
      createdAt: new Date('2026-06-11T11:00:00Z'),
      findings: [{ severity: 'SUGGESTION' }, { severity: 'SUGGESTION' }],
    });

    const rows = await listPulls(db, repo.id);
    const byNumber = new Map(rows.map((r) => [r.number, r]));
    expect(byNumber.get(1)!.findings).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
    expect(byNumber.get(2)!.findings).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 2 });
  });
});
