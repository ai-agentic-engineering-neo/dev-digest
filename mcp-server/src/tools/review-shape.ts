/**
 * Shared `ReviewRecord` -> concise `ReviewResult` mapper, used by
 * `run_agent_on_pr` and `get_findings` (both return the same success shape).
 *
 * Deliberately dropped from the raw record: finding `id`, `review_id`,
 * `accepted_at`/`dismissed_at` (no accept/dismiss tool exists in this v1
 * surface), `trifecta_components`/`evidence` (`kind` alone is enough
 * signal), `model`, `grounding`, `created_at`.
 */

export interface ConciseFinding {
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  category: 'bug' | 'security' | 'perf' | 'style' | 'test';
  kind?: 'finding' | 'secret_leak' | 'lethal_trifecta' | 'phantom' | 'hook';
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion?: string | null;
  confidence: number;
}

export interface ReviewResult {
  run_id: string | null;
  agent_id: string | null;
  agent_name: string | null;
  verdict: 'request_changes' | 'approve' | 'comment' | null;
  summary: string | null;
  score: number | null;
  findings: ConciseFinding[];
}

/** Subset of `@devdigest/shared`'s `FindingRecord` this mapper reads. */
export interface RawFindingRecord {
  severity: string;
  category: string;
  kind?: string | null;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion?: string | null;
  confidence: number;
}

/** Subset of `@devdigest/shared`'s `ReviewRecord` this mapper reads. */
export interface RawReviewRecord {
  run_id: string | null;
  agent_id: string | null;
  agent_name?: string | null;
  verdict: string | null;
  summary: string | null;
  score: number | null;
  findings: RawFindingRecord[];
}

export function toReviewResult(review: RawReviewRecord): ReviewResult {
  return {
    run_id: review.run_id,
    agent_id: review.agent_id,
    agent_name: review.agent_name ?? null,
    verdict: (review.verdict as ReviewResult['verdict']) ?? null,
    summary: review.summary,
    score: review.score,
    findings: review.findings.map(toConciseFinding),
  };
}

function toConciseFinding(f: RawFindingRecord): ConciseFinding {
  return {
    severity: f.severity as ConciseFinding['severity'],
    category: f.category as ConciseFinding['category'],
    ...(f.kind ? { kind: f.kind as NonNullable<ConciseFinding['kind']> } : {}),
    title: f.title,
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    rationale: f.rationale,
    suggestion: f.suggestion ?? null,
    confidence: f.confidence,
  };
}
