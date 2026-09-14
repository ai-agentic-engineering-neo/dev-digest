import { describe, expect, it, vi } from 'vitest';
import { DevDigestHttpClient } from '../../src/http/client.js';
import { AmbiguousRepoError, RepoNotFoundError, resolveRepo } from '../../src/resolvers/repo.js';

const REPOS = [
  { id: '1', owner: 'acme', name: 'widgets', full_name: 'acme/widgets' },
  { id: '2', owner: 'acme', name: 'gadgets', full_name: 'acme/gadgets' },
  { id: '3', owner: 'other-org', name: 'widgets', full_name: 'other-org/widgets' },
];

function clientReturning(repos: typeof REPOS) {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(repos), { status: 200 }));
  return new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
}

describe('resolveRepo', () => {
  it('matches full_name exactly (case-sensitive input)', async () => {
    const http = clientReturning(REPOS);
    const result = await resolveRepo(http, 'acme/widgets');
    expect(result).toEqual({ id: '1', owner: 'acme', name: 'widgets', full_name: 'acme/widgets' });
  });

  it('matches full_name case-insensitively', async () => {
    const http = clientReturning(REPOS);
    const result = await resolveRepo(http, 'ACME/Widgets');
    expect(result.id).toBe('1');
  });

  it('matches a bare name case-insensitively when unambiguous', async () => {
    const http = clientReturning(REPOS);
    const result = await resolveRepo(http, 'Gadgets');
    expect(result.id).toBe('2');
  });

  it('throws AmbiguousRepoError for a bare name matching multiple repos', async () => {
    const http = clientReturning(REPOS);
    await expect(resolveRepo(http, 'widgets')).rejects.toBeInstanceOf(AmbiguousRepoError);
    await expect(resolveRepo(http, 'widgets')).rejects.toMatchObject({
      candidates: ['acme/widgets', 'other-org/widgets'],
    });
  });

  it('throws RepoNotFoundError with the known-repos list on zero matches', async () => {
    const http = clientReturning(REPOS);
    await expect(resolveRepo(http, 'nope')).rejects.toBeInstanceOf(RepoNotFoundError);
    await expect(resolveRepo(http, 'nope')).rejects.toMatchObject({
      knownRepos: ['acme/widgets', 'acme/gadgets', 'other-org/widgets'],
    });
  });

  it('throws RepoNotFoundError (not ambiguous) when an owner/name form has zero matches', async () => {
    const http = clientReturning(REPOS);
    await expect(resolveRepo(http, 'acme/nonexistent')).rejects.toBeInstanceOf(RepoNotFoundError);
  });

  it('RepoNotFoundError message mentions the input and known repos', async () => {
    const http = clientReturning(REPOS);
    await expect(resolveRepo(http, 'nope')).rejects.toThrow(/nope.*acme\/widgets/s);
  });
});
