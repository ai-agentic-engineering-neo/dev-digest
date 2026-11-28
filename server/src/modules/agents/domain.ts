import type { Agent, CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';

/**
 * A2 — agent rules and the types they are stated in. Pure functions only.
 */

/** A partial change to an agent. Every field except `enabled` is config. */
export interface AgentPatch {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
}

/**
 * True when a patch changes config (vs. just toggling `enabled`) relative to the
 * stored agent — a config change bumps the version and snapshots agent_versions.
 */
export function isConfigChange(existing: Agent, patch: AgentPatch): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.provider !== undefined && patch.provider !== existing.provider) ||
    (patch.model !== undefined && patch.model !== existing.model) ||
    (patch.systemPrompt !== undefined && patch.systemPrompt !== existing.system_prompt) ||
    (patch.strategy !== undefined && patch.strategy !== existing.strategy) ||
    (patch.ciFailOn !== undefined && patch.ciFailOn !== existing.ci_fail_on) ||
    (patch.repoIntel !== undefined && patch.repoIntel !== existing.repo_intel) ||
    patch.outputSchema !== undefined
  );
}
