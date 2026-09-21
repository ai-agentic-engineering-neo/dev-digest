import type { Skill, SkillStats, SkillVersion } from '@devdigest/shared';
import type {
  SkillRecord,
  SkillUsageCounts,
  SkillVersionRecord,
  UpdateSkill,
} from './types.js';

/**
 * Pure helpers for the skills module — record ⇄ DTO mapping, the
 * body-version-bump rule and the stats rate maths. No I/O.
 */

/** Map a persisted skill to the public `Skill` DTO (camelCase → snake_case). */
export function toSkillDto(row: SkillRecord): Skill {
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
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRecord): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * True when a patch actually changes the skill body relative to the existing
 * row. Only a body change bumps `version` and snapshots `skill_versions`;
 * name/description/type/enabled edits never do.
 */
export function isBodyChange(existing: Pick<SkillRecord, 'body'>, patch: UpdateSkill): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}

/** `num / den` as a percentage with one decimal; null when there is nothing to divide by. */
export function toPercent(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

/** Derive the public rate fields from raw counts. */
export function toRates(c: SkillUsageCounts): {
  used_by: number;
  pull_rate: number | null;
  accept_rate: number | null;
} {
  return {
    used_by: c.usedBy,
    pull_rate: toPercent(c.pulledRuns, c.eligibleRuns),
    accept_rate: toPercent(c.accepted, c.decided),
  };
}

/** Counts for a skill nothing has touched yet. */
export const EMPTY_USAGE: SkillUsageCounts = {
  usedBy: 0,
  agentsUsing: [],
  pulledRuns: 0,
  eligibleRuns: 0,
  accepted: 0,
  decided: 0,
  findings30d: 0,
  findingsByCategory: [],
};

/** Map raw usage counts to the public `SkillStats` DTO. */
export function toSkillStatsDto(c: SkillUsageCounts): SkillStats {
  return {
    ...toRates(c),
    findings_30d: c.findings30d,
    agents_using: c.agentsUsing,
    findings_by_category: c.findingsByCategory,
  };
}
