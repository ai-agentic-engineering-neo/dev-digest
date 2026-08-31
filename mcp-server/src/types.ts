/**
 * Trimmed, hand-mirrored copies of `@devdigest/shared` contract shapes —
 * only the fields each tool actually needs, kept in sync manually (see
 * `docs/plans/mcp/server.md` for why `mcp-server` doesn't alias the real
 * package as source the way `reviewer-core` does).
 */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** mirrors @devdigest/shared, contracts/knowledge.ts — Agent */
export interface AgentSummary {
  id: string;
  name: string;
  description: string;
  provider: string;
  model: string;
  enabled: boolean;
}

/** mirrors @devdigest/shared, contracts/platform.ts — Repo */
export interface Repo {
  id: string;
  owner: string;
  name: string;
  full_name: string;
}

/** mirrors @devdigest/shared, contracts/platform.ts — PrMeta */
export interface PrMeta {
  id: string;
  number: number;
  title: string;
}

/** mirrors @devdigest/shared, contracts/review-api.ts — ReviewRunTarget */
export interface ReviewRunTarget {
  run_id: string;
  agent_id: string;
  agent_name: string;
}

/** mirrors @devdigest/shared, contracts/review-api.ts — ReviewRunResponse */
export interface ReviewRunResponse {
  pr_id: string;
  runs: ReviewRunTarget[];
  reviews: ReviewRecord[];
}

/** mirrors @devdigest/shared, contracts/trace.ts — RunSummary */
export type RunStatus = 'running' | 'done' | 'failed' | 'cancelled';

export interface RunSummary {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  status: string | null;
  error: string | null;
  findings_count: number | null;
  ran_at: string | null;
}

/** mirrors @devdigest/shared, contracts/findings.ts — Finding */
export type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';

export interface Finding {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
}

/** mirrors @devdigest/shared, contracts/review-api.ts — FindingRecord */
export interface FindingRecord extends Finding {
  review_id: string;
}

/** mirrors @devdigest/shared, contracts/review-api.ts — ReviewRecord */
export type Verdict = 'request_changes' | 'approve' | 'comment';

export interface ReviewRecord {
  id: string;
  pr_id: string;
  run_id: string | null;
  verdict: Verdict | null;
  findings: FindingRecord[];
}

/** mirrors @devdigest/shared, contracts/knowledge.ts — ConventionCandidate */
export interface ConventionCandidate {
  id: string;
  category: string;
  rule: string;
  evidence_path: string;
  confidence: number;
  accepted: boolean;
}

/** mirrors @devdigest/shared, contracts/knowledge.ts — ConventionScan */
export interface ConventionScan {
  repo_id: string;
  sample_file_count: number;
  candidate_count: number;
  scanned_at: string | null;
}

/** Trimmed shape every tool returns for a finding — concise per the "no raw dumps" principle. */
export interface TrimmedFinding {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
}

export interface ShapedReview {
  verdict: Verdict | null;
  findings: TrimmedFinding[];
  truncated: boolean;
  omitted_count: number;
}
