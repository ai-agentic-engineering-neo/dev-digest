import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

// ---- Intent Layer (derived, provenance-tracked) ----
/** Where a piece of intent evidence came from. */
export const IntentSourceKind = z.enum([
  'description',
  'linked_issue',
  'plan_spec',
  'commits',
  'branch',
  'file_paths',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

/**
 * One evidence source consulted (or attempted) for the intent. `unresolved`
 * records a reference we saw but deliberately never followed (Jira/Linear keys,
 * cross-repo issues); `skipped_external` a URL outside the repo.
 */
export const IntentSourceRef = z.object({
  kind: IntentSourceKind,
  ref: z.string(),
  title: z.string().nullish(),
  status: z.enum(['used', 'unreadable', 'skipped_external', 'unresolved']),
  truncated: z.boolean(),
});
export type IntentSourceRef = z.infer<typeof IntentSourceRef>;

export const IntentConfidence = z.enum(['low', 'medium', 'high']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

export const IntentRiskKind = z.enum([
  'security',
  'data',
  'performance',
  'compatibility',
  'behavior',
  'other',
]);
export type IntentRiskKind = z.infer<typeof IntentRiskKind>;

/** A risk area grounded to a changed file (never a free-floating claim). */
export const IntentRiskArea = z.object({
  kind: IntentRiskKind,
  title: z.string(),
  file: z.string(),
  line: z.number().int().nullable(),
  explanation: z.string(),
});
export type IntentRiskArea = z.infer<typeof IntentRiskArea>;

/**
 * What the classifier LLM returns. Deliberately no min/max on numbers (strict
 * json_schema rejects them): `finalizeIntent` clamps and grounds the result.
 * Only `nullable` (never `optional`) so the strict schema stays valid.
 */
export const IntentClassification = Intent.extend({
  confidence: z.number(),
  primary_source: IntentSourceKind,
  risk_areas: z.array(IntentRiskArea),
});
export type IntentClassification = z.infer<typeof IntentClassification>;

/** The persisted, provenance-tracked intent of a PR at a given head commit. */
export const PrIntent = Intent.extend({
  pr_id: z.string(),
  head_sha: z.string(),
  confidence: z.number().min(0).max(1),
  confidence_level: IntentConfidence,
  primary_source: IntentSourceKind,
  sources_used: z.array(IntentSourceRef),
  risk_areas: z.array(IntentRiskArea),
  provider: z.string(),
  model: z.string(),
  /** USD spent deriving this intent; null when the model is unpriced. */
  cost_usd: z.number().nullable(),
  generated_at: z.string(),
});
export type PrIntent = z.infer<typeof PrIntent>;

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

export const Risk = z.object({
  kind: z.string(),
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
export const SmartDiffRole = z.enum(['core', 'wiring', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
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
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;
