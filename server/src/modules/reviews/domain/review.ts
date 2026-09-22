/**
 * Read-model rules for persisted reviews (pure).
 */
import type { ReviewRecord } from '@devdigest/shared';
import type { RunUsage } from './types.js';

/** A persisted review as stored — without the agent name / run usage joined in. */
export type StoredReview = Omit<ReviewRecord, 'agent_name' | 'cost_usd' | 'tokens_in' | 'tokens_out'>;

/**
 * Attach the producing agent's name and its run's usage. Usage keys are set
 * only when the review has a (surviving) run.
 */
export function withRunContext(
  review: StoredReview,
  agentName: string | null | undefined,
  usage: RunUsage | undefined,
): ReviewRecord {
  const { findings, ...rest } = review;
  return {
    ...rest,
    agent_name: agentName ?? null,
    ...(usage ? { cost_usd: usage.costUsd, tokens_in: usage.tokensIn, tokens_out: usage.tokensOut } : {}),
    findings,
  };
}

/** Distinct agent ids / run ids referenced by a set of reviews. */
export function referencedIds(reviews: readonly StoredReview[]): { agentIds: string[]; runIds: string[] } {
  return {
    agentIds: [...new Set(reviews.flatMap((r) => (r.agent_id ? [r.agent_id] : [])))],
    runIds: reviews.flatMap((r) => (r.run_id ? [r.run_id] : [])),
  };
}
