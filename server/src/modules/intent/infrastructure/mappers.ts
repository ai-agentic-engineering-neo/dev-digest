/** Row → contract mapper (timestamps become ISO strings for the response schema). */
import type {
  IntentChangeType,
  IntentConfidence,
  IntentDerivedFrom,
  IntentSource,
  PrIntentRecord,
} from '@devdigest/shared';
import type { PrIntentRow } from '../../../db/rows.js';

export function toPrIntentRecord(row: PrIntentRow): PrIntentRecord {
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    change_type: (row.changeType as IntentChangeType | null) ?? null,
    confidence: (row.confidence as IntentConfidence | null) ?? null,
    derived_from: (row.derivedFrom as IntentDerivedFrom | null) ?? 'inferred',
    sources: (row.sources as IntentSource[] | null) ?? [],
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
