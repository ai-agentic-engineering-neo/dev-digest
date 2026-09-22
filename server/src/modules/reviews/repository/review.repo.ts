import { and, desc, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Finding, FindingRecord } from '@devdigest/shared';
import type { StoredReview } from '../domain/review.js';
import type { NewReview } from '../domain/types.js';
import { toFindingRecord, toStoredReview } from './mappers.js';

// ---- reviews + findings ---------------------------------------------------

export async function insertReview(db: DbOrTx, values: NewReview): Promise<{ id: string }> {
  const [row] = await db.insert(t.reviews).values(values).returning({ id: t.reviews.id });
  return row!;
}

export async function insertFindings(
  db: DbOrTx,
  reviewId: string,
  findings: Finding[],
): Promise<FindingRecord[]> {
  if (findings.length === 0) return [];
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
    .returning();
  return rows.map(toFindingRecord);
}

/** Reviews for a PR (newest first), each with its findings. */
export async function reviewsForPull(db: DbOrTx, prId: string): Promise<StoredReview[]> {
  const reviews = await db
    .select()
    .from(t.reviews)
    .where(eq(t.reviews.prId, prId))
    .orderBy(desc(t.reviews.createdAt));
  if (reviews.length === 0) return [];
  const ids = reviews.map((r) => r.id);
  const findings = await db.select().from(t.findings).where(inArray(t.findings.reviewId, ids));
  return reviews.map((review) =>
    toStoredReview(
      review,
      findings.filter((f) => f.reviewId === review.id),
    ),
  );
}

/** Delete a whole review (one agent's run) + its findings (cascade), scoped
 *  to the workspace. Returns false if not found in the workspace. */
export async function deleteReview(
  db: DbOrTx,
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

/** Workspace of the PR a finding belongs to (finding → review → PR). */
export async function findingWorkspaceId(db: DbOrTx, findingId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ workspaceId: t.pullRequests.workspaceId })
    .from(t.findings)
    .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
    .where(eq(t.findings.id, findingId));
  return row?.workspaceId;
}

export async function setFindingAccepted(
  db: DbOrTx,
  findingId: string,
  at: Date | null,
): Promise<FindingRecord | undefined> {
  const [row] = await db
    .update(t.findings)
    .set({ acceptedAt: at, dismissedAt: null })
    .where(eq(t.findings.id, findingId))
    .returning();
  return row && toFindingRecord(row);
}

export async function setFindingDismissed(
  db: DbOrTx,
  findingId: string,
  at: Date | null,
): Promise<FindingRecord | undefined> {
  const [row] = await db
    .update(t.findings)
    .set({ dismissedAt: at, acceptedAt: null })
    .where(eq(t.findings.id, findingId))
    .returning();
  return row && toFindingRecord(row);
}
