import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from './repository.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and the
 * version-bump rule. No I/O.
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
  };
}

/** A single immutable body snapshot for a skill, as returned by `GET
 *  /skills/:id/versions` (not a vendored contract — skill_versions has no
 *  client-facing shape outside this route yet). */
export interface SkillVersionDto {
  skill_id: string;
  version: number;
  body: string;
  created_at: string;
}

/** Map a persisted `skill_versions` row to its public DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersionDto {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/** The only field whose change bumps a skill's version. */
export interface BodyChangePatch {
  body?: string;
}

/**
 * True when a patch changes `body` relative to the existing row. This is the
 * ONLY change that bumps the skill's version and snapshots skill_versions —
 * a bare `enabled` toggle (or a name/description/type edit) never bumps it.
 */
export function isBodyChange(existing: Pick<SkillRow, 'body'>, patch: BodyChangePatch): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}
