import type { DevDigestHttpClient } from '../http/client.js';

/** Subset of `@devdigest/shared`'s `PrMeta` contract this resolver needs.
 *  `id` is only typed `nullish` there (contract looseness) — guarded
 *  against below even though it's not expected in practice. */
interface PullRow {
  id?: string | null;
  number: number;
  title: string;
}

export interface ResolvedPull {
  id: string;
  number: number;
  title: string;
}

/** Error handling table: "PR not found" row. Carries only structured data —
 *  the final message needs the repo's `full_name`, which this resolver
 *  (repoId-only, per its documented signature) doesn't have. Callers format
 *  it via `formatPullNotFoundMessage` using the `ResolvedRepo` they already
 *  hold from `resolveRepo`. */
export class PullNotFoundError extends Error {
  constructor(
    public readonly prNumber: number,
    public readonly availableNumbers: number[],
  ) {
    super(`PR #${prNumber} not found.`);
    this.name = 'PullNotFoundError';
  }
}

/** Renders the Error handling table's exact "PR not found" template. */
export function formatPullNotFoundMessage(err: PullNotFoundError, repoFullName: string): string {
  const shown = err.availableNumbers.slice(0, 10);
  return `PR #${err.prNumber} not found in ${repoFullName}. Available PR numbers: ${
    shown.length > 0 ? shown.join(', ') : '(none)'
  }. Confirm the number, or re-sync the repo from the web UI.`;
}

/**
 * `(repoId, prNumber)` -> `{id, number, title}`. `GET /repos/:repoId/pulls`
 * has no number-lookup query param, so this fetches the PR list and matches
 * `number === prNumber` in memory.
 */
export async function resolvePull(
  http: DevDigestHttpClient,
  repoId: string,
  prNumber: number,
): Promise<ResolvedPull> {
  const pulls = await http.get<PullRow[]>(`/repos/${repoId}/pulls`);
  const match = pulls.find((p) => p.number === prNumber);
  if (!match) {
    throw new PullNotFoundError(
      prNumber,
      pulls.map((p) => p.number),
    );
  }
  if (!match.id) {
    throw new Error(
      `PR #${prNumber} has no internal id (data integrity issue, not expected in practice) — re-sync the repo from the web UI.`,
    );
  }
  return { id: match.id, number: match.number, title: match.title };
}
