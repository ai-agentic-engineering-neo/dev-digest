import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import {
  EvalRun,
  EvalOwnerKind,
  EvalExpectation,
  EvalCaseMeta,
  Conformance,
  Provider,
  CiFailOn,
} from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted SUITE run record + dashboard (L06)
// ===========================================================================

/** Create/update payload for an eval case (D16's frozen-input shape; owner
 *  is resolved by the route, never taken from the body — AC-54). */
export const EvalCaseInput = z.object({
  name: z.string().min(1),
  notes: z.string().nullish(),
  input_diff: z.string().min(1),
  input_files: z.array(z.string()),
  input_meta: EvalCaseMeta,
  expectation: EvalExpectation,
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** POST /findings/:id/eval-case request body — the finding id is already the
 *  route param, so nothing is duplicated here besides the confirmation shape
 *  the route needs; kept as a named contract for parity with the others. */
export const EvalCaseFromFindingInput = z.object({
  finding_id: z.string().uuid(),
});
export type EvalCaseFromFindingInput = z.infer<typeof EvalCaseFromFindingInput>;

export const EvalRunStatus = z.enum(['running', 'completed', 'errored']);
export type EvalRunStatus = z.infer<typeof EvalRunStatus>;

/**
 * Q1 — a persisted eval SUITE run: one agent against its whole case set
 * (D2). Reshaped from the reserved per-CASE-execution row: `case_id`,
 * `actual_output` and `pass` are gone; `case_ids`/`agent_version`/`metrics`
 * are new. `metrics` is null while `status === 'running'`.
 */
export const EvalRunRecord = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  agent_name: z.string().nullish(),
  status: EvalRunStatus,
  started_at: z.string(),
  finished_at: z.string().nullable(),
  agent_version: z.number().int().nullable(),
  case_ids: z.array(z.string()),
  metrics: EvalRun.nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  error_reason: z.string().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** AC-24/AC-25 — stated before any execution starts. */
export const EvalRunEstimate = z.object({
  agents_total: z.number().int(),
  cases_total: z.number().int(),
  executions_total: z.number().int(),
});
export type EvalRunEstimate = z.infer<typeof EvalRunEstimate>;

/** Response of `POST /agents/:id/eval/runs` — the start response (Q3: the
 *  client polls `GET /eval/runs/:id` for completion, no SSE). */
export const EvalRunResult = z.object({
  run_id: z.string(),
  status: EvalRunStatus,
  estimate: EvalRunEstimate,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** Response of `POST /eval/runs/all` — AC-25/AC-42: per-agent success or
 *  failure, never one combined verdict. */
export const EvalRunAllResult = z.object({
  estimate: EvalRunEstimate,
  started: z.array(
    z.object({
      agent_id: z.string(),
      agent_name: z.string(),
      run_id: z.string().nullable(),
      refused_reason: z.string().nullable(),
    }),
  ),
});
export type EvalRunAllResult = z.infer<typeof EvalRunAllResult>;

/** One point on an agent's trend (per completed run, chronological). */
export const EvalTrendPoint = z.object({
  run_id: z.string(),
  ran_at: z.string(),
  agent_version: z.number().int().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/**
 * D12/AC-45 — the dashboard/detail callout. STRUCTURED, not a sentence: the
 * client renders it from `messages/en/eval.json`, which is what keeps it
 * non-model-authored (N1) and makes "no causal clause when `case_transitions`
 * is empty" a rendering invariant rather than a string-building one.
 */
export const EvalCallout = z.object({
  metric: z.enum(['recall', 'precision', 'citation_accuracy']),
  direction: z.enum(['up', 'down']),
  magnitude: z.number(),
  agent_version: z.number().int().nullable(),
  case_transitions: z.array(
    z.object({ case_id: z.string(), name: z.string(), from: z.boolean(), to: z.boolean() }),
  ),
});
export type EvalCallout = z.infer<typeof EvalCallout>;

/** GET /eval/dashboard — one row per agent that has eval cases (AC-40). */
export const EvalAgentSummary = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  cases_total: z.number().int(),
  latest: EvalRunRecord.nullable(),
  trend: z.array(EvalTrendPoint),
});
export type EvalAgentSummary = z.infer<typeof EvalAgentSummary>;

/** GET /eval/dashboard — workspace-level (AC-40, AC-41); NOT repo-scoped. */
export const EvalDashboard = z.object({
  agents: z.array(EvalAgentSummary),
  recent_runs: z.array(EvalRunRecord),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

/**
 * GET /eval/agents/:id — one agent's eval detail (AC-44/AC-45/AC-48).
 * `delta`/`callout` are null when fewer than two completed runs exist —
 * that IS AC-48's "no deltas, no comparison affordance" expressed in the
 * contract, not a UI-side branch on a count.
 */
export const EvalAgentDetail = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  cases_total: z.number().int(),
  runs: z.array(EvalRunRecord),
  current: EvalRun.nullable(),
  delta: z
    .object({
      recall: z.number().nullable(),
      precision: z.number().nullable(),
      citation_accuracy: z.number().nullable(),
    })
    .nullable(),
  trend: z.array(EvalTrendPoint),
  callout: EvalCallout.nullable(),
});
export type EvalAgentDetail = z.infer<typeof EvalAgentDetail>;

/** GET /eval/compare?a=&b= — exactly two runs of ONE agent (AC-32/33/34). */
export const EvalCompare = z.object({
  old: EvalRunRecord,
  new: EvalRunRecord,
  common_case_ids: z.array(z.string()),
  only_in_old: z.array(z.string()),
  only_in_new: z.array(z.string()),
  deltas: z.object({
    recall: z.number().nullable(),
    precision: z.number().nullable(),
    citation_accuracy: z.number().nullable(),
  }),
  /** Line-oriented system-prompt diff (AC-34) — added/removed/context, never
   *  a unified-diff string the client would have to parse. */
  prompt_diff: z.array(
    z.object({ kind: z.enum(['added', 'removed', 'context']), text: z.string() }),
  ),
});
export type EvalCompare = z.infer<typeof EvalCompare>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`CiService.agentYaml`) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" just returns/persists them. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z.array(z.string()).default(['opened', 'synchronize', 'reopened']),
  base: z.string().default('main'),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
});
export type CiRun = z.infer<typeof CiRun>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int(),
  critical: z.number().int().nullish(),
  warning: z.number().int().nullish(),
  suggestion: z.number().int().nullish(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
