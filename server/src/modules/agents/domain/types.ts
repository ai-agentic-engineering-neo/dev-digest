import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';

/**
 * Agents domain types — plain TS, camelCase, no persistence or transport
 * concerns. `Agent` deliberately keeps the same field names and types as the
 * persisted row so legacy consumers typed against `AgentRow` (reviews) keep
 * compiling until they migrate to this type.
 */
export interface Agent {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema: unknown;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  repoIntel: boolean;
  enabled: boolean;
  version: number;
  createdBy: string | null;
  createdAt: Date;
}

/** What a caller supplies to create an agent; omitted fields take defaults. */
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

/** Fields an update may change. `undefined` = leave as is. */
export type AgentPatch = Partial<
  Pick<
    Agent,
    | 'name'
    | 'description'
    | 'provider'
    | 'model'
    | 'systemPrompt'
    | 'outputSchema'
    | 'strategy'
    | 'ciFailOn'
    | 'repoIntel'
    | 'enabled'
  >
>;

/** The immutable config captured in agent_versions when the config changes. */
export interface AgentConfigSnapshot {
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  repoIntel: boolean;
  /** Ordered skill ids linked at snapshot time. */
  skills: string[];
}

export interface AgentVersion {
  agentId: string;
  version: number;
  config: AgentConfigSnapshot;
  createdAt: Date;
}

/** A skill linked to an agent, with its position. */
export interface SkillLink {
  skillId: string;
  order: number;
}
