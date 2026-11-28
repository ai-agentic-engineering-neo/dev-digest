import type {
  Agent,
  AgentVersion,
  CiFailOn,
  LLMProvider,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';

import type { AgentPatch } from './domain.js';

/**
 * A2 — what AgentsService needs from the outside world. `routes.ts` wires the
 * real implementations; tests pass in-memory fakes.
 */

export type { AgentPatch };

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

export interface LinkedSkill {
  skillId: string;
  order: number;
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
   * Apply a patch. When `newVersion` is given, store it as the agent's version
   * and record a config snapshot for it. Undefined when the agent is gone.
   */
  update(
    workspaceId: string,
    id: string,
    patch: AgentPatch,
    newVersion?: number,
  ): Promise<Agent | undefined>;
  /** Config snapshots, newest version first. */
  listVersions(agentId: string): Promise<AgentVersion[]>;
  getVersion(agentId: string, version: number): Promise<AgentVersion | undefined>;
  /** Skills linked to an agent, in `order` ascending. */
  linkedSkills(agentId: string): Promise<LinkedSkill[]>;
  /** Link a skill at a given order (idempotent: upserts the order). */
  linkSkill(agentId: string, skillId: string, order: number): Promise<void>;
  /** Replace the whole set of linked skills; order = index. */
  setSkills(agentId: string, skillIds: string[]): Promise<void>;
}

/**
 * Resolves the LLM adapter for a provider. A resolver, not an instance: the
 * adapter is built from a secret the user can change at runtime.
 */
export type ModelCatalog = (provider: Provider) => Promise<Pick<LLMProvider, 'listModels'>>;
