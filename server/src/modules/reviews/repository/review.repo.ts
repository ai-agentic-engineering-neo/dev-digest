import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Finding } from '@devdigest/shared';
import type { ReviewDto, ReviewDtoFinding } from '../domain.js';
import type { NewReview } from '../ports.js';

type ReviewRow = typeof t.reviews.$inferSelect;
type FindingRow = typeof t.findings.$inferSelect;

// ---- row → domain mappers (rows stop in this file) -------------------------

function toFinding(row: FindingRow): ReviewDtoFinding {
  return {
    id: row.id,
    severity: row.severity as Finding['severity'],
    category: row.category as Finding['category'],
    title: row.title,
    file: row.file,
    start_line: row.startLine,
    end_line: row.endLine,
    rationale: row.rationale,
    suggestion: row.suggestion ?? null,
    confidence: row.confidence,
    kind: (row.kind as Finding['kind']) ?? 'finding',
    trifecta_components: (row.trifectaComponents as Finding['trifecta_components']) ?? null,
    evidence: null,
    review_id: row.reviewId,
    accepted_at: row.acceptedAt?.toISOString() ?? null,
    dismissed_at: row.dismissedAt?.toISOString() ?? null,
  };
}

function toReview(review: ReviewRow, findings: FindingRow[]): ReviewDto {
  return {
    id: review.id,
    pr_id: review.prId,
    agent_id: review.agentId,
    run_id: review.runId,
    agent_name: null,
    kind: review.kind as 'summary' | 'review',
    verdict: review.verdict,
    summary: review.summary,
    score: review.score,
    model: review.model,
    created_at: review.createdAt.toISOString(),
    findings: findings.map(toFinding),
  };
}

// ---- reviews + findings ---------------------------------------------------

export async function insertReview(db: Db, values: NewReview): Promise<{ id: string }> {
  const [row] = await db.insert(t.reviews).values(values).returning({ id: t.reviews.id });
  return row!;
}

/** Returns how many findings were stored. */
export async function insertFindings(
  db: Db,
  reviewId: string,
  findings: Finding[],
): Promise<number> {
  if (findings.length === 0) return 0;
  const rows = await db
    .insert(t.findings)
    .values(
      findings.map((f) => ({
        reviewId,
        file: f.file,
        startLine: f.start_line,
        endLine: f.end_line,
        severity: f.severity,
        category: f.category,
        title: f.title,
        rationale: f.rationale,
        suggestion: f.suggestion ?? null,
        confidence: f.confidence,
        kind: f.kind ?? 'finding',
        trifectaComponents: f.trifecta_components ?? null,
      })),
    )
    .returning({ id: t.findings.id });
  return rows.length;
}

/** Reviews for a PR (newest first), each with its findings. */
export async function reviewsForPull(db: Db, prId: string): Promise<ReviewDto[]> {
  const reviews = await db
    .select()
    .from(t.reviews)
    .where(eq(t.reviews.prId, prId))
    .orderBy(desc(t.reviews.createdAt));
  if (reviews.length === 0) return [];
  const ids = reviews.map((r) => r.id);
  const findings = await db.select().from(t.findings).where(inArray(t.findings.reviewId, ids));
  return reviews.map((review) =>
    toReview(
      review,
      findings.filter((f) => f.reviewId === review.id),
    ),
  );
}

// ---- PR-list rollups (read by the pulls module through a port) ------------

/** Reviews (kind = 'review') of these PRs, newest first. */
export async function reviewRefsForPulls(
  db: Db,
  prIds: string[],
): Promise<{ id: string; prId: string; agentId: string | null; score: number | null }[]> {
  if (prIds.length === 0) return [];
  return db
    .select({
      id: t.reviews.id,
      prId: t.reviews.prId,
      agentId: t.reviews.agentId,
      score: t.reviews.score,
    })
    .from(t.reviews)
    .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
    .orderBy(desc(t.reviews.createdAt));
}

export async function findingSeverities(
  db: Db,
  reviewIds: string[],
): Promise<{ reviewId: string; severity: string }[]> {
  if (reviewIds.length === 0) return [];
  return db
    .select({ reviewId: t.findings.reviewId, severity: t.findings.severity })
    .from(t.findings)
    .where(inArray(t.findings.reviewId, reviewIds));
}

/** Delete a whole review (one agent's run) + its findings (cascade), scoped
 *  to the workspace. Returns false if not found in the workspace. */
export async function deleteReview(
  db: Db,
  workspaceId: string,
  reviewId: string,
): Promise<boolean> {
  const rows = await db
    .delete(t.reviews)
    .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.reviews.id, reviewId)))
    .returning({ id: t.reviews.id });
  return rows.length > 0;
}

// ---- finding actions ------------------------------------------------------

/** The workspace a finding belongs to, through its review. */
export async function findingWorkspace(db: Db, findingId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ workspaceId: t.reviews.workspaceId })
    .from(t.findings)
    .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
    .where(eq(t.findings.id, findingId));
  return row?.workspaceId;
}

export async function setFindingAccepted(
  db: Db,
  findingId: string,
  at: Date | null,
): Promise<ReviewDtoFinding | undefined> {
  const [row] = await db
    .update(t.findings)
    .set({ acceptedAt: at, dismissedAt: null })
    .where(eq(t.findings.id, findingId))
    .returning();
  return row && toFinding(row);
}

export async function setFindingDismissed(
  db: Db,
  findingId: string,
  at: Date | null,
): Promise<ReviewDtoFinding | undefined> {
  const [row] = await db
    .update(t.findings)
    .set({ dismissedAt: at, acceptedAt: null })
    .where(eq(t.findings.id, findingId))
    .returning();
  return row && toFinding(row);
}
