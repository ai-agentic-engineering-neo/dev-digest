import type { GitClient, LLMProvider } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import type { RunBus } from '../../platform/sse.js';
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

export interface ReviewsDeps {
  readonly db: Db;
  readonly git: GitClient;
  readonly runBus: RunBus;
  readonly repoIntel: RepoIntel;
  readonly agentsRepo: AgentsReader;
  readonly skillsRepo: SkillsReader;
  llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider>;
}
