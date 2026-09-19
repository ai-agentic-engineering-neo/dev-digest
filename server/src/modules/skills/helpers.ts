import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and the
 * config-version-bump rule. No I/O.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow, agentCount = 0): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    agent_count: agentCount,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    note: row.note ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** Fields whose change bumps the skill's version (anything but `enabled`). */
export interface ConfigChangePatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
}

/**
 * True when a patch changes config (vs. just toggling `enabled`) relative to the
 * existing row — a config change bumps the version and snapshots skill_versions.
 */
export function isConfigChange(
  existing: Pick<SkillRow, 'name' | 'description' | 'type' | 'body'>,
  patch: ConfigChangePatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}
