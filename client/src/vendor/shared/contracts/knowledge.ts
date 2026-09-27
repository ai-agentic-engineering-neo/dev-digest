import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

/**
 * Sources whose text came from OUTSIDE the workspace. Lives here, beside the
 * enum, because two independent consumers act on it — the skills module (an
 * import lands disabled) and the review run (the prompt block is labelled
 * third-party). Two private copies would let a new source be added on one side
 * only, and the run trace would then present somebody else's instructions as
 * workspace-authored.
 */
export const THIRD_PARTY_SKILL_SOURCES: readonly SkillSource[] = ['imported_url', 'community'];

export function isThirdPartySkill(source: string): boolean {
  return (THIRD_PARTY_SKILL_SOURCES as readonly string[]).includes(source);
}

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  /**
   * How many agents currently link this skill. DERIVED from `agent_skills` on
   * read, never stored — every read fills it. `.default(0)` rather than
   * `.nullish()`: an older payload without the key still parses, and the
   * inferred type stays a plain `number` so no reader needs `?? 0`.
   */
  agent_count: z.number().int().nonnegative().default(0),
});
export type Skill = z.infer<typeof Skill>;

/**
 * One immutable snapshot of a skill's body. A save that changes the body writes
 * the NEXT version; restoring an old version writes a new one with that body,
 * so history is append-only and an eval run can be replayed against the exact
 * text it scored. `note` is the author's one-line "what changed".
 */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  note: z.string().nullish(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/**
 * An agent that links a skill, as `GET /skills/:id/agents` returns it. `order`
 * is the skill's position in that agent's prompt, 0-based.
 */
export const SkillAgentUsage = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  order: z.number().int(),
});
export type SkillAgentUsage = z.infer<typeof SkillAgentUsage>;

/** Why a file inside an imported archive did NOT become part of the skill. */
export const SkillSkipReason = z.enum(['executable', 'not-markdown', 'too-large', 'not-core']);
export type SkillSkipReason = z.infer<typeof SkillSkipReason>;

export const SkillSkippedFile = z.object({
  path: z.string(),
  reason: SkillSkipReason,
});
export type SkillSkippedFile = z.infer<typeof SkillSkippedFile>;

/**
 * What an import produced WITHOUT writing anything: the exact text that would
 * go into an agent's prompt, plus what was left behind. Nothing is persisted
 * until the user confirms this preview.
 */
export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  /** Archive entries that WERE read (the skill core). */
  files_used: z.array(z.string()),
  /** Archive entries deliberately ignored — executables are never unpacked. */
  files_skipped: z.array(SkillSkippedFile),
  warnings: z.array(z.string()),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

export const CommunitySkill = z.object({
  /** Catalog id — what `POST /skills/import/preview` takes as `community_id`. */
  id: z.string(),
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----

/**
 * The rubric a candidate falls under. An enum rather than free text: the UI
 * groups by it and the generated skill uses it for headings, and
 * `findings.severity` is the cautionary tale of a free-text column that the
 * Zod schema alone has to police.
 */
export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'imports',
  'types',
  'async',
  'error-handling',
  'api',
  'testing',
  'logging',
  'other',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

/**
 * Where a candidate stands with the user. `rejected` is a stored state, not the
 * absence of a row: a rejected rule must survive a reload AND a re-scan, and a
 * boolean `accepted` cannot tell "not yet looked at" from "looked at and said no".
 */
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

/**
 * One house rule proposed by a scan, after its evidence was verified against
 * the clone. `evidence_snippet` is read from the FILE, never from the model's
 * answer, and `evidence_sha` pins the GitHub deep-link to the commit that was
 * scanned so the line numbers stay true after the next push.
 */
export const ConventionCandidate = z.object({
  id: z.string(),
  repo_id: z.string(),
  rule: z.string(),
  /**
   * The model's one-sentence case for the rule, usually citing counts from the
   * measured facts. The snippet shows ONE occurrence; this says how widespread
   * the pattern is — the thing a reviewer weighs before accepting.
   */
  rationale: z.string().nullish(),
  category: ConventionCategory,
  status: ConventionStatus,
  confidence: z.number().min(0).max(1),
  evidence_path: z.string(),
  evidence_line_start: z.number().int().nullish(),
  evidence_line_end: z.number().int().nullish(),
  evidence_snippet: z.string(),
  evidence_sha: z.string().nullish(),
  scan_id: z.string().nullish(),
  /** The skill this candidate was folded into, once one was created. */
  skill_id: z.string().nullish(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

/** Why candidates the model returned did not become rows. */
export const ConventionDiscarded = z.object({
  missing_file: z.number().int().default(0),
  bad_lines: z.number().int().default(0),
  snippet_mismatch: z.number().int().default(0),
  duplicate: z.number().int().default(0),
  rejected_before: z.number().int().default(0),
});
export type ConventionDiscarded = z.infer<typeof ConventionDiscarded>;

export const ConventionScanStatus = z.enum(['running', 'done', 'failed']);
export type ConventionScanStatus = z.infer<typeof ConventionScanStatus>;

/**
 * One extraction run. Scan-level facts (which files the model saw, which model
 * answered, how much was thrown away) have no home on a candidate row, and the
 * page header states them: "Detected from N sample files · last scan 1h ago".
 */
export const ConventionScan = z.object({
  id: z.string(),
  repo_id: z.string(),
  status: ConventionScanStatus,
  provider: z.string(),
  model: z.string(),
  head_sha: z.string().nullish(),
  sample_files: z.array(z.string()),
  candidates_total: z.number().int(),
  candidates_kept: z.number().int(),
  discarded: ConventionDiscarded,
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number().nullish(),
  error: z.string().nullish(),
  started_at: z.string(),
  finished_at: z.string().nullish(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

/** What the Conventions screen loads in one request. */
export const ConventionsPage = z.object({
  scan: ConventionScan.nullable(),
  candidates: z.array(ConventionCandidate),
});
export type ConventionsPage = z.infer<typeof ConventionsPage>;

/**
 * What the model must return. This IS the required candidate shape — category,
 * rule, evidence as file + line, confidence — and it is enforced out of band by
 * the provider's structured-output mode, not by prompt text.
 *
 * Several evidence entries are allowed because a convention is a REPEATED
 * pattern; the verifier keeps the first that survives and drops the candidate
 * when none do.
 */
export const ConventionEvidence = z.object({
  path: z.string(),
  line_start: z.number().int(),
  line_end: z.number().int(),
  snippet: z.string(),
});
export type ConventionEvidence = z.infer<typeof ConventionEvidence>;

export const ConventionExtraction = z.object({
  candidates: z.array(
    z.object({
      category: ConventionCategory,
      rule: z.string(),
      rationale: z.string().nullish(),
      evidence: z.array(ConventionEvidence),
      confidence: z.number().min(0).max(1),
    }),
  ),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;

/** Body of a skill assembled from accepted candidates, before it is saved. */
export const ConventionsSkillPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  evidence_files: z.array(z.string()),
  candidate_count: z.number().int(),
});
export type ConventionsSkillPreview = z.infer<typeof ConventionsSkillPreview>;

// ---- Agents ----
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a CI review should BLOCK (REQUEST_CHANGES + fail the
// check) vs just comment. Deterministic from severities; acted on ONLY in CI.
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
  /**
   * How many skills this agent loads. DERIVED from `agent_skills` on read, like
   * `Skill.agent_count` in the other direction — the number on an agent card is
   * the number of blocks its prompt carries.
   */
  skill_count: z.number().int().nonnegative().default(0),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;
