import { z } from 'zod';
import { Verdict } from './findings.js';
import { RunSummary } from './trace.js';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff, and the stored PR Brief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string().describe('Why the change exists and what it does, in 1-3 sentences.'),
  in_scope: z.array(z.string()).describe('Things this PR is meant to change.'),
  out_of_scope: z
    .array(z.string())
    .describe('Things explicitly excluded by the sources; empty unless stated.'),
});
export type Intent = z.infer<typeof Intent>;

/** How well-grounded a derived intent is; computed in code, never by the model. */
export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

export const IntentSourceKind = z.enum([
  'title',
  'body',
  'branch',
  'commits',
  'files',
  'github_issue',
  'ticket_key',
  'repo_doc',
  'github_doc',
  'external_url',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

export const IntentSourceStatus = z.enum(['used', 'truncated', 'skipped', 'failed']);
export type IntentSourceStatus = z.infer<typeof IntentSourceStatus>;

/** One input considered for intent derivation. Never carries content. */
export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string(),
  status: IntentSourceStatus,
  reason: z.string().optional(),
  chars: z.number().int().optional(),
});
export type IntentSource = z.infer<typeof IntentSource>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
  /** "METHOD /path" routes declared in the caller's file (absent on the ripgrep fallback). */
  endpoints: z.array(z.string()).optional(),
  /** Cron / scheduled jobs declared in the caller's file (absent on the ripgrep fallback). */
  crons: z.array(z.string()).optional(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const RiskKind = z.enum(['auth', 'dependency', 'performance', 'data', 'api_change', 'config', 'other']);
export type RiskKind = z.infer<typeof RiskKind>;

export const Risk = z.object({
  kind: RiskKind,
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  /** Sorted distinct start lines of the non-dismissed findings on this path. */
  finding_lines: z.array(z.number().int()),
  /** Ids of all findings (dismissed included) of the latest review per agent for this path. */
  finding_ids: z.array(z.string()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  /** True once at least one review exists for the PR. */
  has_review: z.boolean(),
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- PR Brief (pr_brief) ----

/** One place to read first. `line` is null when the model's line is not in the diff. */
export const PrBriefFocusItem = z.object({
  path: z.string(),
  line: z.number().int().nullable(),
  reason: z.string(),
});
export type PrBriefFocusItem = z.infer<typeof PrBriefFocusItem>;

/** What the model returns: text and refs only, no verdict or score. */
export const PrBriefDraft = z.object({
  summary: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(PrBriefFocusItem),
});
export type PrBriefDraft = z.infer<typeof PrBriefDraft>;

/** The stored brief: the verified draft plus generation metadata. */
export const PrBrief = z.object({
  summary: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(PrBriefFocusItem),
  generated_at: z.string(),
  provider: z.string(),
  model: z.string(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number().nullable(),
  head_sha: z.string(),
  source_review_id: z.string().nullable(),
  run_id: z.string().nullable(),
  files_total: z.number().int(),
  files_included: z.number().int(),
});
export type PrBrief = z.infer<typeof PrBrief>;

/** Facts of the newest `kind = review` review, computed at read time. */
export const PrBriefReview = z.object({
  review_id: z.string(),
  run_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  verdict: Verdict.nullable(),
  score: z.number().int().nullable(),
  findings_count: z.number().int(),
  blockers: z.number().int(),
  created_at: z.string(),
});
export type PrBriefReview = z.infer<typeof PrBriefReview>;

/** Response of `GET /pulls/:id/brief` (database only). */
export const PrBriefView = z.object({
  brief: PrBrief.nullable(),
  review: PrBriefReview.nullable(),
  run: RunSummary.nullable(),
  stale: z.boolean(),
});
export type PrBriefView = z.infer<typeof PrBriefView>;
