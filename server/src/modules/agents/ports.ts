import type {
  Agent,
  AgentVersion,
  CiFailOn,
  LLMProvider,
  Provider,
  ReviewStrategy,
  SkillType,
} from '@devdigest/shared';

import type { AgentPatch, LinkSpec } from './domain.js';

/**
 * A2 — what AgentsService needs from the outside world. `routes.ts` wires the
 * real implementations; tests pass in-memory fakes.
 */

export type { AgentPatch, LinkSpec };

export interface NewAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

/** One stored link of an agent to a skill: the agents module's own columns. */
export interface SkillLink {
  skillId: string;
  order: number;
  /** Enabled on this link (per agent). */
  enabled: boolean;
}

/** What the agents module shows of a skill, read through the skills module. */
export interface SkillSummary {
  id: string;
  name: string;
  type: SkillType;
  /** The skill's global flag. */
  enabled: boolean;
}

/** Persistence for agents, their config versions and skill links. */
export interface AgentStore {
  list(workspaceId: string): Promise<Agent[]>;
  getById(workspaceId: string, id: string): Promise<Agent | undefined>;
  /** False when no such agent existed in the workspace. */
  deleteById(workspaceId: string, id: string): Promise<boolean>;
  /** Insert the agent and record its first config snapshot. */
  insert(values: NewAgent): Promise<Agent>;
  /**
   * Apply a patch. When `bumpVersion` is set, increment the agent's version
   * atomically and record a config snapshot for the new version. Undefined when the agent is gone.
   */
  update(
    workspaceId: string,
    id: string,
    patch: AgentPatch,
    bumpVersion?: boolean,
  ): Promise<Agent | undefined>;
  /** Config snapshots, newest version first. */
  listVersions(agentId: string): Promise<AgentVersion[]>;
  getVersion(agentId: string, version: number): Promise<AgentVersion | undefined>;
  /** The agent's links (link columns only), in `order` ascending. */
  linkedSkills(agentId: string): Promise<SkillLink[]>;
  /**
   * Replace the whole set of linked skills (order = index), bump the agent's
   * version and snapshot `skills` + `skill_links`, in one transaction.
   */
  setSkills(agentId: string, links: LinkSpec[]): Promise<void>;
}

/** Skills, owned by the skills module: the workspace check on link ids and the link display fields. */
export interface SkillLookup {
  /** The ids among `ids` that are skills of the workspace. */
  existingIds(workspaceId: string, ids: readonly string[]): Promise<string[]>;
  /** Name, type and global flag of the workspace's skills among `ids` (any order). */
  summaries(workspaceId: string, ids: readonly string[]): Promise<SkillSummary[]>;
}

/**
 * Resolves the LLM adapter for a provider. A resolver, not an instance: the
 * adapter is built from a secret the user can change at runtime.
 */
export type ModelCatalog = (provider: Provider) => Promise<Pick<LLMProvider, 'listModels'>>;
