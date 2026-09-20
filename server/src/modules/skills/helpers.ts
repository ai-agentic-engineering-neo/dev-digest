import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from './repository.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and the
 * body-version-bump rule. No I/O; mirrors `modules/agents/helpers.ts`.
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
    evidence_files: row.evidenceFiles ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/** Fields a body-change check needs from the patch. */
export interface BodyChangePatch {
  body?: string;
}

/**
 * True when a patch changes `body` (vs. metadata-only: name/description/type/
 * enabled) relative to the existing row — a body change bumps the version and
 * snapshots skill_versions.
 */
export function isBodyChange(existing: Pick<SkillRow, 'body'>, patch: BodyChangePatch): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}
