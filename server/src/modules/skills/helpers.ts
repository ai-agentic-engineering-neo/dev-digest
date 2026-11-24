import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from './repository.js';

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
  };
}

export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/** A body edit is the only change that bumps the skill version. */
export function isBodyChange(existing: { body: string }, patch: { body?: string }): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}
