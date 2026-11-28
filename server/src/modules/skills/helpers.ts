import type { Skill, SkillVersion } from '@devdigest/shared';
import type { SkillRecord, SkillUsageSummary, SkillVersionRecord } from './types.js';

/** Pure DTO mapping + rate math for the skills module. No I/O. */

/** ratio in [0,1] rounded to 2 decimals; null when the denominator is 0. */
export function rate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round(Math.min(1, num / den) * 100) / 100;
}

export function pullRate(s: SkillUsageSummary): number | null {
  return rate(s.runsWithSkill, s.agentRuns);
}

export function acceptRate(s: SkillUsageSummary): number | null {
  return rate(s.accepted, s.accepted + s.dismissed);
}

export function toSkillDto(r: SkillRecord, usage?: SkillUsageSummary): Skill {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    type: r.type,
    source: r.source,
    body: r.body,
    enabled: r.enabled,
    version: r.version,
    evidence_files: r.evidenceFiles,
    updated_at: r.updatedAt.toISOString(),
    stats: usage
      ? {
          agents_count: usage.agentsCount,
          pull_rate: pullRate(usage),
          accept_rate: acceptRate(usage),
        }
      : null,
  };
}

export function toSkillVersionDto(
  v: SkillVersionRecord,
  currentVersion: number,
  withBody: boolean,
): SkillVersion {
  return {
    version: v.version,
    change_note: v.changeNote,
    created_at: v.createdAt.toISOString(),
    current: v.version === currentVersion,
    ...(withBody ? { body: v.body } : {}),
  };
}
