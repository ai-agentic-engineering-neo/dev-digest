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

// 'imported' = uploaded .md / .zip (L02 import); 'imported_url' is reserved for a URL import.
export const SkillSource = z.enum(['manual', 'imported', 'imported_url', 'extracted', 'community']);
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
  // Skills list card footer: agents with an enabled link, the share of those
  // agents' runs whose prompt included the skill, and accepted / (accepted +
  // dismissed) over findings of runs that included it (null = nothing yet).
  stats: z
    .object({
      agents: z.number().int(),
      pull_rate: z.number().min(0).max(1).nullable(),
      accept_rate: z.number().min(0).max(1).nullable(),
    })
    .optional(),
});
export type Skill = z.infer<typeof Skill>;

/** GET /skills/:id/stats — the skill editor's Stats tab. */
export const SkillStats = z.object({
  agents: z.array(z.object({ id: z.string(), name: z.string(), enabled: z.boolean() })),
  pull_rate: z.number().min(0).max(1).nullable(),
  accept_rate: z.number().min(0).max(1).nullable(),
  /** Findings of runs that included the skill, last 30 days. */
  findings_30d: z.number().int(),
  by_category: z.array(z.object({ category: z.string(), count: z.number().int() })),
});
export type SkillStats = z.infer<typeof SkillStats>;

// L02 — skill CRUD + import. A skill is text config only: name, a directive
// description (its "interface" — when the agent should apply it), a type and a
// markdown body. Editing the body creates a new immutable version.
export const SkillCreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  type: SkillType,
  body: z.string().min(1).max(50_000),
  enabled: z.boolean().optional(),
  // 'extracted' = composed from accepted conventions (L02 Conventions).
  source: z.enum(['manual', 'imported', 'extracted']).optional(),
  /** Files the skill's rules were evidenced in (extracted skills). */
  evidence_files: z.array(z.string().max(500)).max(200).optional(),
});
export type SkillCreateBody = z.infer<typeof SkillCreateBody>;

export const SkillUpdateBody = SkillCreateBody.omit({ source: true, evidence_files: true })
  .partial()
  .extend({
    /** Change note stored on the new version (ignored when the body is unchanged). */
    version_message: z.string().trim().max(200).optional(),
  });
export type SkillUpdateBody = z.infer<typeof SkillUpdateBody>;

export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  message: z.string().nullable(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/** Upload for the import preview: a single `.md` or a `.zip`, base64-encoded. */
export const SkillImportRequest = z.object({
  filename: z.string().min(1).max(255),
  content_base64: z.string().min(1).max(1_500_000),
});
export type SkillImportRequest = z.infer<typeof SkillImportRequest>;

export const SkillIgnoredFile = z.object({
  path: z.string(),
  reason: z.enum(['executable', 'not-core']),
});
export type SkillIgnoredFile = z.infer<typeof SkillIgnoredFile>;

/** What the import found — nothing is saved until the user confirms. */
export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  /** Path of the file the core was taken from (e.g. `my-skill/SKILL.md`). */
  core_path: z.string(),
  ignored_files: z.array(SkillIgnoredFile),
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
// L02 — house-rules extracted from a repo's sampled files. Each candidate cites
// one verified line of code (the server re-reads the file and drops a candidate
// whose quote is not there). Accepted candidates are composed into one skill.
export const ConventionCategory = z.enum([
  'naming',
  'error-handling',
  'structure',
  'imports',
  'typing',
  'testing',
  'style',
  'other',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const ConventionCandidate = z.object({
  id: z.string(),
  category: ConventionCategory,
  rule: z.string(),
  evidence_path: z.string(),
  /** 1-based line the quote was verified on (null for a hand-written candidate). */
  evidence_line: z.number().int().nullable(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

export const ConventionScan = z.object({
  id: z.string(),
  status: z.enum(['running', 'done', 'failed']),
  files_sampled: z.number().int(),
  error: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

/** GET /repos/:repoId/conventions — the latest scan + its candidates. */
export const ConventionsList = z.object({
  scan: ConventionScan.nullable(),
  items: z.array(ConventionCandidate),
});
export type ConventionsList = z.infer<typeof ConventionsList>;

/** PATCH /conventions/:id — edit and/or accept / reject one candidate. */
export const ConventionUpdateBody = z
  .object({
    rule: z.string().trim().min(1).max(500),
    category: ConventionCategory,
    evidence_snippet: z.string().max(4_000),
    status: ConventionStatus,
  })
  .partial();
export type ConventionUpdateBody = z.infer<typeof ConventionUpdateBody>;

/** POST /repos/:repoId/conventions/bulk — Accept all / Reject all (applies to pending). */
export const ConventionsBulkBody = z.object({ status: z.enum(['accepted', 'rejected']) });
export type ConventionsBulkBody = z.infer<typeof ConventionsBulkBody>;

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
  // L02 — number of linked AND enabled skills (list/card badge); optional so
  // older payloads still parse.
  skill_count: z.number().int().optional(),
  // Agents list card footer: completed runs, mean cost of priced runs, and the
  // share of resolved findings the user accepted (null = nothing to average).
  stats: z
    .object({
      runs: z.number().int(),
      avg_cost_usd: z.number().nullable(),
      accept_rate: z.number().min(0).max(1).nullable(),
    })
    .optional(),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  // Linked-but-disabled: keeps its slot in the order, stays out of the prompt.
  enabled: z.boolean().default(true),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

/** PUT /agents/:id/skills — the full ordered set of links (order = index). */
export const AgentSkillsReplaceBody = z.object({
  items: z.array(z.object({ skill_id: z.string().uuid(), enabled: z.boolean() })).max(100),
});
export type AgentSkillsReplaceBody = z.infer<typeof AgentSkillsReplaceBody>;

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
