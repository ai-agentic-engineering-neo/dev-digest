import type { LlmUsage } from '@devdigest/shared';
import { addCost } from '@devdigest/reviewer-core';

/**
 * Accumulates the per-response usage a run's LLM calls report via `onUsage`.
 *
 * The engine only returns usage on SUCCESS (ReviewOutcome); when a run fails or
 * is cancelled mid-way the error carries nothing, so the executor reads the
 * meter instead — that is how failed/cancelled runs record what they spent
 * (earlier map-reduce chunks, schema-invalid retry attempts).
 *
 * `costUsd` starts at 0 (no call ⇒ nothing billed) and becomes null for good
 * once any response is unpriced.
 */
export class UsageMeter {
  tokensIn = 0;
  tokensOut = 0;
  costUsd: number | null = 0;
  calls = 0;

  /** Bound so it can be passed straight as `onUsage`. */
  readonly add = (u: LlmUsage): void => {
    this.calls++;
    this.tokensIn += u.tokensIn;
    this.tokensOut += u.tokensOut;
    this.costUsd = addCost(this.costUsd, u.costUsd);
  };
}
