import type { Skill, SkillAgentUsage, SkillVersion } from '@devdigest/shared';
// From db/rows.ts, the row types' source — importing them back from
// repository.ts would close a helpers -> repository -> helpers cycle.
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';

/**
 * Pure helpers for the skills module — row ⇄ DTO mapping and the two rules the
 * rest of the module reads off: what counts as a body change, and how a skill
 * is rendered once it reaches a prompt. No I/O.
 */

/** Map a persisted skill row to the public DTO. `agentCount` is derived, not stored. */
export function toSkillDto(row: SkillRow, agentCount?: number): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    source: row.source,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    agent_count: agentCount ?? 0,
  };
}

export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    note: row.note ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** True when a patch changes the TEXT (the thing versions exist to pin down). */
export function isBodyChange(existingBody: string, patchBody?: string): boolean {
  return patchBody !== undefined && patchBody !== existingBody;
}

/** Map the "which agents load this skill" join to its wire contract. */
export function toSkillAgentDto(row: {
  id: string;
  name: string;
  enabled: boolean;
  order: number;
}): SkillAgentUsage {
  return { id: row.id, name: row.name, enabled: row.enabled, order: row.order };
}
