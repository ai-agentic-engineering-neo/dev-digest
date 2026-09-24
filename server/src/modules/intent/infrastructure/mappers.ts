/** Row → contract mapper (timestamps become ISO strings for the response schema).
 *  `changeType`/`confidence`/`derivedFrom`/`sources` are already the contract's
 *  literal unions/shape — the `{ enum: [...] }` column option and `sources`'
 *  `.$type<IntentSource[]>()` (server/src/db/schema/reviews.ts) give drizzle-kit
 *  the row type directly, so no `as` cast is needed here. */
import type { PrIntentRecord } from '@devdigest/shared';
import type { PrIntentRow } from '../../../db/rows.js';

export function toPrIntentRecord(row: PrIntentRow): PrIntentRecord {
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    change_type: row.changeType,
    confidence: row.confidence,
    derived_from: row.derivedFrom,
    sources: row.sources,
    head_sha: row.headSha ?? '',
    input_hash: row.inputHash ?? '',
    prompt_version: row.promptVersion ?? 0,
    provider: row.provider ?? '',
    model: row.model ?? '',
    tokens_in: row.tokensIn ?? 0,
    tokens_out: row.tokensOut ?? 0,
    cost_usd: row.costUsd ?? null,
    derived_at: (row.derivedAt ?? new Date(0)).toISOString(),
  };
}
