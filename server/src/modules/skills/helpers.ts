import type {
  AgentSuggestion,
  AgentSuggestionReason,
  ConventionCategory,
  Skill,
  SkillAgentActivity,
  SkillSource,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';
import {
  CATEGORY_KEYWORDS,
  EDITED_BODY_MESSAGE,
  INITIAL_VERSION_MESSAGE,
  KEYWORD_SATURATION,
  MAX_AGENT_SUGGESTIONS,
  MAX_REASON_KEYWORDS,
  MIN_TOKEN_LENGTH,
  PG_UNIQUE_VIOLATION,
  PRESELECT_THRESHOLD,
  restoredFromMessage,
  SUGGESTION_BODY_CHARS,
  SUGGESTION_STOP_WORDS,
  SUGGESTION_WEIGHTS,
  SUGGESTION_WEIGHTS_NO_CATEGORY,
  TYPE_SATURATION,
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

// ---- Agent suggestions (pure) ------------------------------------------------

/** What scoring needs from the skill (categories come from its conventions). */
export interface SuggestionSkill {
  name: string;
  description: string;
  body: string;
  type: SkillType;
  categories: readonly ConventionCategory[];
}

/** An enabled agent of the workspace that does not have the skill linked yet. */
export interface SuggestionAgent {
  id: string;
  name: string;
  description: string;
  /** How many skills of each type the agent already uses. */
  linkedSkillTypes: Partial<Record<SkillType, number>>;
}

export interface AgentScore {
  score: number;
  reasons: AgentSuggestionReason[];
}

/** Naive English singular: dependencies → dependency, classes → class, errors → error. */
export function normalizeToken(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ss|ch|sh|x)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * Drop fenced code (identifiers, not topic words). Same rule as the conventions
 * body parser: a fence closes only with the same character, at least as long,
 * with nothing after it; any indent counts (fences inside list items); an
 * unclosed fence runs to the end.
 */
export function stripCodeFences(markdown: string): string {
  const kept: string[] = [];
  let fence: { ch: string; len: number } | null = null;
  for (const line of markdown.split('\n')) {
    const f = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (f) {
      const marker = f[1]!;
      if (!fence) fence = { ch: marker[0]!, len: marker.length };
      else if (marker[0] === fence.ch && marker.length >= fence.len && !f[2]!.trim()) fence = null;
      continue;
    }
    if (!fence) kept.push(line);
  }
  return kept.join('\n');
}

/**
 * Distinct normalized tokens → the first original spelling (for reasons).
 * Tokens are `[a-z0-9]+`, ≥ MIN_TOKEN_LENGTH, not numeric, not stop-words.
 */
export function suggestionTokens(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < MIN_TOKEN_LENGTH || /^\d+$/.test(raw)) continue;
    const norm = normalizeToken(raw);
    if (SUGGESTION_STOP_WORDS.has(raw) || SUGGESTION_STOP_WORDS.has(norm)) continue;
    if (!out.has(norm)) out.set(norm, raw);
  }
  return out;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Code-only fit of a skill to one agent (plan §D, F16): convention categories ↔
 * category words in the agent's name/description, the skill's type ↔ types the
 * agent already uses (`custom` carries no signal), and shared words. Each
 * signal is 0..1; the weighted sum is the score (2 decimals).
 */
export function scoreAgentForSkill(skill: SuggestionSkill, agent: SuggestionAgent): AgentScore {
  const categories = [...new Set(skill.categories)].filter((c) => c !== 'general');
  const weights = categories.length > 0 ? SUGGESTION_WEIGHTS : SUGGESTION_WEIGHTS_NO_CATEGORY;
  const agentTokens = suggestionTokens(`${agent.name} ${agent.description}`);
  const reasons: AgentSuggestionReason[] = [];
  let score = 0;

  const matched = categories.filter((c) =>
    CATEGORY_KEYWORDS[c].some((k) => agentTokens.has(normalizeToken(k))),
  );
  if (matched.length > 0) {
    score += weights.category * (matched.length / categories.length);
    reasons.push({ kind: 'category', categories: matched });
  }

  const sameType = skill.type === 'custom' ? 0 : agent.linkedSkillTypes[skill.type] ?? 0;
  if (sameType > 0) {
    score += weights.type * (Math.min(sameType, TYPE_SATURATION) / TYPE_SATURATION);
    reasons.push({ kind: 'type', type: skill.type, count: sameType });
  }

  const skillTokens = suggestionTokens(
    `${skill.name} ${skill.description} ${stripCodeFences(skill.body).slice(0, SUGGESTION_BODY_CHARS)}`,
  );
  const shared = [...agentTokens].filter(([norm]) => skillTokens.has(norm)).map(([, raw]) => raw);
  if (shared.length > 0) {
    score += weights.keywords * (Math.min(shared.length, KEYWORD_SATURATION) / KEYWORD_SATURATION);
    reasons.push({ kind: 'keywords', keywords: shared.slice(0, MAX_REASON_KEYWORDS) });
  }

  return { score: round2(score), reasons };
}

/** Scored agents → suggestions: score > 0, best first (then name), top N, preselect flag. */
export function rankAgentSuggestions(
  skill: SuggestionSkill,
  agents: readonly SuggestionAgent[],
): AgentSuggestion[] {
  return agents
    .map((a) => ({ a, s: scoreAgentForSkill(skill, a) }))
    .filter(({ s }) => s.score > 0)
    .sort((x, y) => y.s.score - x.s.score || x.a.name.localeCompare(y.a.name))
    .slice(0, MAX_AGENT_SUGGESTIONS)
    .map(({ a, s }) => ({
      agent_id: a.id,
      agent_name: a.name,
      score: s.score,
      preselected: s.score >= PRESELECT_THRESHOLD,
      reasons: s.reasons,
    }));
}
