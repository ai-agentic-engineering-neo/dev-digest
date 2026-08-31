import type { ApiClient } from './client.js';
import type { PrMeta, Repo } from './types.js';

/**
 * Thrown by the resolve helpers below; the message always names the
 * recovery action, per the "errors lead forward" design principle — never a
 * bare "not found".
 */
export class ToolInputError extends Error {}

/**
 * `GET /repos` has no lookup-by-name — resolve `"owner/name"` client-side.
 * Exact match against `full_name` (constructed the same way in
 * `server/src/modules/repos/service.ts`).
 */
export async function resolveRepo(client: ApiClient, repoArg: string): Promise<Repo> {
  const repos = await client.get<Repo[]>('/repos');
  const repo = repos.find((r) => r.full_name === repoArg);
  if (!repo) {
    throw new ToolInputError(
      `repo '${repoArg}' is not configured in DevDigest — pass the exact 'owner/name' of an imported repo`,
    );
  }
  return repo;
}

/** `GET /repos/:id/pulls` has no lookup-by-number — resolve client-side. */
export async function resolvePr(client: ApiClient, repoId: string, prNumber: number): Promise<PrMeta> {
  const pulls = await client.get<PrMeta[]>(`/repos/${repoId}/pulls`);
  const pr = pulls.find((p) => p.number === prNumber);
  if (!pr) {
    throw new ToolInputError(
      `PR #${prNumber} not found on this repo — check the number or that the repo has been synced`,
    );
  }
  return pr;
}
