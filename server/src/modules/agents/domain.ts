/**
 * agents domain — the agent write models and the config-versioning rule.
 * Pure: no I/O, no DB types (the repository maps rows to/from these).
 */
import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';

/** A new agent to persist (version 1 is snapshotted with it). */
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

/** A partial update of an agent; `undefined` fields are left unchanged. */
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

/** The persisted config fields a patch is compared against. */
export interface AgentConfigFields {
  name: string;
  description: string;
  provider: string;
  model: string;
  systemPrompt: string;
  strategy: string;
  ciFailOn: string;
  repoIntel: boolean;
}

/**
 * True when a patch changes config (vs. just toggling `enabled`) relative to the
 * existing agent — a config change bumps the version and snapshots agent_versions.
 * Any `outputSchema` in the patch counts as a change (it is not compared deeply).
 */
export function isConfigChange(existing: AgentConfigFields, patch: AgentPatch): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.provider !== undefined && patch.provider !== existing.provider) ||
    (patch.model !== undefined && patch.model !== existing.model) ||
    (patch.systemPrompt !== undefined && patch.systemPrompt !== existing.systemPrompt) ||
    (patch.strategy !== undefined && patch.strategy !== existing.strategy) ||
    (patch.ciFailOn !== undefined && patch.ciFailOn !== existing.ciFailOn) ||
    (patch.repoIntel !== undefined && patch.repoIntel !== existing.repoIntel) ||
    patch.outputSchema !== undefined
  );
}
