import { z } from 'zod';
import {
  INTENT_CONFIDENCES,
  INTENT_CONFIDENCE_REASONS,
  INTENT_DERIVATION_STATUSES,
  INTENT_KINDS,
  INTENT_SOURCE_KINDS,
  INTENT_SOURCE_REASONS,
  INTENT_SOURCE_STATUSES,
  INTENT_STALE_REASONS,
  type IntentSource,
  type PrIntent,
} from './domain/types.js';
import { INTENT_MAX_CHARS, SCOPE_ITEM_MAX_CHARS, SCOPE_MAX_ITEMS } from './constants.js';

export const IntentSourceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(INTENT_SOURCE_KINDS),
  ref: z.string(),
  weight: z.enum(['strong', 'weak']),
  status: z.enum(INTENT_SOURCE_STATUSES),
  reason: z.enum(INTENT_SOURCE_REASONS).nullable(),
  used: z.boolean(),
  cited: z.boolean(),
  issue_number: z.number().int().positive().nullable(),
  path: z.string().nullable(),
}) satisfies z.ZodType<IntentSource>;

export const IntentSourceList = z.array(IntentSourceSchema);

/**
 * Parses the jsonb `sources` column one entry at a time: an invalid entry is
 * dropped on its own instead of failing (and emptying) the whole list.
 */
export function parseIntentSources(raw: unknown): IntentSource[] {
  if (!Array.isArray(raw)) return [];
  const out: IntentSource[] = [];
  for (const entry of raw) {
    const parsed = IntentSourceSchema.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export const PrIntentResponse = z.object({
  pr_id: z.string().uuid(),
  status: z.enum(INTENT_DERIVATION_STATUSES),
  origin: z.enum(['derived', 'user']),
  intent: z.string().nullable(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  kind: z.enum(INTENT_KINDS),
  confidence: z.enum(INTENT_CONFIDENCES),
  confidence_reason: z.enum(INTENT_CONFIDENCE_REASONS),
  confidence_lowered: z.boolean(),
  sources: IntentSourceList,
  head_sha: z.string().nullable(),
  stale: z.boolean(),
  stale_reason: z.enum(INTENT_STALE_REASONS).nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  error: z.string().nullable(),
  updated_at: z.string(),
}) satisfies z.ZodType<PrIntent>;

export const PrIntentOrNull = PrIntentResponse.nullable();

const ScopeItem = z.string().trim().min(1).max(SCOPE_ITEM_MAX_CHARS);

export const IntentOverrideBody = z
  .object({
    intent: z.string().trim().min(1).max(INTENT_MAX_CHARS),
    in_scope: z.array(ScopeItem).max(SCOPE_MAX_ITEMS),
    out_of_scope: z.array(ScopeItem).max(SCOPE_MAX_ITEMS),
  })
  .strict();
export type IntentOverrideBody = z.infer<typeof IntentOverrideBody>;
