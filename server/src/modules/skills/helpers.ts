import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from './repository.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping. No I/O.
 */

/**
 * Map a persisted skill row to the public `Skill` DTO. `agentsCount` is a
 * derived value (agent_skills links), not stored on the row — callers pass it
 * in from `SkillsRepository.agentCounts()`; omitted it defaults to 0.
 */
export function toSkillDto(row: SkillRow, agentsCount = 0): Skill {
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
    agents_count: agentsCount,
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    change_note: row.changeNote,
    created_at: row.createdAt.toISOString(),
  };
}
