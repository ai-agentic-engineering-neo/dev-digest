import { describe, it, expect } from 'vitest';
import { postGithubReview } from './github.js';
import { RunnerError } from './errors.js';
import type { FetchLike } from './github.js';

/**
 * The 504 case is not hypothetical: GitHub answered 504 on a 17 KB review with
 * 26 inline comments while having created the review anyway
 * (burnjohn/quick-blog#31). Failing there fails the CI check for a review the
 * PR already carries, and a job re-run would post a second copy.
 */

const CTX = { owner: 'acme', repo: 'widgets', prNumber: 42 };
const PAYLOAD = { body: '## DevDigest — 2 reviewers', event: 'COMMENT' as const };

function fetchStub(handler: (url: string, init?: RequestInit) => Response): { fetchImpl: FetchLike; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    urls.push(String(input));
    return handler(String(input), init);
  }) as unknown as FetchLike;
  return { fetchImpl, urls };
}

describe('postGithubReview', () => {
  it('treats a 5xx as success when the review is already on the PR', async () => {
    const { fetchImpl, urls } = fetchStub((url, init) => {
      if (init?.method === 'POST') return new Response('gateway timeout', { status: 504 });
      return new Response(JSON.stringify([{ body: PAYLOAD.body }]), { status: 200 });
    });

    await expect(postGithubReview(CTX, 'token', PAYLOAD, fetchImpl)).resolves.toBeUndefined();
    expect(urls.some((u) => u.includes('reviews?per_page=100'))).toBe(true);
  });

  it('still fails when the 5xx really did lose the write', async () => {
    const { fetchImpl } = fetchStub((_url, init) =>
      init?.method === 'POST'
        ? new Response('gateway timeout', { status: 504 })
        : new Response('[]', { status: 200 }),
    );

    await expect(postGithubReview(CTX, 'token', PAYLOAD, fetchImpl)).rejects.toBeInstanceOf(RunnerError);
  });

  it('does not swallow a 4xx — only a response-timeout shape is worth re-checking', async () => {
    let listed = false;
    const { fetchImpl } = fetchStub((_url, init) => {
      if (init?.method === 'POST') return new Response('forbidden', { status: 403 });
      listed = true;
      return new Response(JSON.stringify([{ body: PAYLOAD.body }]), { status: 200 });
    });

    await expect(postGithubReview(CTX, 'token', PAYLOAD, fetchImpl)).rejects.toThrow(/403/);
    expect(listed).toBe(false);
  });

  it('reports the original error when the existence check itself fails', async () => {
    const { fetchImpl } = fetchStub((_url, init) => {
      if (init?.method === 'POST') return new Response('gateway timeout', { status: 504 });
      throw new Error('network down');
    });

    await expect(postGithubReview(CTX, 'token', PAYLOAD, fetchImpl)).rejects.toThrow(/504/);
  });
});
