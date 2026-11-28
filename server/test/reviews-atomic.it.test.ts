import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import type { Finding } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[reviews-atomic] Docker not available — skipping integration tests.');
}

/**
 * Multi-step review writes are atomic: a review is never persisted without its
 * findings, and deleting a run removes its reviews and the run together.
 */
d('review writes are transactional', () => {
  let pg: PgFixture;
  let repo: ReviewRepository;
  let workspaceId: string;
  let prId: string;

  const finding = (over: Partial<Finding> = {}): Finding => ({
    id: 'f1',
    severity: 'WARNING',
    category: 'correctness',
    title: 'Off-by-one',
    file: 'src/a.ts',
    start_line: 1,
    end_line: 2,
    rationale: 'because',
    confidence: 0.9,
    ...over,
  }) as Finding;

  const reviewValues = (runId: string | null = null) => ({
    workspaceId,
    prId,
    agentId: null,
    runId,
    kind: 'review' as const,
    verdict: 'comment',
    summary: 's',
    score: 80,
    model: 'm',
  });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    repo = new ReviewRepository(pg.handle.db);
    const [pr] = await pg.handle.db.select().from(t.pullRequests).limit(1);
    workspaceId = pr!.workspaceId;
    prId = pr!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function reviewCount() {
    return (await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.prId, prId))).length;
  }

  it('persists a review together with its findings', async () => {
    const before = await reviewCount();
    const { review, findings } = await repo.insertReviewWithFindings(reviewValues(), [finding()]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.reviewId).toBe(review.id);
    expect(await reviewCount()).toBe(before + 1);
  });

  it('rolls the review back when a finding fails to insert', async () => {
    const before = await reviewCount();
    // NOT NULL violation on findings.file → the second insert throws.
    const bad = finding({ file: null as unknown as string });
    await expect(repo.insertReviewWithFindings(reviewValues(), [bad])).rejects.toThrow();
    expect(await reviewCount()).toBe(before);
  });

  it('deletes a run and its reviews together', async () => {
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, prId, status: 'done' })
      .returning();
    await repo.insertReviewWithFindings(reviewValues(run!.id), [finding()]);

    expect(await repo.deleteAgentRun(workspaceId, run!.id)).toBe(true);

    const runs = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, run!.id));
    const reviews = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.runId, run!.id));
    expect(runs).toHaveLength(0);
    expect(reviews).toHaveLength(0);
  });
});
