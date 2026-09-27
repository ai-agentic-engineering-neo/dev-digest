import type {
  ConventionCandidate,
  ConventionDiscarded,
  ConventionScan,
} from '@devdigest/shared';
// From db/rows.ts, the row types' source — importing them back from
// repository.ts would close a helpers -> repository -> helpers cycle.
import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';

/** Pure row ⇄ DTO mapping for the conventions module. No I/O. */

const EMPTY_DISCARDED: ConventionDiscarded = {
  missing_file: 0,
  bad_lines: 0,
  snippet_mismatch: 0,
  duplicate: 0,
  rejected_before: 0,
};

export function toCandidateDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    repo_id: row.repoId ?? '',
    rule: row.rule,
    rationale: row.rationale,
    category: row.category,
    status: row.status,
    confidence: row.confidence ?? 0,
    evidence_path: row.evidencePath ?? '',
    evidence_line_start: row.evidenceLineStart,
    evidence_line_end: row.evidenceLineEnd,
    evidence_snippet: row.evidenceSnippet ?? '',
    evidence_sha: row.evidenceSha,
    scan_id: row.scanId,
    skill_id: row.skillId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toScanDto(row: ConventionScanRow): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    status: row.status,
    provider: row.provider,
    model: row.model,
    head_sha: row.headSha,
    sample_files: row.sampleFiles ?? [],
    candidates_total: row.candidatesTotal,
    candidates_kept: row.candidatesKept,
    // `discarded` is jsonb: an older row (or a scan that failed before the
    // verifier ran) carries `{}`, and the UI subtracts these numbers.
    discarded: { ...EMPTY_DISCARDED, ...((row.discarded as Partial<ConventionDiscarded>) ?? {}) },
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    error: row.error,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

/**
 * Sort for the screen: undecided first (best confidence first), then accepted,
 * then rejected. A rejected rule stays reachable — it is hidden behind a
 * toggle, not deleted — but it never competes for attention with a live one.
 */
const STATUS_RANK: Record<ConventionCandidate['status'], number> = {
  pending: 0,
  accepted: 1,
  rejected: 2,
};

export function sortCandidates(candidates: ConventionCandidate[]): ConventionCandidate[] {
  return [...candidates].sort((a, b) => {
    const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (byStatus !== 0) return byStatus;
    return b.confidence - a.confidence;
  });
}
