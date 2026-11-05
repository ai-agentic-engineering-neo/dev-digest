import type { SkillSource, SkillType } from '@devdigest/shared';

/**
 * Skills — pure domain rules. A skill is TEXT ONLY: a named, typed markdown body
 * that is appended to an agent's prompt. It never runs code, never calls tools.
 */

/** Sources whose bodies were authored inside this workspace (trusted rules). */
const TRUSTED_SOURCES: ReadonlySet<SkillSource> = new Set<SkillSource>(['manual', 'extracted']);

/** Imported / community skills are someone else's instructions → untrusted. */
export function isTrustedSkillSource(source: SkillSource): boolean {
  return TRUSTED_SOURCES.has(source);
}

/** Editable fields of a skill. */
export interface SkillContent {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

/**
 * True when a patch changes the skill's content (anything but `enabled`) —
 * such a change bumps the version and snapshots `skill_versions`.
 */
export function isSkillContentChange(existing: SkillContent, patch: Partial<SkillContent>): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}

/** A skill resolved for one review run (enabled + linked, in agent order). */
export interface PromptSkill {
  /** Skill id + version — recorded per run (run_skills) for the Stats tab. */
  id: string;
  version: number;
  name: string;
  body: string;
  trusted: boolean;
}

// ---- Version notes ----------------------------------------------------------

export const DEFAULT_INITIAL_NOTE = 'Initial version';
export const DEFAULT_UPDATE_NOTE = 'Updated';
export const MAX_VERSION_NOTE_CHARS = 200;

/** The note stored on a new version row: the user's "what changed", else a default. */
export function versionNote(note: string | undefined | null, isInitial: boolean): string {
  const trimmed = note?.trim().slice(0, MAX_VERSION_NOTE_CHARS);
  if (trimmed) return trimmed;
  return isInitial ? DEFAULT_INITIAL_NOTE : DEFAULT_UPDATE_NOTE;
}

// ---- Stats (Skills · Stats tab) ---------------------------------------------

export const STATS_WINDOW_DAYS = 30;

/** Raw rows the stats are computed from (one workspace, one time window). */
export interface SkillStatsData {
  runs: { id: string; agentId: string | null }[];
  runSkills: { runId: string; skillId: string }[];
  links: { skillId: string; agentId: string }[];
  findings: { runId: string; category: string; accepted: boolean; dismissed: boolean }[];
}

export interface SkillCardStats {
  /** Agents linked now. */
  agents: number;
  /** Share of eligible runs whose prompt included the skill; null = no runs. */
  pull_rate: number | null;
  /** accepted ÷ (accepted + dismissed) of findings from those runs; null = no decisions. */
  accept_rate: number | null;
}

export interface SkillStats extends SkillCardStats {
  used_by: { id: string; name: string }[];
  runs_30d: number;
  findings_30d: number;
  by_category: { category: string; count: number }[];
  window_days: number;
}

/**
 * Card numbers for one skill. Eligible runs = runs of agents linked now OR runs
 * that included the skill (so pull_rate ≤ 1 even after an unlink). Attribution
 * is correlation: a finding counts for every skill in that run's prompt.
 */
export function computeSkillStats(
  skillId: string,
  data: SkillStatsData,
): Omit<SkillStats, 'used_by' | 'window_days'> {
  const linkedAgents = new Set(data.links.filter((l) => l.skillId === skillId).map((l) => l.agentId));
  const withSkill = new Set(data.runSkills.filter((r) => r.skillId === skillId).map((r) => r.runId));
  const eligible = data.runs.filter((r) => withSkill.has(r.id) || (r.agentId !== null && linkedAgents.has(r.agentId)));
  const findings = data.findings.filter((f) => withSkill.has(f.runId));
  const accepted = findings.filter((f) => f.accepted).length;
  const decided = findings.filter((f) => f.accepted || f.dismissed).length;
  const byCategory = new Map<string, number>();
  for (const f of findings) byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1);
  return {
    agents: linkedAgents.size,
    pull_rate: eligible.length > 0 ? withSkill.size / eligible.length : null,
    accept_rate: decided > 0 ? accepted / decided : null,
    runs_30d: withSkill.size,
    findings_30d: findings.length,
    by_category: [...byCategory.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
  };
}

/**
 * Skill import preview (response of POST /skills/import/preview). A .md file or
 * .zip archive is parsed into this before anything is saved; executable/binary
 * archive entries are never run — only listed as `ignored`.
 * Kept module-local on purpose: `vendor/shared` is "Do not touch" (AGENTS.md).
 * The client mirrors this shape in client/src/lib/types.ts.
 */
export type SkillImportFileStatus = 'used' | 'ignored';

export interface SkillImportFile {
  path: string;
  size: number;
  status: SkillImportFileStatus;
  reason?: string | null;
}

export interface SkillImportPreview {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  files: SkillImportFile[];
  warnings: string[];
}

// Naming rules live in modules/_shared so other skill-creating modules reuse them.
export { SKILL_NAME_PATTERN, toSkillSlug } from '../_shared/skill-name.js';
