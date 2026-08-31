import type { ReviewRecord, RunSummary, ShapedReview } from './types.js';

const SEVERITY_ORDER = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 } as const;

/** Caps per-call token cost — see the "concise structured responses" principle. */
export const MAX_FINDINGS = 50;

/**
 * `ReviewRecord` -> `{verdict, findings[]}`, trimmed to essentials, sorted
 * CRITICAL > WARNING > SUGGESTION, capped at `MAX_FINDINGS`. Shared by
 * `get_findings` and `run_agent_on_pr` so the two tools never diverge in
 * shape.
 */
export function shapeReviewRecord(review: ReviewRecord): ShapedReview {
  const sorted = [...review.findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const truncated = sorted.length > MAX_FINDINGS;
  const kept = sorted.slice(0, MAX_FINDINGS).map((f) => ({
    id: f.id,
    severity: f.severity,
    category: f.category,
    title: f.title,
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    rationale: f.rationale,
  }));
  return {
    verdict: review.verdict,
    findings: kept,
    truncated,
    omitted_count: truncated ? sorted.length - MAX_FINDINGS : 0,
  };
}

/**
 * Short, human-readable status text — reused by `get_findings`' "not
 * finished yet" branch and `run_agent_on_pr`'s timeout branch so the wording
 * never diverges between the two tools.
 */
export function shapeRunStatus(run: RunSummary): string {
  switch (run.status) {
    case 'running':
      return `run ${run.run_id} is still running`;
    case 'failed':
      return `run ${run.run_id} failed: ${run.error ?? 'unknown error'}`;
    case 'cancelled':
      return `run ${run.run_id} was cancelled`;
    case 'done':
      return `run ${run.run_id} is done`;
    default:
      return `run ${run.run_id} has status '${run.status ?? 'unknown'}'`;
  }
}
