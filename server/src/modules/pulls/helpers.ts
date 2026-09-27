import type { FindingsSummary, PrDetail, PrMeta, PrStatus } from '@devdigest/shared';
import type { PrCommitRecord, PrFileRecord, PullRecord } from './repository.js';

/** A PR plus its derived list columns, before it becomes wire JSON. */
export interface PullListRow {
  pull: PullRecord;
  reviewStatus: PrStatus;
  score: number | null;
  costUsd: number | null;
  findings: FindingsSummary | null;
}

/** Domain -> wire. JSON on the wire is snake_case. */
export function toPrMeta(row: PullListRow): PrMeta {
  const r = row.pull;
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    author: r.author,
    branch: r.branch,
    base: r.base,
    head_sha: r.headSha,
    additions: r.additions,
    deletions: r.deletions,
    files_count: r.filesCount,
    status: row.reviewStatus,
    opened_at: r.openedAt?.toISOString() ?? null,
    updated_at: r.updatedAt?.toISOString() ?? null,
    score: row.score,
    cost_usd: row.costUsd,
    findings: row.findings,
  };
}

/** The offline path: detail assembled from what is persisted. */
export function toPrDetail(
  r: PullRecord,
  files: PrFileRecord[],
  commits: PrCommitRecord[],
): PrDetail {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    author: r.author,
    branch: r.branch,
    base: r.base,
    head_sha: r.headSha,
    additions: r.additions,
    deletions: r.deletions,
    files_count: r.filesCount,
    status: r.status as PrDetail['status'],
    opened_at: r.openedAt?.toISOString() ?? null,
    updated_at: r.updatedAt?.toISOString() ?? null,
    body: r.body ?? null,
    files: files.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    })),
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      author: c.author,
      committed_at: c.committedAt?.toISOString() ?? null,
    })),
  };
}
