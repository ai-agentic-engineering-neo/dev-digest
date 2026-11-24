import type { ModelInfo, Provider } from '@devdigest/shared';
import type { UnitOfWork } from '../../_shared/domain/unit-of-work.js';
import type {
  Agent,
  AgentConfigSnapshot,
  AgentVersion,
  NewAgent,
  SkillLink,
} from './types.js';

/** Persistence port for agents, their version snapshots and skill links. */
export interface AgentsRepository {
  list(workspaceId: string): Promise<Agent[]>;
  listEnabled(workspaceId: string): Promise<Agent[]>;
  getById(workspaceId: string, id: string): Promise<Agent | undefined>;
  /** Insert a new agent at `version` (no snapshot — the use case records it). */
  create(input: NewAgent, version: number): Promise<Agent>;
  /** Persist every mutable field of `agent` (incl. version); returns the stored agent. */
  save(agent: Agent): Promise<Agent>;
  /** False when no such agent exists in the workspace. */
  delete(workspaceId: string, id: string): Promise<boolean>;

  /** Record an immutable snapshot; a duplicate (agent, version) is ignored. */
  appendVersion(agentId: string, version: number, config: AgentConfigSnapshot): Promise<void>;
  /** Newest version first. */
  listVersions(agentId: string): Promise<AgentVersion[]>;
  getVersion(agentId: string, version: number): Promise<AgentVersion | undefined>;

  /** Ordered by `order` ascending. */
  skillLinks(agentId: string): Promise<SkillLink[]>;
  /** Upsert one link's order. */
  linkSkill(agentId: string, skillId: string, order: number): Promise<void>;
  /** Replace all links with `skillIds`, order = index. */
  setSkills(agentId: string, skillIds: string[]): Promise<void>;
}

export type AgentsUnitOfWork = UnitOfWork<{ agents: AgentsRepository }>;

/** Lists the models a provider offers (backed by the LLM adapter). */
export interface ModelCatalog {
  listModels(): Promise<ModelInfo[]>;
}

export type ModelCatalogFor = (provider: Provider) => Promise<ModelCatalog>;
