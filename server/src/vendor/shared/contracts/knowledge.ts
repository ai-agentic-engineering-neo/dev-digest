import { z } from 'zod';
import { PROVIDER_IDS } from '../constants/feature-models.js';
import {
  SKILL_BODY_MAX,
  SKILL_DESCRIPTION_MAX,
  SKILL_NAME_MAX,
  SKILL_NAME_RE,
} from '../constants/skills.js';

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
// A skill is text only: `name` + `description` + `body` reach the model (the
// description is the skill's interface — a directive saying WHEN it applies);
// `type`/`source` are metadata. See server/specs/03-skills.md.
export { SKILL_BODY_MAX, SKILL_DESCRIPTION_MAX, SKILL_NAME_MAX, SKILL_NAME_RE };

export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

// imported_file = a .md or .zip upload. Every non-manual source is created
// DISABLED (trust gate — foreign skills are foreign instructions).
export const SkillSource = z.enum(['manual', 'imported_file', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

/** Sources a client may set on create ('extracted' belongs to the conventions extractor). */
export const CreatableSkillSource = z.enum(['manual', 'imported_file', 'imported_url', 'community']);
export type CreatableSkillSource = z.infer<typeof CreatableSkillSource>;

export const SkillName = z
  .string()
  .min(1)
  .max(SKILL_NAME_MAX)
  .regex(SKILL_NAME_RE, 'Use a kebab-case slug: lowercase letters, digits and single dashes');

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  /** Provenance: file name, URL or `community:<id>`; null for manual skills. */
  source_ref: z.string().nullish(),
  body: z.string(),
  enabled: z.boolean(),
  /** Current version (bumped by a body/description change). */
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  /** Number of agents linking this skill. */
  used_by: z.number().int().nullish(),
});
export type Skill = z.infer<typeof Skill>;

/** Body for POST /skills. Non-manual sources are always stored enabled=false. */
export const CreateSkillInput = z.object({
  name: SkillName,
  description: z.string().max(SKILL_DESCRIPTION_MAX).optional(),
  type: SkillType,
  body: z.string().min(1).max(SKILL_BODY_MAX),
  enabled: z.boolean().optional(),
  source: CreatableSkillSource.optional(),
  source_ref: z.string().max(500).optional(),
});
export type CreateSkillInput = z.infer<typeof CreateSkillInput>;

/** Body for PUT /skills/:id — partial; `base_version` enables optimistic concurrency. */
export const UpdateSkillInput = z.object({
  name: SkillName.optional(),
  description: z.string().max(SKILL_DESCRIPTION_MAX).optional(),
  type: SkillType.optional(),
  body: z.string().min(1).max(SKILL_BODY_MAX).optional(),
  enabled: z.boolean().optional(),
  base_version: z.number().int().positive().optional(),
});
export type UpdateSkillInput = z.infer<typeof UpdateSkillInput>;

/** Immutable snapshot of a skill's model-facing text. */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  description: z.string().nullish(),
  message: z.string().nullish(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/** An agent that links a skill (Stats "Used by", delete confirm). */
export const SkillAgentRef = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
});
export type SkillAgentRef = z.infer<typeof SkillAgentRef>;

/** POST /skills/import/preview — where the candidate skill comes from. */
export const SkillImportRequest = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('file'),
    filename: z.string().min(1).max(255),
    content_base64: z.string().min(1),
  }),
  z.object({ kind: z.literal('url'), url: z.string().min(1).max(2000) }),
  z.object({ kind: z.literal('community'), id: z.string().min(1).max(100) }),
]);
export type SkillImportRequest = z.infer<typeof SkillImportRequest>;

export const IgnoredImportFile = z.object({
  path: z.string(),
  /** executable | not_markdown | reference_doc | too_large */
  reason: z.string(),
});
export type IgnoredImportFile = z.infer<typeof IgnoredImportFile>;

/** The extracted skill core, shown to the user BEFORE anything is saved. */
export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  source: CreatableSkillSource,
  source_ref: z.string(),
  included_files: z.array(z.string()),
  ignored_files: z.array(IgnoredImportFile),
  /** What the sanitizer removed or changed (hidden comments, control chars, …). */
  warnings: z.array(z.string()),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

export const CommunitySkill = z.object({
  id: z.string(),
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
  type: SkillType,
  tags: z.array(z.string()),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

export const CountBy = z.object({ key: z.string(), count: z.number().int() });
export type CountBy = z.infer<typeof CountBy>;

/** Per-skill usage over a window (findings attributed via Finding.skill). */
export const SkillStats = z.object({
  skill_id: z.string(),
  window_days: z.number().int(),
  /** Runs where the skill was in the prompt. */
  runs_attached: z.number().int(),
  /** Of those, runs with ≥1 kept finding citing the skill. */
  runs_cited: z.number().int(),
  /** runs_cited / runs_attached; null when never attached. */
  pull_rate: z.number().nullable(),
  findings: z.number().int(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  /** accepted / (accepted + dismissed); null when no finding was acted on. */
  accept_rate: z.number().nullable(),
  by_category: z.array(CountBy),
  by_severity: z.array(CountBy),
  used_by: z.array(SkillAgentRef),
});
export type SkillStats = z.infer<typeof SkillStats>;

/** GET /skills/stats — the numbers on the list cards. */
export const SkillStatsSummary = z.object({
  skill_id: z.string(),
  pull_rate: z.number().nullable(),
  accept_rate: z.number().nullable(),
  findings: z.number().int(),
});
export type SkillStatsSummary = z.infer<typeof SkillStatsSummary>;

// ---- Conventions ----
// Conventions extractor (server/specs/04-conventions.md): a scan samples the
// repo in code, one model call proposes house rules, and code verifies each
// cited evidence line against the clone. Accepted rules merge into ONE skill.
export const CONVENTION_RULE_MAX = 500;
export const CONVENTION_EVIDENCE_MAX = 3;

export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'error-handling',
  'async',
  'types',
  'imports',
  'testing',
  'api',
  'data-access',
  'style',
  'other',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

/** One VERIFIED place in the repo that shows the rule (snippet = the real file lines). */
export const ConventionEvidence = z.object({
  path: z.string(),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive(),
  snippet: z.string(),
});
export type ConventionEvidence = z.infer<typeof ConventionEvidence>;

export const Convention = z.object({
  id: z.string(),
  repo_id: z.string(),
  scan_id: z.string().nullish(),
  category: ConventionCategory,
  rule: z.string(),
  /** 1..CONVENTION_EVIDENCE_MAX verified locations; the first is the primary one. */
  evidence: z.array(ConventionEvidence),
  /** The model's confidence, 0..1. */
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  /** The user changed the rule text or category (kept across re-scans). */
  edited: z.boolean(),
  /** The skill this rule was last merged into. */
  skill_id: z.string().nullish(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Convention = z.infer<typeof Convention>;

/** Why a model candidate was not kept (evidence gate / de-duplication). */
export const ConventionDropReason = z.enum([
  'file_not_found',
  'line_out_of_range',
  'snippet_mismatch',
  'duplicate',
  'invalid',
]);
export type ConventionDropReason = z.infer<typeof ConventionDropReason>;

export const DroppedConvention = z.object({
  rule: z.string(),
  path: z.string(),
  reason: ConventionDropReason,
});
export type DroppedConvention = z.infer<typeof DroppedConvention>;

export const ConventionScanStatus = z.enum(['running', 'done', 'failed']);
export type ConventionScanStatus = z.infer<typeof ConventionScanStatus>;

export const ConventionScan = z.object({
  id: z.string(),
  repo_id: z.string(),
  status: ConventionScanStatus,
  /** Files sent to the model: config files first, then the top-ranked sources. */
  sampled_files: z.array(z.string()),
  /** Candidates the model proposed / kept after the evidence gate. */
  proposed: z.number().int(),
  kept: z.number().int(),
  dropped: z.array(DroppedConvention),
  model: z.string().nullish(),
  cost_usd: z.number().nullish(),
  error: z.string().nullish(),
  started_at: z.string(),
  finished_at: z.string().nullish(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

/** GET /repos/:id/conventions — the latest scan + every stored rule of the repo. */
export const ConventionsState = z.object({
  scan: ConventionScan.nullable(),
  conventions: z.array(Convention),
});
export type ConventionsState = z.infer<typeof ConventionsState>;

/** PATCH /conventions/:id — accept / reject / reset, or edit the rule. */
export const UpdateConventionInput = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().trim().min(1).max(CONVENTION_RULE_MAX).optional(),
    category: ConventionCategory.optional(),
  })
  .refine((v) => v.status !== undefined || v.rule !== undefined || v.category !== undefined, {
    message: 'Nothing to update',
  });
export type UpdateConventionInput = z.infer<typeof UpdateConventionInput>;

/** POST /repos/:id/conventions/skill — the edited draft from the modal. */
export const CreateConventionSkillInput = z.object({
  /** Accepted conventions of this repo merged into the skill. */
  convention_ids: z.array(z.string().uuid()).min(1).max(100),
  name: SkillName,
  description: z.string().max(SKILL_DESCRIPTION_MAX).optional(),
  type: SkillType.default('convention'),
  body: z.string().min(1).max(SKILL_BODY_MAX),
  enabled: z.boolean().default(true),
  /** Agents to link the new skill to (appended to their skill list). */
  agent_ids: z.array(z.string().uuid()).max(50).default([]),
});
export type CreateConventionSkillInput = z.input<typeof CreateConventionSkillInput>;

export const CreateConventionSkillResult = z.object({
  skill: Skill,
  linked_agents: z.array(SkillAgentRef),
});
export type CreateConventionSkillResult = z.infer<typeof CreateConventionSkillResult>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(PROVIDER_IDS);
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
});
export type Agent = z.infer<typeof Agent>;

/** Body for POST /agents (create). Omitted optional fields take server defaults. */
export const CreateAgentInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  provider: Provider,
  model: z.string().min(1),
  system_prompt: z.string().min(1),
  output_schema: z.unknown().optional(),
  strategy: ReviewStrategy.optional(),
  ci_fail_on: CiFailOn.optional(),
  repo_intel: z.boolean().optional(),
  enabled: z.boolean().optional(),
});
export type CreateAgentInput = z.infer<typeof CreateAgentInput>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
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
