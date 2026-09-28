import { eq } from 'drizzle-orm';
import { IntentConfidence, IntentSource } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { IntentStore, StoredIntent } from './types.js';

/**
 * Owns `pr_intent`. The only file in the codebase that reaches this table —
 * the reviews module's old `upsertIntent`/`getIntent` were removed in the
 * schema stage.
 */
export class IntentRepository implements IntentStore {
  constructor(private db: Db) {}

  async get(prId: string): Promise<StoredIntent | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    if (!row) return undefined;

    const sourcesParsed = IntentSource.array().safeParse(row.sources);
    const confidenceParsed = IntentConfidence.safeParse(row.confidence);

    return {
      prId: row.prId,
      intent: row.intent,
      inScope: row.inScope,
      outOfScope: row.outOfScope,
      riskAreas: row.riskAreas,
      confidence: confidenceParsed.success ? confidenceParsed.data : 'low',
      sources: sourcesParsed.success ? sourcesParsed.data : [],
      sourceHash: row.sourceHash,
      textHash: row.textHash,
      headSha: row.headSha,
      provider: row.provider,
      model: row.model,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      costUsd: row.costUsd,
      derivedAt: row.derivedAt.toISOString(),
    };
  }

  async upsert(value: StoredIntent): Promise<void> {
    const row = {
      prId: value.prId,
      intent: value.intent,
      inScope: value.inScope,
      outOfScope: value.outOfScope,
      riskAreas: value.riskAreas,
      confidence: value.confidence,
      sources: value.sources,
      sourceHash: value.sourceHash,
      textHash: value.textHash,
      headSha: value.headSha,
      provider: value.provider,
      model: value.model,
      tokensIn: value.tokensIn,
      tokensOut: value.tokensOut,
      costUsd: value.costUsd,
      derivedAt: new Date(value.derivedAt),
    };
    await this.db
      .insert(t.prIntent)
      .values(row)
      .onConflictDoUpdate({ target: t.prIntent.prId, set: row });
  }

  async touchHeadSha(prId: string, headSha: string): Promise<void> {
    await this.db.update(t.prIntent).set({ headSha }).where(eq(t.prIntent.prId, prId));
  }
}
