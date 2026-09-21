import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';

export type MemoryRow = typeof t.memory.$inferSelect;

/**
 * specs/13-multi-agent-review.md (D24, D-P5) — the Learn action's ONE write
 * path. A future `modules/memory/` owns read/curation of this table; these
 * rows must stay ordinary `kind: 'learning'` entries with no multi-agent-
 * specific shape (no embedding, no confidence — this is deliberately NOT the
 * RAG pipeline).
 */

/**
 * Idempotency guard for the "Learn activated twice on one finding" edge case
 * (D24): jsonb containment on `sources.finding_id`. No index this slice — the
 * table is empty and this is a single-row lookup; a future Memory feature
 * scaling this table should add one before it matters.
 */
export async function findLearningForFinding(
  db: Db,
  workspaceId: string,
  findingId: string,
): Promise<MemoryRow | undefined> {
  const [row] = await db
    .select()
    .from(t.memory)
    .where(
      and(
        eq(t.memory.workspaceId, workspaceId),
        eq(t.memory.kind, 'learning'),
        sql`${t.memory.sources} @> ${JSON.stringify({ finding_id: findingId })}::jsonb`,
      ),
    );
  return row;
}

export async function insertLearningFromFinding(
  db: Db,
  values: {
    workspaceId: string;
    repoId: string | null;
    content: string;
    sources: { finding_id: string; review_id: string; run_id: string | null; agent_id: string | null };
  },
): Promise<MemoryRow> {
  const [row] = await db
    .insert(t.memory)
    .values({
      workspaceId: values.workspaceId,
      repoId: values.repoId,
      scope: 'repo',
      kind: 'learning',
      content: values.content,
      sources: values.sources,
    })
    .returning();
  return row!;
}
