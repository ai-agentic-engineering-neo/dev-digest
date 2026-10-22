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
  'imported_file',
  'extracted',
  'community',
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
  /** Number of agents this skill is attached to (list endpoint only). */
  agent_count: z.number().int().nullish(),
});
export type Skill = z.infer<typeof Skill>;

/** Create body. `source` defaults to `manual`; imports pass `imported_file`. */
export const SkillInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).default(''),
  type: SkillType,
  body: z.string().min(1).max(100_000),
  source: SkillSource.optional(),
  enabled: z.boolean().optional(),
});
export type SkillInput = z.infer<typeof SkillInput>;

/** Update body. A changed `body` bumps the version and snapshots it. */
export const SkillPatch = SkillInput.omit({ source: true }).partial();
export type SkillPatch = z.infer<typeof SkillPatch>;

/** Immutable body snapshot from `skill_versions`. */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/** The exact block an agent receives for this skill, with its token count. */
export const SkillPreview = z.object({
  block: z.string(),
  tokens: z.number().int(),
});
export type SkillPreview = z.infer<typeof SkillPreview>;

/** Upload for import preview — a `.md` or `.zip` file, base64-encoded. */
export const SkillImportRequest = z.object({
  filename: z.string().min(1).max(255),
  content_base64: z.string().min(1),
});
export type SkillImportRequest = z.infer<typeof SkillImportRequest>;

export const SkillImportFile = z.object({
  path: z.string(),
  status: z.enum(['used', 'skipped']),
  reason: z.string().nullish(),
});
export type SkillImportFile = z.infer<typeof SkillImportFile>;

/** Parsed skill core shown to the user before anything is persisted. */
export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  files: z.array(SkillImportFile),
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

/** A candidate house rule from a scan. Line range is computed server-side by
 *  matching the snippet against the clone — the model never supplies it. */
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

/** One extractor run: what was sampled, at which commit, by which model. */
export const ConventionScan = z.object({
  id: z.string(),
  repo_id: z.string(),
  sample_file_count: z.number().int(),
  source_sha: z.string(),
  model: z.string(),
  created_at: z.string(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

/** Latest scan for a repo (null before the first one) and its candidates. */
export const ConventionsList = z.object({
  scan: ConventionScan.nullable(),
  candidates: z.array(ConventionCandidate),
});
export type ConventionsList = z.infer<typeof ConventionsList>;

/** Accept / reject a candidate, or reset it to `pending` (undo). */
export const SetConventionStatus = z.object({ status: ConventionStatus });
export type SetConventionStatus = z.infer<typeof SetConventionStatus>;

/** Merge ACCEPTED candidates into one `convention` skill. `body` is the
 *  user-edited Markdown; omitted → the server renders the default. */
export const CreateSkillFromConventionsRequest = z.object({
  convention_ids: z.array(z.string().uuid()).min(1),
  name: SkillInput.shape.name,
  description: SkillInput.shape.description,
  enabled: z.boolean().default(false),
  body: SkillInput.shape.body.optional(),
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
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;
