import type { BlastRadius, FeatureModelChoice, Intent, Risk, SmartDiffRole } from '@devdigest/shared';

/** Same values + order as blast BLAST_DEGRADED_REASONS (test/brief-schemas.test.ts asserts it). */
export const BRIEF_BLAST_REASONS = ['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data'] as const;
export type BriefBlastReason = (typeof BRIEF_BLAST_REASONS)[number];
export const BRIEF_INTENT_REASONS = ['not_derived', 'failed'] as const;
export type BriefIntentReason = (typeof BRIEF_INTENT_REASONS)[number];

export type BriefMissingInput =
  | { input: 'intent'; reason: BriefIntentReason }
  | { input: 'blast'; reason: BriefBlastReason }
  | { input: 'smart_diff_roles'; reason: 'not_in_build' };

/** All 0 = nothing cut. */
export interface BriefTruncation {
  spec_docs: number;
  callers: number;
  boilerplate_hunk_files: number;
}

/** A grounded risk file ref. `ref` = "path" or "path:start-end" as kept; in_diff false = blast-map-only file. */
export interface BriefFileRef {
  ref: string;
  path: string;
  start_line: number | null;
  end_line: number | null;
  in_diff: boolean;
}

/** Shared Risk unchanged; file_refs === refs.map(r => r.ref). */
export interface BriefRisk extends Risk {
  refs: BriefFileRef[];
}

/** file_level true => line 1, shown as "file — reason" (AC-7). in_diff false => blast-only, model line kept. */
export interface BriefFocusItem {
  file: string;
  line: number;
  file_level: boolean;
  in_diff: boolean;
  reason: string;
}

export interface BriefUsage {
  provider: FeatureModelChoice['provider'];
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number | null;
}

/** Stored as pr_brief.json. */
export interface StoredBrief {
  summary: string;
  risks: BriefRisk[]; // <= 6, model order
  review_focus: BriefFocusItem[]; // <= 7, model order
  missing_inputs: BriefMissingInput[]; // order: intent, blast, smart_diff_roles
  truncated: BriefTruncation;
  head_sha: string; // commit the brief was generated for (AC-18, AC-21)
  blast_link_sha: string | null; // D11; null when blast unavailable
  usage: BriefUsage; // AC-21 — stored here only
  generated_at: string; // ISO
}

/** GET / POST response. */
export interface PrBriefResponse {
  pr_id: string;
  model: FeatureModelChoice; // effective Risk Brief model: workspace override ?? DEFAULT_BRIEF_MODEL (AC-1, AC-17)
  changed_files: number; // AC-16
  generating: boolean; // a generation is in flight for this PR (AC-19)
  outdated: boolean; // brief !== null && brief.head_sha !== PR head (AC-18)
  brief: StoredBrief | null; // null = "none yet" (AC-10)
}

// ---- model input facts (internal, camelCase) ----
/** header = "@@ -a,b +c,d @@" only. */
export interface HunkRange {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}
export interface BriefChangedFile {
  path: string;
  additions: number;
  deletions: number;
  role: SmartDiffRole | null;
  hunks: HunkRange[];
}
export interface BriefCaller {
  symbol: string;
  file: string;
  line: number;
  name: string;
}
export interface BriefBlastFacts {
  summary: string;
  changedSymbols: { name: string; file: string; kind: string }[];
  callers: BriefCaller[];
  endpoints: string[];
  crons: string[];
}
export interface BriefSpecDoc {
  path: string;
  content: string;
}
export interface BriefFacts {
  pr: { number: number; fullName: string; title: string; body: string | null };
  intent: Intent | null;
  linkedIssues: string[];
  files: BriefChangedFile[];
  blast: BriefBlastFacts | null;
  specDocs: BriefSpecDoc[];
}

// ---- structural views of other modules' results (PrIntent / PrBlastRadius are assignable — no cross-module import) ----
export interface BriefIntentView {
  status: 'ok' | 'failed' | 'none';
  intent: string | null;
  in_scope: string[];
  out_of_scope: string[];
  sources: { kind: string; ref: string; status: string }[];
}
export interface BriefBlastView extends BlastRadius {
  degraded: boolean;
  reason: BriefBlastReason | null;
  link_sha: string;
}

// ---- LLM reply (validated by BriefModelReply) ----
export interface BriefReplyFocus {
  file: string;
  line: number;
  reason: string;
}
export interface BriefReplyData {
  summary: string;
  risks: Risk[];
  review_focus: BriefReplyFocus[];
}
