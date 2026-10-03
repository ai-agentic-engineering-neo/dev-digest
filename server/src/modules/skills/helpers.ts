import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from './repository.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping, the
 * config-version-bump rule, and markdown-import name derivation. No I/O.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? undefined,
    context_paths: row.contextPaths ?? [],
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    message: row.message ?? null,
    context_paths: row.contextPaths ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** Fields whose change bumps the skill's version (anything but `enabled`). */
export interface SkillConfigChangePatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
}

/**
 * True when a patch changes config (vs. just toggling `enabled`) relative to
 * the existing row — mirrors `isConfigChange` in the agents module.
 */
export function isSkillConfigChange(
  existing: Pick<SkillRow, 'name' | 'description' | 'type' | 'body'>,
  patch: SkillConfigChangePatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}

/**
 * Derive a skill name from the first markdown heading (`# Title`) in `body`,
 * for imports that don't supply an explicit name. Falls back to a generic
 * placeholder when no heading is found.
 */
export function deriveNameFromMarkdown(body: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || 'Untitled skill';
}
