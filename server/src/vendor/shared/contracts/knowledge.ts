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
  created_at: z.string(),
  updated_at: z.string(),
  // Number of agents the skill is attached to (card footer); filled on list + get.
  agent_count: z.number().int(),
});
export type Skill = z.infer<typeof Skill>;

// Kebab-case slug, unique per workspace — M6 Export to CI resolves
// `.devdigest/skills/<slug>.md` from it.
export const SkillName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export type SkillName = z.infer<typeof SkillName>;

export const SkillBody = z.string().min(1).max(20_000);
export type SkillBody = z.infer<typeof SkillBody>;

export const CreateSkillInput = z.object({
  name: SkillName,
  description: z.string().max(200).default(''),
  type: SkillType.default('custom'),
  body: SkillBody,
  enabled: z.boolean().default(true),
});
export type CreateSkillInput = z.infer<typeof CreateSkillInput>;

export const UpdateSkillInput = CreateSkillInput.partial().extend({
  // Version message; used only when the body changes.
  message: z.string().max(120).optional(),
});
export type UpdateSkillInput = z.infer<typeof UpdateSkillInput>;

export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  message: z.string(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

export const SkillUsage = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
});
export type SkillUsage = z.infer<typeof SkillUsage>;

// The agent's OWN last-30-day activity — nothing here is attributed to the skill.
export const SkillAgentActivity = SkillUsage.extend({
  enabled: z.boolean(),
  runs_30d: z.number().int(),
  findings_30d: z.number().int(),
  // accepted ÷ (accepted + dismissed); null = nothing decided.
  accept_rate_30d: z.number().min(0).max(1).nullable(),
});
export type SkillAgentActivity = z.infer<typeof SkillAgentActivity>;

export const SkillStats = z.object({
  agent_count: z.number().int(),
  enabled_agent_count: z.number().int(),
  version_count: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  agents: z.array(SkillAgentActivity),
});
export type SkillStats = z.infer<typeof SkillStats>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'errors',
  'imports',
  'typing',
  'testing',
  'api',
  'general',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

// pending = not decided yet; a re-scan replaces only pending rows.
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

// One piece of evidence, verified against the file by the server: the lines
// are where the snippet really is, the snippet is sliced from the file.
export const ConventionEvidence = z.object({
  path: z.string(),
  line_start: z.number().int().positive(),
  line_end: z.number().int().positive(),
  snippet: z.string(),
});
export type ConventionEvidence = z.infer<typeof ConventionEvidence>;

export const ConventionCandidate = z.object({
  id: z.string(),
  rule: z.string(),
  // First evidence (mirrors evidence[0]); kept for existing readers.
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  accepted: z.boolean(),
  // Conventions Extractor fields — optional, so older producers still validate.
  status: ConventionStatus.optional(),
  category: ConventionCategory.optional(),
  bad_example: z.string().nullish(),
  evidence: z.array(ConventionEvidence).optional(),
  // HEAD of the scan that verified this row's evidence lines — pins its GitHub
  // links (accepted rows outlive later scans, whose SHA may differ).
  commit_sha: z.string().nullish(),
  // Names of the skills this rule was merged into.
  skill_names: z.array(z.string()).optional(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

// The latest scan of a repo (null when it was never scanned).
export const ConventionScan = z.object({
  at: z.string(),
  // HEAD the sample was read at — pins GitHub evidence links to real lines.
  commit_sha: z.string().nullable(),
  files_sampled: z.number().int(),
  model: z.string(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

export const ConventionsPage = z.object({
  scan: ConventionScan.nullable(),
  candidates: z.array(ConventionCandidate),
});
export type ConventionsPage = z.infer<typeof ConventionsPage>;

// A scan's reply: the page plus what happened to the model's proposals, so a
// scan that kept nothing reads as "nothing found", not as "never scanned".
export const ConventionScanResult = ConventionsPage.extend({
  proposed: z.number().int(),
  kept: z.number().int(),
  dropped_ungrounded: z.number().int(),
  dropped_duplicate: z.number().int(),
});
export type ConventionScanResult = z.infer<typeof ConventionScanResult>;

export const UpdateConventionInput = z
  .object({
    rule: z.string().trim().min(1).max(300),
    category: ConventionCategory,
    bad_example: z.string().max(2000).nullable(),
    status: ConventionStatus,
    // Drop one evidence (its code cannot be rewritten — it is verified).
    remove_evidence_index: z.number().int().min(0).max(2),
    // Drop several at once, in one atomic update (indices into the CURRENT list).
    remove_evidence_indices: z.array(z.number().int().min(0).max(2)).min(1).max(3),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateConventionInput = z.infer<typeof UpdateConventionInput>;

export const ConventionIds = z.array(z.string().uuid()).min(1).max(50);

export const ConventionSkillDraftInput = z.object({ convention_ids: ConventionIds });
export type ConventionSkillDraftInput = z.infer<typeof ConventionSkillDraftInput>;

// Preview of the skill the selected rules would make; nothing is persisted.
export const ConventionSkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  body: z.string(),
  tokens: z.number().int(),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;

// Where accepted rules go: a NEW skill, or merged into ONE existing skill.
export const ConventionSkillTarget = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('new') }),
  z.object({ mode: z.literal('merge'), skill_id: z.string().uuid() }),
]);
export type ConventionSkillTarget = z.infer<typeof ConventionSkillTarget>;

export const CreateSkillFromConventionsInput = z.object({
  convention_ids: ConventionIds,
  // On a merge, name / description / type / enabled are the existing skill's
  // and these fields are ignored.
  name: SkillName,
  description: z.string().max(200).default(''),
  type: SkillType.default('convention'),
  // Off by default: a new extracted skill reaches no prompt until enabled.
  enabled: z.boolean().default(false),
  target: ConventionSkillTarget.default({ mode: 'new' }),
});
export type CreateSkillFromConventionsInput = z.infer<typeof CreateSkillFromConventionsInput>;

// A selected rule that contradicts the skill: NOT inserted; `rule_block` is the
// ready markdown to apply on the Config tab, `existing_excerpt` the clashing text.
export const ConventionMergeConflict = z.object({
  convention_id: z.string(),
  rule: z.string(),
  rule_block: z.string(),
  existing_excerpt: z.string(),
  reason: z.string(),
});
export type ConventionMergeConflict = z.infer<typeof ConventionMergeConflict>;

// `added` rules went into the body; `duplicates` were already there (skipped).
export const ConventionSkillResult = z.object({
  skill: Skill,
  added: z.number().int(),
  duplicates: z.number().int(),
  conflicts: z.array(ConventionMergeConflict),
});
export type ConventionSkillResult = z.infer<typeof ConventionSkillResult>;

// ---- Agent suggestions (code-only match of a skill to agents, no LLM) ----
// Why an agent was suggested; the client renders the words (i18n).
export const AgentSuggestionReason = z.discriminatedUnion('kind', [
  // The skill's convention categories found in the agent's name / description.
  z.object({ kind: z.literal('category'), categories: z.array(ConventionCategory).min(1) }),
  // The agent already uses `count` skills of the skill's type.
  z.object({ kind: z.literal('type'), type: SkillType, count: z.number().int().min(1) }),
  // Words the skill and the agent's name / description share.
  z.object({ kind: z.literal('keywords'), keywords: z.array(z.string()).min(1) }),
]);
export type AgentSuggestionReason = z.infer<typeof AgentSuggestionReason>;

export const AgentSuggestion = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  score: z.number().min(0).max(1),
  // score ≥ the preselect threshold → the dialog starts on "Accept".
  preselected: z.boolean(),
  reasons: z.array(AgentSuggestionReason),
});
export type AgentSuggestion = z.infer<typeof AgentSuggestion>;

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
  // Attached skills, globally disabled ones included ("N skills" on cards).
  skill_count: z.number().int().default(0),
});
export type Agent = z.infer<typeof Agent>;

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
