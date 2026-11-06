// Pure domain types for the intent module (core ring: no runtime imports).

export const INTENT_KINDS = ['feature', 'fix', 'refactor', 'chore', 'docs', 'test', 'unknown'] as const;
export type IntentKind = (typeof INTENT_KINDS)[number];
export const INTENT_CONFIDENCES = ['high', 'medium', 'low'] as const;
export type IntentConfidence = (typeof INTENT_CONFIDENCES)[number];
export const INTENT_CONFIDENCE_REASONS = ['substantive_body', 'linked_doc', 'closing_issue', 'short_body', 'indirect_only'] as const;
export type IntentConfidenceReason = (typeof INTENT_CONFIDENCE_REASONS)[number];
export const INTENT_DERIVATION_STATUSES = ['ok', 'failed', 'none'] as const;
export type IntentDerivationStatus = (typeof INTENT_DERIVATION_STATUSES)[number];
export type IntentOrigin = 'derived' | 'user';
export const INTENT_STALE_REASONS = ['head_moved', 'body_changed'] as const;
export type IntentStaleReason = (typeof INTENT_STALE_REASONS)[number];
export const INTENT_SOURCE_KINDS = ['pr_body', 'title', 'issue', 'plan', 'spec', 'doc', 'branch', 'commits', 'paths', 'external_link', 'tracker_key'] as const;
export type IntentSourceKind = (typeof INTENT_SOURCE_KINDS)[number];
export const INTENT_SOURCE_STATUSES = ['read', 'empty', 'unavailable', 'skipped_external', 'skipped_cross_repo', 'skipped_cap', 'unresolved'] as const;
export type IntentSourceStatus = (typeof INTENT_SOURCE_STATUSES)[number];
export const INTENT_SOURCE_REASONS = ['template_only', 'not_found', 'pull_request', 'unsafe_path', 'binary', 'github_unavailable', 'not_cloned', 'cap', 'pr_diff_excerpt'] as const;
export type IntentSourceReason = (typeof INTENT_SOURCE_REASONS)[number];
export type IntentSourceWeight = 'strong' | 'weak';
export type BodyQuality = 'substantive' | 'short' | 'empty';

/** One source as stored in pr_intent.sources and returned by the API (snake_case). */
export interface IntentSource {
  id: string; // offered id: 'pr_body' | 'title' | 'issue:12' | 'doc:plans/foo.md' | 'branch' | 'commits' | 'paths' | 'external:<host>' | 'tracker:ABC-1' | 'xrepo:o/r#3'
  kind: IntentSourceKind;
  ref: string; // display: '#12' | 'o/r#3' | 'plans/foo.md' | branch name | '12 commits' | '40 paths' | host | 'ABC-1'
  weight: IntentSourceWeight;
  status: IntentSourceStatus;
  reason: IntentSourceReason | null;
  used: boolean; // text offered to the classifier
  cited: boolean; // in the model's relied_on (intersect offered ids)
  issue_number: number | null;
  path: string | null;
}

/** API DTO — GET/POST/PUT/DELETE responses. */
export interface PrIntent {
  pr_id: string;
  status: IntentDerivationStatus;
  origin: IntentOrigin; // 'user' iff an override is stored
  intent: string | null; // EFFECTIVE text (override when origin='user')
  in_scope: string[];
  out_of_scope: string[];
  kind: IntentKind;
  confidence: IntentConfidence; // of the derivation
  confidence_reason: IntentConfidenceReason;
  confidence_lowered: boolean;
  sources: IntentSource[];
  head_sha: string | null; // origin 'user' -> override_head_sha, else derivation head
  stale: boolean;
  stale_reason: IntentStaleReason | null;
  provider: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  error: string | null;
  updated_at: string; // ISO
}

export interface IntentOverrideInput {
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
}

/** Persisted record (domain, camelCase) — repository maps rows to/from this. */
export interface DerivedIntent {
  intent: string;
  inScope: string[];
  outOfScope: string[];
}
export interface IntentUsage {
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}
export interface IntentOverride {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  headSha: string;
  at: Date;
}
export interface IntentRecord {
  prId: string;
  status: IntentDerivationStatus;
  derived: DerivedIntent | null; // non-null iff status === 'ok'
  kind: IntentKind;
  confidence: IntentConfidence;
  confidenceReason: IntentConfidenceReason;
  confidenceLowered: boolean;
  sources: IntentSource[];
  headSha: string | null;
  inputHash: string | null;
  bodyHash: string | null;
  usage: IntentUsage | null;
  error: string | null;
  override: IntentOverride | null;
  updatedAt: Date;
}

/** What the gatherer hands the classifier (priority order) + the full source list. */
export interface OfferedSource {
  id: string;
  label: string; // wrapUntrusted label
  text: string;
}
export interface IntentInputBundle {
  sources: IntentSource[];
  offered: OfferedSource[];
  bodyQuality: BodyQuality;
}

/** forReview result consumed by the reviews executor (via the Container type). */
export interface IntentStepInfo {
  cache: 'hit' | 'miss' | 'override';
  origin: IntentOrigin;
  confidence: IntentConfidence;
  stale: boolean;
  sourceRefs: string[]; // refs of used sources, priority order
  provider: string | null;
  model: string | null;
  tokensIn: number; // 0 on hit/override
  tokensOut: number;
  costUsd: number | null;
}
export type ReviewIntentResult =
  | { status: 'ready'; block: string; step: IntentStepInfo; logLine: string }
  | { status: 'skipped'; reason: string; logLine: string };
