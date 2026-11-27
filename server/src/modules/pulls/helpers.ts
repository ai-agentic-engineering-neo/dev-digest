import type { PrMeta } from '@devdigest/shared';
import type { PullRecord } from './types.js';

/** Pure domain → DTO mapper for the PR list (no DB, no HTTP). */
export function toPrMeta(
  r: PullRecord,
  extra: { status: PrMeta['status']; score: number | null; costUsd: number | null },
): PrMeta {
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
    status: extra.status,
    opened_at: r.openedAt?.toISOString() ?? null,
    updated_at: r.updatedAt?.toISOString() ?? null,
    score: extra.score,
    cost_usd: extra.costUsd,
  };
}
