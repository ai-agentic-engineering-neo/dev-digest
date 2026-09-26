import type { Skill, SkillSource, SkillType, SkillVersion, SkillVersionDetail } from '@devdigest/shared';

/**
 * A1 — pure helpers for the skills module — DB row <-> DTO mapping and the
 * config-version-bump rule (S4). No I/O.
 *
 * Row shapes are declared structurally here (not imported from
 * `./repository.js`) so this file has no edge back out to infrastructure —
 * `repository.ts` importing `isSkillConfigChange` from here is a one-way
 * infra-depends-on-domain edge, not a cycle. `SkillsRepository`'s real
 * `SkillRow`/`SkillVersionRow` satisfy these shapes structurally.
 */

/** Aggregate fields populated only by the GET /skills list query; absent elsewhere. */
export interface SkillAggregates {
  agentCount?: number;
  pullRate?: number | null;
  acceptRate?: number | null;
}

interface SkillRowLike {
  id: string;
  name: string;
  description: string;
  type: string;
  source: string;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
}

interface SkillVersionRowLike {
  version: number;
  body: string;
  note: string | null;
  createdAt: Date;
}

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRowLike, agg?: SkillAggregates): Skill {
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
    agent_count: agg?.agentCount,
    pull_rate: agg?.pullRate,
    accept_rate: agg?.acceptRate,
  };
}

/** Map a `skill_versions` row to the list-item DTO; `current` is the caller's job to decide. */
export function toSkillVersionDto(row: SkillVersionRowLike, currentVersion: number): SkillVersion {
  return {
    version: row.version,
    note: row.note,
    created_at: row.createdAt.toISOString(),
    current: row.version === currentVersion,
  };
}

/** Map a `skill_versions` row to the single-version detail DTO (includes `body`). */
export function toSkillVersionDetailDto(row: SkillVersionRowLike): SkillVersionDetail {
  return {
    version: row.version,
    body: row.body,
    note: row.note,
    created_at: row.createdAt.toISOString(),
  };
}

/** Fields whose change bumps the skill's config version (S4) — anything but `enabled`. */
export interface SkillConfigPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
}

/**
 * True when a patch changes name/description/type/body relative to the
 * existing row (S4). Toggling `enabled` alone must NOT trip this — mirrors
 * `isConfigChange` in `agents/helpers.ts`.
 */
export function isSkillConfigChange(
  existing: Pick<SkillRowLike, 'name' | 'description' | 'type' | 'body'>,
  patch: SkillConfigPatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}

/**
 * S3 — the skill prompt block, injected verbatim into an agent's system prompt.
 * Invariant, byte-for-byte: another module's future prompt-assembly wiring
 * depends on this exact format.
 */
export function formatSkillBlock(name: string, description: string, body: string): string {
  return `### Skill: ${name}\n${description}\n\n${body}`;
}
