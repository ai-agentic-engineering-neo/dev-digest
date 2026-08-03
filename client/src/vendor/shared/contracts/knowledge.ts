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
});
export type Skill = z.infer<typeof Skill>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

/** Skill names are slugs — the editor renders one as `<name>.md`. */
export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
export const SkillName = z.string().min(1).max(64).regex(SKILL_NAME_RE);

/**
 * Parse result of an uploaded `.md` / `.zip`, returned by `POST /skills/import`.
 * NOTHING is persisted at this point — the client shows this for confirmation
 * and only then calls `POST /skills`.
 */
export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  body: z.string(),
  /** Which archive entry the body came from; null for a plain .md upload. */
  source_path: z.string().nullish(),
  /** How many other entries the archive had. They were NOT read or extracted. */
  ignored_entries: z.number().int(),
  /** Present when the archive held more than one SKILL.md and the user must pick. */
  candidates: z.array(z.string()).nullish(),
  /** An existing skill with this name — the UI offers replace / rename. */
  collides_with: z.string().nullish(),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

/**
 * The skill exactly as the run executor will inject it, plus its real token
 * cost. `block` is produced by the SAME renderer the executor uses — if these
 * two ever diverge, the Preview tab is lying.
 */
export const SkillPreview = z.object({
  block: z.string(),
  tokens: z.number().int(),
});
export type SkillPreview = z.infer<typeof SkillPreview>;

/**
 * Skill Stats tab. Findings figures are attributed at RUN level: a run that
 * injected four skills counts its findings toward all four. The UI says so —
 * "findings in runs using this skill", never "caused by".
 *
 * `null` means unmeasured (no runs / nothing judged yet) and renders as "—";
 * a measured zero renders as 0. Those are different facts.
 */
export const SkillStats = z.object({
  used_by: z.number().int(),
  agents: z.array(z.object({ id: z.string(), name: z.string() })),
  pull_pct: z.number().nullable(),
  accept_pct: z.number().nullable(),
  findings_30d: z.number().int(),
  by_category: z.array(z.object({ category: z.string(), count: z.number().int() })),
  avg_tokens: z.number().int().nullable(),
});
export type SkillStats = z.infer<typeof SkillStats>;

/** Rail-card stats — the cheap subset, batched for the whole list. */
export const SkillListStats = z.object({
  used_by: z.number().int(),
  pull_pct: z.number().nullable(),
  accept_pct: z.number().nullable(),
});
export type SkillListStats = z.infer<typeof SkillListStats>;

/** A skill plus its rail-card stats — the `GET /skills` row shape. */
export const SkillWithStats = Skill.extend({ stats: SkillListStats });
export type SkillWithStats = z.infer<typeof SkillWithStats>;

/** One archived body from `skill_versions`. */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

// ---- Conventions ----
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const ConventionCandidate = z.object({
  id: z.string(),
  category: z.string(),
  rule: z.string(),
  evidence_path: z.string().nullable(),
  evidence_start_line: z.number().int().nullable(),
  evidence_end_line: z.number().int().nullable(),
  evidence_snippet: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  status: ConventionStatus,
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

/** One extraction run — what was sampled, against which commit, by which model. */
export const ConventionScan = z.object({
  id: z.string(),
  repo_id: z.string(),
  sample_file_count: z.number().int(),
  source_sha: z.string(),
  model: z.string(),
  created_at: z.string(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

/** GET /repos/:id/conventions — the latest scan (if any) plus its candidates. */
export const ConventionsList = z.object({
  scan: ConventionScan.nullable(),
  candidates: z.array(ConventionCandidate),
});
export type ConventionsList = z.infer<typeof ConventionsList>;

/** POST /repos/:id/conventions/skill request body. */
export const CreateSkillFromConventionsRequest = z.object({
  convention_ids: z.array(z.string()).min(1),
  name: SkillName,
  description: z.string().min(1),
  enabled: z.boolean().default(false),
  /** Editable in the "Create skill" modal before saving; server renders the
   *  default (rule + evidence citation per candidate) when omitted. */
  body: z.string().min(1).optional(),
});
export type CreateSkillFromConventionsRequest = z.infer<typeof CreateSkillFromConventionsRequest>;

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
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  /**
   * Per-agent gate. The link survives being switched off so `order` is kept —
   * re-enabling restores the skill's place instead of appending it. A skill is
   * injected only when this AND `Skill.enabled` are both true.
   */
  enabled: z.boolean().default(true),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;
