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

export const SkillSource = z.enum([
  'manual',
  'imported_url',
  'extracted',
  'community',
  'imported_file',
]);
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
  // List-card aggregates (GET /skills only); absent/undefined elsewhere.
  agent_count: z.number().int().nullish(),
  pull_rate: z.number().nullish(),
  accept_rate: z.number().nullish(),
});
export type Skill = z.infer<typeof Skill>;

export const SkillVersion = z.object({
  version: z.number().int(),
  note: z.string().nullish(),
  created_at: z.string(),
  current: z.boolean(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

export const SkillVersionDetail = z.object({
  version: z.number().int(),
  body: z.string(),
  note: z.string().nullish(),
  created_at: z.string(),
});
export type SkillVersionDetail = z.infer<typeof SkillVersionDetail>;

export const SkillStatsAgent = z.object({
  id: z.string(),
  name: z.string(),
});
export type SkillStatsAgent = z.infer<typeof SkillStatsAgent>;

export const SkillStatsCategory = z.object({
  category: z.string(),
  count: z.number().int(),
});
export type SkillStatsCategory = z.infer<typeof SkillStatsCategory>;

// S10: every field is null when its denominator is 0 ("no data"), never 0.
export const SkillStats = z.object({
  used_by: z.number().int(),
  agents: z.array(SkillStatsAgent),
  pull_rate: z.number().nullish(),
  accept_rate: z.number().nullish(),
  findings_30d: z.number().int().nullish(),
  by_category: z.array(SkillStatsCategory),
});
export type SkillStats = z.infer<typeof SkillStats>;

export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  ignored_files: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

// Row shape for GET /agents/:id/skills: every workspace skill, linked ones
// carrying the agent_skills link fields, the rest with linked:false.
export const AgentSkillItem = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  linked: z.boolean(),
  enabled: z.boolean(),
  order: z.number().int().nullish(),
});
export type AgentSkillItem = z.infer<typeof AgentSkillItem>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Agents ----
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// ---- Conventions ----
// See server/specs/conventions.md (C1-C10).
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const ConventionCandidate = z.object({
  id: z.string(),
  category: z.string().nullish(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_start_line: z.number().int(),
  evidence_end_line: z.number().int(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

export const ConventionScan = z.object({
  id: z.string(),
  sha: z.string(),
  model: z.string(),
  provider: Provider,
  status: z.enum(['ok', 'failed']),
  sample_files: z.array(z.string()),
  candidates_found: z.number().int(),
  candidates_dropped: z.number().int(),
  error: z.string().nullish(),
  created_at: z.string(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

// GET /repos/:id/conventions and the response of POST .../extract (plus `dropped`).
export const ConventionList = z.object({
  scan: ConventionScan.nullable(),
  repo: z.object({ full_name: z.string() }),
  candidates: z.array(ConventionCandidate),
});
export type ConventionList = z.infer<typeof ConventionList>;

export const ConventionSkillPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  accepted_count: z.number().int(),
  name_taken_by: z.string().nullish(),
});
export type ConventionSkillPreview = z.infer<typeof ConventionSkillPreview>;

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
  // List-card aggregate (GET /agents only); absent/undefined elsewhere.
  skill_count: z.number().int().nullish(),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  enabled: z.boolean(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;
