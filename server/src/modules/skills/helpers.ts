import type {
  Skill,
  SkillAgentActivity,
  SkillSource,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';
import {
  EDITED_BODY_MESSAGE,
  INITIAL_VERSION_MESSAGE,
  PG_UNIQUE_VIOLATION,
  restoredFromMessage,
} from './constants.js';

/**
 * Pure helpers for the skills module: record → DTO mapping, the "only a body
 * change creates a version" rule, default version messages and the stats rate.
 * No I/O, no drizzle: inputs are structural records the repository maps from rows.
 */

/** The persisted skill fields the DTO needs (a `skills` row satisfies it). */
export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  type: string;
  source: string;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The persisted version fields the DTO needs (a `skill_versions` row satisfies it). */
export interface SkillVersionRecord {
  skillId: string;
  version: number;
  body: string;
  message: string;
  createdAt: Date;
}

export function toSkillDto(row: SkillRecord, agentCount: number): Skill {
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
    updated_at: row.updatedAt.toISOString(),
    agent_count: agentCount,
  };
}

export function toSkillVersionDto(row: SkillVersionRecord): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    message: row.message,
    created_at: row.createdAt.toISOString(),
  };
}

/** True when the patch carries a body that differs from the stored one. */
export function isBodyChange(currentBody: string, nextBody: string | undefined): boolean {
  return nextBody !== undefined && nextBody !== currentBody;
}

export type VersionMessageInput =
  | { kind: 'initial' }
  | { kind: 'edit'; message?: string | undefined }
  | { kind: 'restore'; from: number };

/**
 * Message stored on a `skill_versions` row. v1 → `Initial version`; an edit uses
 * the user's "What changed?" text, or `Edited body` when it is blank; a restore
 * → `Restored from v{n}`.
 */
export function versionMessage(input: VersionMessageInput): string {
  switch (input.kind) {
    case 'initial':
      return INITIAL_VERSION_MESSAGE;
    case 'edit': {
      const trimmed = input.message?.trim() ?? '';
      return trimmed.length > 0 ? trimmed : EDITED_BODY_MESSAGE;
    }
    case 'restore':
      return restoredFromMessage(input.from);
  }
}

/** `num ÷ den`, or null when there is nothing to divide by (nothing decided). */
export function rate(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

/** Per-agent 30-day counters as aggregated by the repository. */
export interface AgentActivityCounts {
  runs: number;
  findings: number;
  accepted: number;
  dismissed: number;
}

/**
 * One row of the Stats "Agents using this skill" panel. Agents with no runs in
 * the window get zeros and a null accept rate.
 */
export function toAgentActivity(
  agent: { agent_id: string; agent_name: string; enabled: boolean },
  counts: AgentActivityCounts | undefined,
): SkillAgentActivity {
  const c = counts ?? { runs: 0, findings: 0, accepted: 0, dismissed: 0 };
  return {
    agent_id: agent.agent_id,
    agent_name: agent.agent_name,
    enabled: agent.enabled,
    runs_30d: c.runs,
    findings_30d: c.findings,
    accept_rate_30d: rate(c.accepted, c.accepted + c.dismissed),
  };
}

/** Start of the stats window: `days` before `now`. */
export function windowStart(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * True when `err` (or any error in its `cause` chain) is a Postgres
 * unique_violation. Drizzle 0.45 wraps driver errors in `DrizzleQueryError`
 * with the postgres-js error as `cause`, so checking only `err.code` misses it.
 */
export function isUniqueViolation(err: unknown, uniqueViolationCode = PG_UNIQUE_VIOLATION): boolean {
  let cur: unknown = err;
  for (let depth = 0; cur && typeof cur === 'object' && depth < 5; depth++) {
    if ((cur as { code?: unknown }).code === uniqueViolationCode) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}
