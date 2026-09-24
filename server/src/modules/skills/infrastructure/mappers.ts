/** skills row → contract DTO mappers (infrastructure: they know the row shapes). */
import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../../db/rows.js';

export function toSkillDto(row: SkillRow, usedBy: number): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    source_ref: row.sourceRef ?? null,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    used_by: usedBy,
  };
}

export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    description: row.description ?? null,
    message: row.message ?? null,
    created_at: row.createdAt.toISOString(),
  };
}
