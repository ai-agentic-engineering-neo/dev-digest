// Pure domain types for the blast module (core ring: type-only imports from shared).
import type { ChangedSymbol, DownstreamImpact } from '@devdigest/shared';

export const BLAST_DEGRADED_REASONS = ['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data'] as const;
export type BlastDegradedReason = (typeof BLAST_DEGRADED_REASONS)[number];
export type BlastIndexStatus = 'full' | 'partial' | 'degraded' | 'failed';

/** Structural view of container.repoIntel results (no import from modules/repo-intel). */
export interface BlastIntelCaller {
  file: string;
  symbol: string;
  viaFile: string;
  viaSymbol: string;
  line: number;
  rank: number;
}
export interface BlastIntelResult {
  changedSymbols: ChangedSymbol[];
  callers: BlastIntelCaller[];
  impactedEndpoints: string[];
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  callersOmitted: number;
  degraded?: boolean;
  reason?: BlastDegradedReason;
}
export interface BlastIndexSnapshot {
  status: BlastIndexStatus;
  lastIndexedSha: string;
  degradedReason?: BlastDegradedReason;
}
export type BlastStatus = { degraded: false; reason: null } | { degraded: true; reason: BlastDegradedReason };

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

/** API DTO — GET /pulls/:id/blast (snake_case). */
export interface PrBlastRadius {
  pr_id: string;
  head_sha: string;
  indexed_sha: string | null; // repo_index_state.last_indexed_sha, '' -> null
  link_sha: string; // indexed_sha ?? head_sha — commit the caller lines come from; UI + MCP links use ONLY this
  changed_symbols: ChangedSymbol[];
  downstream: BlastDownstream[]; // only symbols with >=1 caller
  unattributed_endpoints: string[]; // fallback path only (no factsByFile); [] on the persistent path
  summary: string; // deterministic, built from counts (no model)
  counts: BlastCounts; // counts of what is in THIS response
  callers_omitted: number;
  degraded: boolean; // invariant: degraded === (reason !== null)
  reason: BlastDegradedReason | null;
}
