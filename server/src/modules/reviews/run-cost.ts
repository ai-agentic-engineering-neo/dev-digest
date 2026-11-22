import type { PriceBook } from '../../platform/price-book.js';

/**
 * Run cost in USD, DERIVED ON READ (never stored) from the run's model and
 * token usage, using the live OpenRouter price book with the static fallback.
 *
 * Returns null — rendered as "-" in the UI, never "$0.00" — when there was no
 * usage (zero tokens: failed/cancelled runs, or no usage reported) or when the
 * model has no price.
 */
export function runCost(
  priceBook: Pick<PriceBook, 'estimate'>,
  model: string | null | undefined,
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): number | null {
  const tin = tokensIn ?? 0;
  const tout = tokensOut ?? 0;
  if (!model || tin + tout === 0) return null;
  return priceBook.estimate(model, tin, tout);
}
