import { describe, expect, it, vi } from 'vitest';
import { DevDigestHttpClient } from '../../src/http/client.js';
import { PullNotFoundError, formatPullNotFoundMessage, resolvePull } from '../../src/resolvers/pull.js';

const PULLS = [
  { id: 'pr-1', number: 1, title: 'Fix bug' },
  { id: 'pr-2', number: 2, title: 'Add feature' },
];

function clientReturning(pulls: unknown[]) {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(pulls), { status: 200 }));
  return new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
}

describe('resolvePull', () => {
  it('matches by PR number', async () => {
    const http = clientReturning(PULLS);
    const result = await resolvePull(http, 'repo-1', 2);
    expect(result).toEqual({ id: 'pr-2', number: 2, title: 'Add feature' });
  });

  it('throws PullNotFoundError with available numbers on zero matches', async () => {
    const http = clientReturning(PULLS);
    await expect(resolvePull(http, 'repo-1', 99)).rejects.toBeInstanceOf(PullNotFoundError);
    await expect(resolvePull(http, 'repo-1', 99)).rejects.toMatchObject({
      prNumber: 99,
      availableNumbers: [1, 2],
    });
  });

  it('guards defensively against a matching PR with a missing id', async () => {
    const http = clientReturning([{ number: 5, title: 'No id' }]);
    await expect(resolvePull(http, 'repo-1', 5)).rejects.toThrow(/no internal id/);
  });

  it('formatPullNotFoundMessage renders the table template with repo full_name and up to 10 numbers', () => {
    const err = new PullNotFoundError(
      99,
      Array.from({ length: 15 }, (_, i) => i + 1),
    );
    const message = formatPullNotFoundMessage(err, 'acme/widgets');
    expect(message).toBe(
      'PR #99 not found in acme/widgets. Available PR numbers: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10. Confirm the number, or re-sync the repo from the web UI.',
    );
  });

  it('formatPullNotFoundMessage handles zero available PRs', () => {
    const err = new PullNotFoundError(1, []);
    const message = formatPullNotFoundMessage(err, 'acme/widgets');
    expect(message).toContain('Available PR numbers: (none)');
  });
});
