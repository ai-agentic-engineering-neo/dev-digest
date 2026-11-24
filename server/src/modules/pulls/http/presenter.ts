import type { PrMeta } from '@devdigest/shared';
import type { PullListItem } from '../domain/types.js';

/** List row → contract. `status` is the derived review status, not GitHub's. */
export function presentPullListItem(p: PullListItem): PrMeta {
  return {
    id: p.id,
    number: p.number,
    title: p.title,
    author: p.author,
    branch: p.branch,
    base: p.base,
    head_sha: p.headSha,
    additions: p.additions,
    deletions: p.deletions,
    files_count: p.filesCount,
    status: p.reviewStatus,
    opened_at: p.openedAt?.toISOString() ?? null,
    updated_at: p.updatedAt?.toISOString() ?? null,
    score: p.score,
    cost_usd: p.costUsd,
  };
}
