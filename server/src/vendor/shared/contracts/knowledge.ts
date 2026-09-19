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

export const SkillSource = z.enum(['manual', 'imported', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

/** Extracted SKILL.md core before persist. Description may be empty until confirm. */
export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  body: z.string().min(1),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

export const Skill = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().min(1),
  type: SkillType,
  source: SkillSource,
  body: z.string().min(1),
  enabled: z.boolean(),
  version: z.number().int(),
  agent_count: z.number().int().nonnegative().optional(),
  evidence_files: z.array(z.string()).nullish(),
});
export type Skill = z.infer<typeof Skill>;

export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string().min(1),
  note: z.string().nullish(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const ConventionCandidate = z.object({
  id: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  category: z.string().nullish(),
  evidence_start_line: z.number().int().nullable(),
  evidence_end_line: z.number().int().nullable(),
  /** True iff `status === 'accepted'`. Kept in sync by the mapper. */
  accepted: z.boolean(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

export const ConventionList = z.object({
  items: z.array(ConventionCandidate),
  extracted_at: z.string().nullable(),
  sample_file_count: z.number().int().nonnegative(),
});
export type ConventionList = z.infer<typeof ConventionList>;

export const ConventionPatch = z.object({
  status: ConventionStatus.optional(),
  rule: z.string().min(1).optional(),
});
export type ConventionPatch = z.infer<typeof ConventionPatch>;

export const ConventionCompose = z.object({
  convention_ids: z.array(z.string().uuid()).min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  type: SkillType,
  body: z.string().min(1),
  enabled: z.boolean().optional(),
  agent_id: z.string().uuid().nullish(),
});
export type ConventionCompose = z.infer<typeof ConventionCompose>;

/** Structured LLM extraction payload (not a persisted DTO). */
export const ConventionExtractionItem = z.object({
  category: z.string(),
  rule: z.string().min(1),
  evidence_path: z.string().min(1),
  evidence_start_line: z.number().int().positive(),
  evidence_end_line: z.number().int().positive(),
  evidence_snippet: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type ConventionExtractionItem = z.infer<typeof ConventionExtractionItem>;

export const ConventionExtraction = z.object({
  candidates: z.array(ConventionExtractionItem),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
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
  skill_count: z.number().int().nonnegative().optional(),
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
  enabled: z.boolean(),
  name: z.string(),
  type: SkillType,
  description: z.string(),
  skill_enabled: z.boolean(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
