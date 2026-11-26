import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { Finding } from '@devdigest/shared';
import { ReviewRepository } from '../src/modules/reviews/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const finding = (over: Partial<Finding> = {}): Finding => ({
  file: 'src/config.ts',
  start_line: 1,
  end_line: 1,
  severity: 'WARNING',
  category: 'security',
  title: 'Something',
  rationale: 'Because.',
  suggestion: null,
  confidence: 0.9,
  ...over,
});

// B5: a review and its findings are written in one transaction.
d('ReviewRepository.insertReviewWithFindings (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [pr] = await pg.handle.db.select().from(t.pullRequests);
    workspaceId = pr!.workspaceId;
    prId = pr!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const values = () => ({
    workspaceId,
    prId,
    agentId: null,
    runId: null,
    kind: 'review' as const,
    verdict: 'comment',
    summary: 'atomic-test',
    score: 80,
    model: 'test-model',
  });

  it('persists the review and all its findings together', async () => {
    const repo = new ReviewRepository(pg.handle.db);
    const { review, findings } = await repo.insertReviewWithFindings(values(), [finding(), finding({ title: 'Two' })]);
    expect(findings).toHaveLength(2);
    const stored = await pg.handle.db.select().from(t.findings).where(eq(t.findings.reviewId, review.id));
    expect(stored).toHaveLength(2);
  });

  it('rolls the review back when a finding cannot be written', async () => {
    const repo = new ReviewRepository(pg.handle.db);
    const before = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.summary, 'atomic-rollback'));
    // title is NOT NULL → the findings insert fails inside the transaction.
    await expect(
      repo.insertReviewWithFindings({ ...values(), summary: 'atomic-rollback' }, [
        finding(),
        finding({ title: null as unknown as string }),
      ]),
    ).rejects.toThrow();
    const after = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.summary, 'atomic-rollback'));
    expect(after).toHaveLength(before.length);
  });
});
