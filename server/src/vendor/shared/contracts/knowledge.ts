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

export const SkillSource = z.enum(['manual', 'imported_url', 'imported_file', 'extracted', 'community']);
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
  /** Agents whose link to this skill is enabled. */
  agent_count: z.number().int().default(0),
  /** Body size in tokens; only on GET /skills/:id. */
  token_count: z.number().int().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});
export type Skill = z.infer<typeof Skill>;

/** Kebab-case slug: the skill's file stem and its prompt-block heading. */
export const SkillName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, digits and dashes');

export const SkillInput = z.object({
  name: SkillName,
  description: z.string().min(1).max(1024),
  type: SkillType,
  body: z.string().min(1).max(256_000),
  enabled: z.boolean().optional(),
});
export type SkillInput = z.infer<typeof SkillInput>;

/** Max length of a version's change note. */
export const SKILL_NOTE_MAX = 200;

export const SkillUpdate = SkillInput.partial().extend({
  note: z.string().max(SKILL_NOTE_MAX).optional(),
});
export type SkillUpdate = z.infer<typeof SkillUpdate>;

export const SkillEnabledInput = z.object({ enabled: z.boolean() });
export type SkillEnabledInput = z.infer<typeof SkillEnabledInput>;

export const SkillVersion = z.object({
  version: z.number().int(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  note: z.string().nullable(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

export const SkillImportRequest = z.object({
  filename: z.string().min(1).max(255),
  content_base64: z.string().min(1).base64(),
});
export type SkillImportRequest = z.infer<typeof SkillImportRequest>;

export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  source_file: z.string(),
  skipped_files: z.array(z.object({ path: z.string(), size: z.number().int() })),
  warnings: z.array(z.string()),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

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

/** One convention found in a repo, with the code that proves it. */
export const ConventionCandidate = z.object({
  id: z.string(),
  category: z.string().nullable(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  /** 1-based line range of the snippet in the file, computed by code. */
  evidence_start_line: z.number().int().positive().nullable(),
  evidence_end_line: z.number().int().positive().nullable(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  /** Mirrors `status === 'accepted'`. */
  accepted: z.boolean(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

/** GET/POST conventions response: the repo's candidates and the last scan. */
export const ConventionList = z.object({
  candidates: z.array(ConventionCandidate),
  /** Files sent to the model on the last scan; null before the first one. */
  sample_count: z.number().int().nonnegative().nullable(),
  last_scan_at: z.string().nullable(),
});
export type ConventionList = z.infer<typeof ConventionList>;

/** PATCH one candidate: accept / reject / reset, or edit its rule text. */
export const ConventionPatch = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().trim().min(1).max(500).optional(),
  })
  .refine((p) => p.status !== undefined || p.rule !== undefined, {
    message: 'Nothing to update',
  });
export type ConventionPatch = z.infer<typeof ConventionPatch>;

/**
 * What the model returns in the one extraction call. Line numbers are not
 * asked for: code finds the snippet in the file and computes them.
 */
export const ConventionExtraction = z.object({
  candidates: z
    .array(
      z.object({
        category: z.string(),
        rule: z.string(),
        evidence_path: z.string(),
        evidence_snippet: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(20),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;

/**
 * POST /repos/:id/conventions/skill — the edited draft from the modal plus the
 * accepted candidates it was built from. The server saves it as a
 * `convention` skill with source `extracted`.
 */
export const ConventionSkillInput = SkillInput.omit({ type: true }).extend({
  convention_ids: z.array(z.string().uuid()).min(1).max(100),
});
export type ConventionSkillInput = z.infer<typeof ConventionSkillInput>;

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
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
  /** Number of enabled skill links. */
  skill_count: z.number().int().default(0),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  /** Enabled on this link (per agent). */
  enabled: z.boolean(),
  name: z.string(),
  type: SkillType,
  /** The skill's global flag; a link to a globally disabled skill is inactive. */
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
  /** Ordered links with their per-agent flag (M2+); absent on older snapshots. */
  skill_links: z.array(z.object({ skill_id: z.string(), enabled: z.boolean() })).nullish(),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
