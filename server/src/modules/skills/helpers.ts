import type { Skill, SkillStats, SkillVersion } from '@devdigest/shared';
import type { SkillRecord, SkillUsage, SkillUsageDetail, SkillVersionRecord } from './ports.js';

/** Pure DTO mappers for the skills module. */

/** `usage` is attached on the list endpoint only (card footer). */
export function toSkillDto(r: SkillRecord, usage?: SkillUsage): Skill {
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
    ...(usage
      ? { stats: { agents: usage.agents, pull_rate: pullRate(usage), accept_rate: acceptRate(usage) } }
      : {}),
  };
}

export const NO_USAGE: SkillUsage = { agents: 0, agentRuns: 0, pulledRuns: 0, accepted: 0, dismissed: 0 };

/** Share of the linked agents' runs that put the skill in the prompt (null = no runs). */
export function pullRate(u: Pick<SkillUsage, 'agentRuns' | 'pulledRuns'>): number | null {
  if (u.agentRuns === 0) return null;
  return Math.min(1, u.pulledRuns / u.agentRuns);
}

/** accepted / (accepted + dismissed); null until a finding is resolved. */
export function acceptRate(u: Pick<SkillUsage, 'accepted' | 'dismissed'>): number | null {
  const resolved = u.accepted + u.dismissed;
  return resolved > 0 ? u.accepted / resolved : null;
}

export function toSkillStatsDto(d: SkillUsageDetail): SkillStats {
  return {
    agents: d.agentList,
    pull_rate: pullRate(d),
    accept_rate: acceptRate(d),
    findings_30d: d.findings30d,
    by_category: d.byCategory,
  };
}

export function toSkillVersionDto(r: SkillVersionRecord): SkillVersion {
  return {
    skill_id: r.skillId,
    version: r.version,
    body: r.body,
    message: r.message,
    created_at: r.createdAt.toISOString(),
  };
}
