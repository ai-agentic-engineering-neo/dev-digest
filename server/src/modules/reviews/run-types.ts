import type { GitClient, LLMProvider, Provider, Review } from '@devdigest/shared';
import type { RunBus } from '../../platform/sse.js';
import type { ReviewRepository, FindingRow, ReviewRow } from './infrastructure/review.repository.js';
import type { ReviewContextSource } from './types.js';

/** Thrown by a run when the user cancels it mid-flight (between map files). */
export class RunCancelledError extends Error {
  constructor() {
    super('Run cancelled');
    this.name = 'RunCancelledError';
  }
}

/** Minimal structured logger (pino-compatible: (obj, msg)) for runtime logs. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

// A reduced "Review per file" — same schema as Review (the model returns a small
// Review per file; we merge findings + take the worst verdict / mean score).
export type RunOutcome = {
  review: ReviewRow;
  findings: FindingRow[];
  grounding: string;
  raw: Review;
};

/** What a background review run needs — never the Container itself. */
export interface ReviewRunDeps {
  repo: ReviewRepository;
  runBus: RunBus;
  llmFor: (provider: Provider) => Promise<LLMProvider>;
  repoIntel: ReviewContextSource;
  git: Pick<GitClient, 'diff'>;
}

/** Token/cost usage accumulated over a run's LLM calls. */
export type RunUsage = { tokensIn: number; tokensOut: number; costUsd: number | null };
