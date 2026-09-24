/**
 * agents domain — the agent write models and the config-versioning rule.
 * Pure: no I/O, no DB types (the repository maps rows to/from these).
 */
import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';

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

// ---- linked skills (server/specs/03-skills.md Rules §4) ----------------------

/**
 * The ordered skill list after linking `skillId` at `order` (an index; clamped,
 * default = append). An already linked skill moves to the new position.
 */
export function withSkillAt(current: readonly string[], skillId: string, order?: number): string[] {
  const rest = current.filter((id) => id !== skillId);
  const at = order === undefined ? rest.length : Math.max(0, Math.min(order, rest.length));
  return [...rest.slice(0, at), skillId, ...rest.slice(at)];
}

/** True when two ordered link lists are identical (no change → no new agent version). */
export function sameSkillOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Requested skill ids that are not skills of the agent's workspace. */
export function unknownSkillIds(requested: readonly string[], known: ReadonlySet<string>): string[] {
  return requested.filter((id) => !known.has(id));
}

/** 422 `unknown_skill`: the links stay unchanged. */
export function unknownSkillError(ids: readonly string[]): ValidationError {
  return new ValidationError(`Unknown skill id(s) for this workspace: ${ids.join(', ')}`, { skill_ids: ids }, 'unknown_skill');
}
