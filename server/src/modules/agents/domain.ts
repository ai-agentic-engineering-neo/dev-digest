import type { Agent, CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { BadRequestError } from '../../platform/errors.js';

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

// ---- skill links (M2) -------------------------------------------------------

/** One link of an agent to a skill, in list order. The order is the prompt order. */
export interface LinkSpec {
  skillId: string;
  enabled: boolean;
}

/** A skill id may appear once in a link set. */
export function assertNoDuplicateSkills(links: readonly LinkSpec[]): void {
  const seen = new Set<string>();
  for (const l of links) {
    if (seen.has(l.skillId)) {
      throw new BadRequestError('duplicate_skill', `Skill ${l.skillId} is listed more than once`);
    }
    seen.add(l.skillId);
  }
}

/** True when the ordered links differ (membership, order or a flag). */
export function linksChanged(current: readonly LinkSpec[], next: readonly LinkSpec[]): boolean {
  return (
    current.length !== next.length ||
    current.some((c, i) => c.skillId !== next[i]!.skillId || c.enabled !== next[i]!.enabled)
  );
}

/**
 * Link one skill into the ordered set. An existing link keeps its place unless
 * `order` is given; a new one is appended unless `order` is given. `order` is
 * clamped to the list. `enabled` defaults to true.
 */
export function upsertLink(
  current: readonly LinkSpec[],
  skillId: string,
  order: number | undefined,
  enabled: boolean | undefined,
): LinkSpec[] {
  const at = current.findIndex((l) => l.skillId === skillId);
  const link: LinkSpec = { skillId, enabled: enabled ?? true };
  const rest = current.filter((l) => l.skillId !== skillId);
  const pos = order ?? (at >= 0 ? at : rest.length);
  const clamped = Math.max(0, Math.min(pos, rest.length));
  return [...rest.slice(0, clamped), link, ...rest.slice(clamped)];
}
