/**
 * Shared contract types re-exported from @devdigest/shared (single source of
 * truth). F2 imports these rather than redefining them.
 *
 * F1 (@devdigest/shared) currently exports all the platform/findings/brief/
 * knowledge/trace contracts we need for the scaffolding screens, so there are
 * NO local placeholders required at this time. If a feature agent's contract is
 * not yet exported, add a placeholder below marked
 * `// TODO: reconcile with @devdigest/shared`.
 */
import type { ChangedSymbol, DownstreamImpact, SkillType } from "@devdigest/shared";

export type {
  Settings,
  SettingsUpdate,
  ConnTestProvider,
  ConnTestResult,
  SecretsStatus,
  FeatureModelId,
  FeatureModelChoice,
  FeatureModelDef,
  Provider,
  ModelInfo,
  Repo,
  RepoInput,
  PrMeta,
  PrDetail,
  PrFile,
  PrCommit,
  PrReviewComment,
  PrStatus,
  SpecFile,
  IndexStatus,
} from "@devdigest/shared";

export type { Review, Finding, Severity, Verdict } from "@devdigest/shared";
export type { PrBrief, SmartDiff } from "@devdigest/shared";
export type { ChangedSymbol, BlastCaller, DownstreamImpact } from "@devdigest/shared";

/** UI-only view model for a PR list row (derives display fields from PrMeta). */
export interface PrRowView {
  number: number;
  title: string;
  author: string;
  size: "S" | "M" | "L";
  sizeLines: string;
  score: number;
  findings: { CRITICAL: number; WARNING: number; SUGGESTION: number };
  status: "needs_review" | "reviewed" | "stale";
  updated: string;
}

/**
 * Skill import preview (POST /skills/import/preview). Not in @devdigest/shared:
 * vendor/shared is "Do not touch" (AGENTS.md), so this mirrors the server's
 * module-local type in server/src/modules/skills/domain.ts.
 * TODO: reconcile with @devdigest/shared when the contracts are next synced.
 */
export type SkillImportFileStatus = "used" | "ignored";

export interface SkillImportFile {
  path: string;
  size: number;
  status: SkillImportFileStatus;
  reason?: string | null;
}

export interface SkillImportPreview {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  files: SkillImportFile[];
  warnings: string[];
}

/**
 * Merged `<repo>-conventions` skill draft (GET /repos/:id/conventions/skill-draft).
 * Mirrors the server's module-local type in server/src/modules/conventions/domain.ts.
 * TODO: reconcile with @devdigest/shared when the contracts are next synced.
 */
export interface ConventionsSkillDraft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  evidence_files: string[];
  convention_ids: string[];
}

/**
 * Skills Lab v2 (Stats / Versions tabs). Mirrors the server's module-local types
 * in server/src/modules/skills/{domain,ports}.ts.
 * TODO: reconcile with @devdigest/shared when the contracts are next synced.
 */
export interface SkillVersionRecord {
  skill_id: string;
  version: number;
  body: string;
  note: string | null;
  created_at: string;
}

/** GET /skills/stats → per skill (list cards). Rates are 0..1, null = no data. */
export interface SkillCardStats {
  agents: number;
  pull_rate: number | null;
  accept_rate: number | null;
}

/** GET /skills/:id/stats — last `window_days` days. */
export interface SkillStats extends SkillCardStats {
  used_by: { id: string; name: string }[];
  runs_30d: number;
  findings_30d: number;
  by_category: { category: string; count: number }[];
  window_days: number;
}

/**
 * Conventions Extractor API shapes. Not in @devdigest/shared (vendor/shared is
 * "Do not touch"): mirrors server/src/modules/conventions/domain.ts.
 * TODO: reconcile with @devdigest/shared when the contracts are next synced.
 */
export type ConventionStatus = "pending" | "accepted" | "rejected";

export interface Convention {
  id: string;
  category: string | null;
  rule: string;
  evidence_path: string;
  evidence_snippet: string;
  line_start: number | null;
  line_end: number | null;
  confidence: number;
  status: ConventionStatus;
}

export interface ConventionExtractResult {
  candidates: Convention[];
  sampled_files: string[];
  rejected_ungrounded: number;
}

/**
 * GET /agents/run-estimates. Mirrors server/src/modules/agents/domain.ts.
 * TODO: reconcile with @devdigest/shared when the contracts are next synced.
 */
export interface AgentRunEstimate {
  agent_id: string;
  sample_size: number;
  avg_duration_ms: number;
  avg_cost_usd: number | null;
}

export interface AgentRunEstimatesResponse {
  estimates: AgentRunEstimate[];
}

/**
 * Intent Layer API shapes. Mirrors server/src/modules/intent/domain/types.ts.
 * TODO: reconcile with @devdigest/shared
 */
export type IntentKind = "feature" | "fix" | "refactor" | "chore" | "docs" | "test" | "unknown";
export type IntentConfidence = "high" | "medium" | "low";
export type IntentConfidenceReason = "substantive_body" | "linked_doc" | "closing_issue" | "short_body" | "indirect_only";
export type IntentDerivationStatus = "ok" | "failed" | "none";
export type IntentOrigin = "derived" | "user";
export type IntentStaleReason = "head_moved" | "body_changed";
export type IntentSourceKind = "pr_body" | "title" | "issue" | "plan" | "spec" | "doc" | "branch" | "commits" | "paths" | "external_link" | "tracker_key";
export type IntentSourceStatus = "read" | "empty" | "unavailable" | "skipped_external" | "skipped_cross_repo" | "skipped_cap" | "unresolved";
export type IntentSourceReason = "template_only" | "not_found" | "pull_request" | "unsafe_path" | "binary" | "github_unavailable" | "not_cloned" | "cap" | "pr_diff_excerpt";

export interface IntentSource {
  id: string;
  kind: IntentSourceKind;
  ref: string;
  weight: "strong" | "weak";
  status: IntentSourceStatus;
  reason: IntentSourceReason | null;
  used: boolean;
  cited: boolean;
  issue_number: number | null;
  path: string | null;
}

export interface PrIntent {
  pr_id: string;
  status: IntentDerivationStatus;
  origin: IntentOrigin;
  intent: string | null;
  in_scope: string[];
  out_of_scope: string[];
  kind: IntentKind;
  confidence: IntentConfidence;
  confidence_reason: IntentConfidenceReason;
  confidence_lowered: boolean;
  sources: IntentSource[];
  head_sha: string | null;
  stale: boolean;
  stale_reason: IntentStaleReason | null;
  provider: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  error: string | null;
  updated_at: string;
}

export interface IntentOverrideInput {
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
}

// ---- GET /pulls/:id/blast — mirrors server/src/modules/blast/domain/types.ts (not in @devdigest/shared).
// Guarded by src/lib/blast-contract.test.ts. TODO: reconcile with @devdigest/shared.

/** Same values and order as server BLAST_DEGRADED_REASONS — blast-contract.test.ts checks both, and that each has a message. */
export const BLAST_DEGRADED_REASONS = ["flag_off", "index_failed", "index_partial", "repo_too_large", "no_data"] as const;
export type BlastDegradedReason = (typeof BLAST_DEGRADED_REASONS)[number];

export interface BlastDownstream extends DownstreamImpact {
  file: string;
  kind: string;
}

export interface BlastCounts {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** GET /pulls/:id/blast response (server PrBlastRadius). */
export interface PrBlastRadius {
  pr_id: string;
  head_sha: string;
  indexed_sha: string | null;
  /** Commit the caller lines come from (indexed_sha ?? head_sha); links use only this. */
  link_sha: string;
  changed_symbols: ChangedSymbol[];
  downstream: BlastDownstream[];
  unattributed_endpoints: string[];
  summary: string;
  counts: BlastCounts;
  callers_omitted: number;
  degraded: boolean;
  reason: BlastDegradedReason | null;
}

/** GET /pulls/:id/prior-pulls. Mirrors server/src/modules/blast/domain/types.ts (PriorPullsResponse). */
export interface PriorPull {
  pr_id: string;
  number: number;
  title: string;
  author: string;
  status: string;
  updated_at: string | null;
  /** Exact number of this PR's paths the prior PR also touched. */
  shared_count: number;
  /** Up to 5 of those paths, sorted. */
  shared_files: string[];
}

export interface PriorPullsResponse {
  pr_id: string;
  /** All matching earlier PRs; `pulls` holds the newest 10. */
  total: number;
  pulls: PriorPull[];
}
