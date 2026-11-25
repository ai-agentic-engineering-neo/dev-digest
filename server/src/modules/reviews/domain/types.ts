import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';

/**
 * Domain types of the reviews module. Plain TS, no Drizzle: the field names and
 * types match the Drizzle rows (server/INSIGHTS.md "onion migration with shared
 * repos"), so ReviewRepository returns its rows through the port unchanged.
 * Each type carries only the fields the use cases read.
 */

/**
 * What a review run needs to know about an agent. The agents module's domain
 * `Agent` satisfies it structurally, so reviews never imports another module.
 */
export interface ReviewAgent {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  repoIntel: boolean;
  version: number;
}

/** The pull request a review runs against. */
export interface PullRequest {
  id: string;
  workspaceId: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  base: string;
  headSha: string;
  body: string | null;
}

/** Where a PR's repository lives on GitHub (enough to ask git for the diff). */
export interface RepoCoordinates {
  owner: string;
  name: string;
}

/** One persisted file patch of a PR (fallback diff source before a clone). */
export interface PrFilePatch {
  path: string;
  patch: string | null;
}

/** One agent's persisted review of a PR. */
export interface Review {
  id: string;
  prId: string;
  agentId: string | null;
  runId: string | null;
  kind: 'summary' | 'review';
  verdict: string | null;
  summary: string | null;
  score: number | null;
  model: string | null;
  createdAt: Date;
}

/** A persisted finding of a review (with the accept/dismiss decision). */
export interface ReviewFinding {
  id: string;
  reviewId: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: string;
  category: string;
  title: string;
  rationale: string;
  suggestion: string | null;
  confidence: number;
  kind: string;
  trifectaComponents: string[] | null;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

/** Fields of a new review row (the id and createdAt come from the store). */
export interface NewReview {
  workspaceId: string;
  prId: string;
  agentId: string | null;
  runId: string | null;
  kind: 'summary' | 'review';
  verdict: string | null;
  summary: string | null;
  score: number | null;
  model: string | null;
}

/** A new agent run, created in `running` state. */
export interface NewAgentRun {
  workspaceId: string;
  agentId: string | null;
  prId: string;
  provider: string | null;
  model: string | null;
}

/** The final state of an agent run. */
export interface AgentRunCompletion {
  status: 'done' | 'failed' | 'cancelled';
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  /** USD cost; null = unknown. */
  costUsd: number | null;
  findingsCount: number;
  grounding: string;
  /** Review score (0-100); null on failed/cancelled runs. */
  score?: number | null;
  /** Findings that tripped the agent's gate; 0 on failed/cancelled runs. */
  blockers?: number | null;
  /** Failure reason (status='failed') / cancellation note. Null clears it. */
  error?: string | null;
}

/** An in-flight run of a PR, joined with its agent's name. */
export interface ActiveRun {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  ran_at: string | null;
}
