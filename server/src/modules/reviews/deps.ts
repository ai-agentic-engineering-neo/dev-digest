import type { GitClient, LLMProvider } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import type { RunBus } from '../../platform/sse.js';
import type { PromptLog } from '../../platform/prompt-log.js';
import type { RepoIntel } from '../repo-intel/types.js';
import type { AgentRow } from '../../db/rows.js';

/**
 * What the reviews use cases need from the outside, declared here by the
 * consumer. The DI container satisfies it structurally, so nothing in this
 * module imports the composition root.
 *
 * `agentsRepo` is the two-method slice this module reads; `AgentsRepository`
 * satisfies it structurally, so nothing here imports another module's data layer.
 */
export interface AgentsReader {
  listEnabled(workspaceId: string): Promise<AgentRow[]>;
  getById(workspaceId: string, id: string): Promise<AgentRow | undefined>;
}

/**
 * The one thing a run needs from the skills module: the ENABLED skills linked
 * to an agent, already in prompt order. Declared here (not imported from
 * `modules/skills`) for the same reason as `AgentsReader` — `SkillsRepository`
 * satisfies it structurally, so neither module reaches into the other's data
 * layer.
 */
export interface SkillsReader {
  linkedEnabled(agentId: string): Promise<
    { id: string; name: string; type: string; source: string; body: string }[]
  >;
}

/**
 * Restates `intent/types.ts`'s `ReviewIntentResolution` structurally rather
 * than importing it — a review never imports `modules/intent/*`
 * (`no-cross-module-internals`). `IntentService.resolveForReview` satisfies
 * `IntentResolver` without either module knowing about the other's types.
 */
export type ReviewIntentOutcome =
  | {
      status: 'ready';
      promptBlock: string;
      confidence: 'high' | 'medium' | 'low';
      cache: 'hit' | 'miss';
      provider: string | null;
      model: string | null;
      tokensIn: number | null;
      tokensOut: number | null;
      costUsd: number | null;
      sourcesUsed: string[];
      sourcesUnresolved: string[];
    }
  | {
      status: 'unavailable';
      reason: string;
    };

/** The one thing a review needs from the intent module: resolve-for-review.
 * Never throws — a failure is `{status:'unavailable', reason}`, not an
 * exception, so a missing/misbehaving intent step never fails a review. */
export interface IntentResolver {
  resolveForReview(
    workspaceId: string,
    prId: string,
    opts?: { correlationId?: string },
  ): Promise<ReviewIntentOutcome>;
}

export interface ReviewsDeps {
  readonly db: Db;
  readonly git: GitClient;
  readonly runBus: RunBus;
  readonly repoIntel: RepoIntel;
  readonly agentsRepo: AgentsReader;
  readonly skillsRepo: SkillsReader;
  readonly intentService: IntentResolver;
  readonly promptLog: PromptLog;
  llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider>;
}
