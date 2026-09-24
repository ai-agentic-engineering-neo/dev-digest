/**
 * Domain types of the reviews module. Plain shapes the use cases work with —
 * no Drizzle row types: the infrastructure maps its rows onto these (a DB row
 * with more columns still satisfies them structurally).
 */
import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';

/** What a review run needs to know about the agent that runs it. */
export interface ReviewAgent {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  /** Per-agent repo-intel toggle (Agent editor). */
  repoIntel: boolean;
  version: number;
}

/** The pull request under review (workspace-scoped). */
export interface ReviewPull {
  id: string;
  workspaceId: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  base: string;
  headSha: string;
  /** PR description — untrusted; null when empty. */
  body: string | null;
}

/** The repository a PR belongs to (enough to address the clone). */
export interface ReviewRepo {
  id: string;
  owner: string;
  name: string;
}

/** Run lifecycle states persisted on agent_runs.status. */
export type RunStatus = 'running' | 'done' | 'failed' | 'cancelled';

/** Status (+ failure note) of one run. `status` is null only on legacy rows. */
export interface RunState {
  id: string;
  status: string | null;
  error: string | null;
}

/** Token + USD usage of one run. */
export interface RunUsage {
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

/** Final stats of a run, written with its terminal status. */
export interface RunCompletion {
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  /** USD; null = unpriced model. */
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

/** A new agent_runs row (created in `running` state). */
export interface NewAgentRun {
  workspaceId: string;
  agentId: string | null;
  prId: string;
  provider: string | null;
  model: string | null;
}

/** A new persisted review (one agent's pass over a PR). */
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

/**
 * An enabled skill linked to the agent, as it goes into the run: rendered as a
 * `### <name>` block under `## Skills / rules`, recorded in agent_run_skills
 * at its exact `version`, and resolved from a finding's `skill` name.
 */
export interface ReviewSkill {
  id: string;
  name: string;
  description: string;
  body: string;
  version: number;
}
