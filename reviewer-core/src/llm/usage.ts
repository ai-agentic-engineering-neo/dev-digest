import type { LlmUsage, StructuredRequest } from '@devdigest/shared';

/**
 * Report ONE response's usage to the caller's `onUsage` hook. Observational:
 * a throwing hook must never break the LLM call, so its errors are swallowed.
 */
export function emitUsage(onUsage: StructuredRequest<unknown>['onUsage'], usage: LlmUsage): void {
  if (!onUsage) return;
  try {
    onUsage(usage);
  } catch {
    // ignore — accounting must not change control flow
  }
}

/** Null-propagating USD sum: one unpriced part makes the total unknown. */
export function addCost(total: number | null, part: number | null): number | null {
  return total == null || part == null ? null : total + part;
}

/**
 * Rough token estimate (~4 chars/token) for responses that arrive WITHOUT a
 * `usage` block — better than silently booking 0 tokens. Always ≥ 1 for
 * non-empty text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
