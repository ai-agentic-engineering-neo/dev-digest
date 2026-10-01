// Ring 1. Pure matching of tool arguments against API lists. Case-insensitive,
// trimmed for repo names; PRs without a persisted id cannot be addressed by the
// API and are ignored.
import type { PrMeta, Repo } from '@devdigest/shared';

export function matchRepoByFullName(repos: readonly Repo[], fullName: string): Repo | undefined {
  const wanted = fullName.trim().toLowerCase();
  return repos.find((r) => r.full_name.trim().toLowerCase() === wanted);
}

export type PersistedPr = PrMeta & { id: string };

export function matchPrByNumber(prs: readonly PrMeta[], number: number): PersistedPr | undefined {
  return prs.find((p): p is PersistedPr => p.number === number && p.id != null);
}
