import type { PrMeta, Repo } from '@devdigest/shared';
import type { ApiClient } from './client.js';
import { UserError } from '../errors.js';

const MAX_CANDIDATES = 10;
const TITLE_MAX = 80;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface ResolvedRepo {
  id: string;
  full_name: string;
}

export interface ResolvedPull {
  id: string;
  number: number;
  title: string;
}

export async function resolveRepo(api: ApiClient, repo: string, signal?: AbortSignal): Promise<ResolvedRepo> {
  const wanted = repo.trim().toLowerCase();
  const repos = await api.get<Repo[]>('/repos', signal);
  const matches = repos.filter((r) =>
    wanted.includes('/') ? r.full_name.toLowerCase() === wanted : r.name.toLowerCase() === wanted,
  );
  if (matches.length === 1) {
    const m = matches[0]!;
    return { id: m.id, full_name: m.full_name };
  }
  if (matches.length > 1) {
    throw new UserError(
      `Repository "${repo}" is ambiguous, use owner/name. Matches: ${matches.map((m) => m.full_name).join(', ')}.`,
    );
  }
  const known = repos.slice(0, MAX_CANDIDATES).map((r) => r.full_name);
  throw new UserError(
    `Repository "${repo}" is not imported in DevDigest. Known repositories: ${known.length ? known.join(', ') : 'none'}.`,
  );
}

export async function resolvePull(
  api: ApiClient,
  repoId: string,
  prNumber: number,
  signal?: AbortSignal,
): Promise<ResolvedPull> {
  const pulls = await api.get<PrMeta[]>(`/repos/${repoId}/pulls`, signal);
  const hit = pulls.find((p) => p.number === prNumber && p.id);
  if (hit && hit.id) return { id: hit.id, number: hit.number, title: hit.title };
  // Candidates are open PRs only (closed and merged ones are not reviewable targets).
  // Titles are untrusted PR content going back into the model's context: clip them.
  const known = pulls
    .filter((p) => p.id && p.status !== 'closed' && p.status !== 'merged')
    .slice(0, MAX_CANDIDATES)
    .map((p) => `#${p.number} ${clip(p.title, TITLE_MAX)}`);
  throw new UserError(
    `PR #${prNumber} was not found in this repository. Open PRs: ${known.length ? known.join('; ') : 'none'}.`,
  );
}
