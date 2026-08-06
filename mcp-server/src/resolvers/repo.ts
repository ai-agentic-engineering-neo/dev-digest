import type { DevDigestHttpClient } from '../http/client.js';

/** Subset of `@devdigest/shared`'s `Repo` contract this resolver needs —
 *  redefined locally per this package's "no shared-contract import"
 *  decision (specs/06-mcp-server.md "Package layout"). */
interface RepoRow {
  id: string;
  owner: string;
  name: string;
  full_name: string;
}

export interface ResolvedRepo {
  id: string;
  owner: string;
  name: string;
  full_name: string;
}

/** Error handling table: "repo not found" row. */
export class RepoNotFoundError extends Error {
  constructor(
    public readonly input: string,
    public readonly knownRepos: string[],
  ) {
    super(
      `Repo '${input}' not found in this workspace. Known repos: ${
        knownRepos.length > 0 ? knownRepos.join(', ') : '(none)'
      }. Add it via the web UI (Repos → Add) or check the spelling.`,
    );
    this.name = 'RepoNotFoundError';
  }
}

/** Error handling table: "ambiguous bare repo name" row. */
export class AmbiguousRepoError extends Error {
  constructor(
    public readonly input: string,
    public readonly candidates: string[],
  ) {
    super(`'${input}' matches multiple repos: ${candidates.join(', ')}. Retry with the full 'owner/name' form.`);
    this.name = 'AmbiguousRepoError';
  }
}

/**
 * Human repo string -> `{id, owner, name, full_name}`. `GET /repos` has no
 * lookup-by-name endpoint, so this fetches the whole (workspace-scoped,
 * typically small) list and matches in memory. If `input` contains `/`,
 * matches `full_name` case-insensitively; otherwise matches the bare `name`
 * case-insensitively. Zero matches -> `RepoNotFoundError`; more than one
 * match on a bare-name lookup -> `AmbiguousRepoError`.
 */
export async function resolveRepo(http: DevDigestHttpClient, input: string): Promise<ResolvedRepo> {
  const repos = await http.get<RepoRow[]>('/repos');
  const trimmed = input.trim();
  const hasOwner = trimmed.includes('/');
  const needle = trimmed.toLowerCase();
  const matches = hasOwner
    ? repos.filter((r) => r.full_name.toLowerCase() === needle)
    : repos.filter((r) => r.name.toLowerCase() === needle);

  if (matches.length === 0) {
    throw new RepoNotFoundError(
      input,
      repos.map((r) => r.full_name),
    );
  }
  if (!hasOwner && matches.length > 1) {
    throw new AmbiguousRepoError(
      input,
      matches.map((r) => r.full_name),
    );
  }
  const match = matches[0];
  if (!match) throw new RepoNotFoundError(input, repos.map((r) => r.full_name));
  return { id: match.id, owner: match.owner, name: match.name, full_name: match.full_name };
}
