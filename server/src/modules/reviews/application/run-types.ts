import type { Review as EngineReview } from '@devdigest/shared';
import type { Review, ReviewFinding } from '../domain/types.js';

/** Thrown by a run when the user cancels it mid-flight (between map files). */
export class RunCancelledError extends Error {
  constructor() {
    super('Run cancelled');
    this.name = 'RunCancelledError';
  }
}

// A reduced "Review per file" — same schema as Review (the model returns a small
// Review per file; we merge findings + take the worst verdict / mean score).
export type RunOutcome = {
  review: Review;
  findings: ReviewFinding[];
  grounding: string;
  raw: EngineReview;
};

/** Token/cost usage accumulated over a run's LLM calls. */
export type RunUsage = { tokensIn: number; tokensOut: number; costUsd: number | null };
