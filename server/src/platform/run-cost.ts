/**
 * Per-run cost, computed on read: tokens × current price (PriceBook — live
 * OpenRouter price, else the static table). Not persisted, so it is an estimate
 * at today's price. No LLM calls.
 */
export interface CostEstimator {
  estimate(model: string, tokensIn: number, tokensOut: number): number | null;
}

/**
 * USD cost of one run, or null when it can't be known: no model, no token
 * counts, zero tokens (failed/cancelled runs record 0/0), or an unpriced model.
 */
export function runCostUsd(
  prices: CostEstimator,
  model: string | null | undefined,
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): number | null {
  if (!model || tokensIn == null || tokensOut == null) return null;
  if (tokensIn + tokensOut === 0) return null;
  return prices.estimate(model, tokensIn, tokensOut);
}
