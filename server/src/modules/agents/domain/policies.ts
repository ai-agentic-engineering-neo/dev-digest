import type { Agent, AgentConfigSnapshot, AgentPatch } from './types.js';

/** Version recorded for a newly created agent. */
export const INITIAL_AGENT_VERSION = 1;

/** Description used when none is supplied on create. */
export const DEFAULT_AGENT_DESCRIPTION = '';

/**
 * True when a patch changes the agent's config (anything but `enabled`).
 * `outputSchema` counts as a change whenever it is present — JSON schemas are
 * not compared structurally.
 */
export function isConfigChange(agent: Agent, patch: AgentPatch): boolean {
  return (
    (patch.name !== undefined && patch.name !== agent.name) ||
    (patch.description !== undefined && patch.description !== agent.description) ||
    (patch.provider !== undefined && patch.provider !== agent.provider) ||
    (patch.model !== undefined && patch.model !== agent.model) ||
    (patch.systemPrompt !== undefined && patch.systemPrompt !== agent.systemPrompt) ||
    (patch.strategy !== undefined && patch.strategy !== agent.strategy) ||
    (patch.ciFailOn !== undefined && patch.ciFailOn !== agent.ciFailOn) ||
    (patch.repoIntel !== undefined && patch.repoIntel !== agent.repoIntel) ||
    patch.outputSchema !== undefined
  );
}

/**
 * Apply a patch: defined fields overwrite, a config change bumps the version.
 * The caller records a new snapshot when `versionBumped` is true.
 */
export function applyAgentPatch(
  agent: Agent,
  patch: AgentPatch,
): { next: Agent; versionBumped: boolean } {
  const versionBumped = isConfigChange(agent, patch);
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as AgentPatch;
  return {
    next: { ...agent, ...defined, version: versionBumped ? agent.version + 1 : agent.version },
    versionBumped,
  };
}

/** The config snapshot for an agent at its current version. */
export function configSnapshotOf(agent: Agent, skillIds: string[]): AgentConfigSnapshot {
  return {
    provider: agent.provider,
    model: agent.model,
    systemPrompt: agent.systemPrompt,
    outputSchema: agent.outputSchema,
    strategy: agent.strategy,
    ciFailOn: agent.ciFailOn,
    repoIntel: agent.repoIntel,
    skills: skillIds,
  };
}
