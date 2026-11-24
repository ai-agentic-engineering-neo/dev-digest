import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';

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

/** Agents port: which agents to run (backed by container.agentsRepo). */
export interface AgentsReader {
  listEnabled(workspaceId: string): Promise<ReviewAgent[]>;
  getById(workspaceId: string, id: string): Promise<ReviewAgent | undefined>;
}

/**
 * The three repo-intel reads a review uses for prompt context. Satisfied
 * structurally by the repo-intel facade (container.repoIntel); every call may
 * degrade to empty and must never fail a run.
 */
export interface ReviewContextSource {
  getCallerSignatures(
    repoId: string,
    changedFiles: string[],
    limit?: number,
  ): Promise<{ file: string; symbol: string; signature: string }[]>;
  getRepoMap(repoId: string): Promise<{ degraded?: boolean; text: string; tokens: number; cached: boolean }>;
  getFileRank(repoId: string, paths: string[]): Promise<{ percentile: number }[]>;
}
