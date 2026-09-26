/**
 * L03 — intent data access (ring ③). The ONLY file that touches `pr_intent`.
 *
 * Tenancy: `pr_intent` carries no `workspace_id` of its own (its PK IS the
 * pr_id it scopes), so both `get` and `upsert` verify workspace ownership
 * themselves — belt-and-braces on top of callers already resolving the pull
 * via `container.reviewRepo.getPull(workspaceId, ...)` first. `upsert` does
 * its check and its write in ONE transaction, so a mismatched workspace
 * writes nothing.
 */
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { IntentConfidence, IntentConfidenceBasis, IntentSource } from '@devdigest/shared';

export type IntentRow = typeof t.prIntent.$inferSelect;

export interface UpsertIntentInput {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  confidence: IntentConfidence;
  confidenceBasis: IntentConfidenceBasis;
  downgraded: boolean;
  sources: IntentSource[];
  inputHash: string;
  headSha: string;
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

const INTENT_COLUMNS = {
  prId: t.prIntent.prId,
  intent: t.prIntent.intent,
  inScope: t.prIntent.inScope,
  outOfScope: t.prIntent.outOfScope,
  confidence: t.prIntent.confidence,
  confidenceBasis: t.prIntent.confidenceBasis,
  downgraded: t.prIntent.downgraded,
  sources: t.prIntent.sources,
  inputHash: t.prIntent.inputHash,
  headSha: t.prIntent.headSha,
  provider: t.prIntent.provider,
  model: t.prIntent.model,
  tokensIn: t.prIntent.tokensIn,
  tokensOut: t.prIntent.tokensOut,
  costUsd: t.prIntent.costUsd,
  generatedAt: t.prIntent.generatedAt,
} as const;

export class IntentRepository {
  constructor(private db: Db) {}

  async get(workspaceId: string, prId: string): Promise<IntentRow | undefined> {
    const [row] = await this.db
      .select(INTENT_COLUMNS)
      .from(t.prIntent)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prIntent.prId))
      .where(and(eq(t.prIntent.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    return row;
  }

  /**
   * Tenancy-safe write: verifies the PR belongs to `workspaceId` and writes
   * `pr_intent` in the SAME transaction, so a mismatched workspace writes
   * nothing. Returns `undefined` when the PR isn't in that workspace — the
   * service (not this repository) turns that into a `NotFoundError`
   * (onion-architecture §6).
   */
  async upsert(
    workspaceId: string,
    prId: string,
    values: UpsertIntentInput,
  ): Promise<IntentRow | undefined> {
    const generatedAt = new Date();
    return this.db.transaction(async (tx) => {
      const [pull] = await tx
        .select({ id: t.pullRequests.id })
        .from(t.pullRequests)
        .where(and(eq(t.pullRequests.id, prId), eq(t.pullRequests.workspaceId, workspaceId)));
      if (!pull) return undefined;

      const [row] = await tx
        .insert(t.prIntent)
        .values({
          prId,
          intent: values.intent,
          inScope: values.inScope,
          outOfScope: values.outOfScope,
          confidence: values.confidence,
          confidenceBasis: values.confidenceBasis,
          downgraded: values.downgraded,
          sources: values.sources,
          inputHash: values.inputHash,
          headSha: values.headSha,
          provider: values.provider,
          model: values.model,
          tokensIn: values.tokensIn,
          tokensOut: values.tokensOut,
          costUsd: values.costUsd,
          generatedAt,
        })
        .onConflictDoUpdate({
          target: t.prIntent.prId,
          set: {
            intent: values.intent,
            inScope: values.inScope,
            outOfScope: values.outOfScope,
            confidence: values.confidence,
            confidenceBasis: values.confidenceBasis,
            downgraded: values.downgraded,
            sources: values.sources,
            inputHash: values.inputHash,
            headSha: values.headSha,
            provider: values.provider,
            model: values.model,
            tokensIn: values.tokensIn,
            tokensOut: values.tokensOut,
            costUsd: values.costUsd,
            generatedAt,
          },
        })
        .returning();
      return row!;
    });
  }
}
