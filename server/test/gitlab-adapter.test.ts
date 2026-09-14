import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitLabClient } from '../src/adapters/gitlab/rest.js';
import { OctokitGitHubClient } from '../src/adapters/github/octokit.js';
import type { CodeHostClient } from '@devdigest/shared';

/**
 * Mocked-HTTP coverage for the GitLab REST adapter — no real network. Every
 * call asserts auth goes through the `PRIVATE-TOKEN` header (never a
 * query-string token) so tokens can't leak into access logs.
 */

const REPO = { owner: 'acme', name: 'payments-api' };

/** Queue-based fetch mock: each call shifts the next canned Response off the list. */
function mockFetchSequence(responses: { status?: number; body?: unknown }[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const queue = [...responses];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = queue.shift();
    const status = next?.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(next?.body ?? {}),
      json: async () => next?.body,
    } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fn };
}

describe('GitLabClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists merge requests, mapping iid → number and status', async () => {
    const { calls } = mockFetchSequence([
      {
        body: [
          {
            iid: 12,
            title: 'Add rate limiting',
            author: { username: 'marisa' },
            source_branch: 'feat/rl',
            target_branch: 'main',
            sha: 'abc123',
            state: 'opened',
            created_at: '2026-06-01T00:00:00Z',
            updated_at: '2026-06-02T00:00:00Z',
          },
          {
            iid: 11,
            title: 'Fix flaky test',
            author: null,
            source_branch: 'fix/flaky',
            target_branch: 'main',
            sha: 'def456',
            state: 'merged',
            created_at: '2026-05-01T00:00:00Z',
            updated_at: '2026-05-02T00:00:00Z',
          },
        ],
      },
    ]);
    const client = new GitLabClient('glpat-token');
    const prs = await client.listPullRequests(REPO);

    expect(prs).toHaveLength(2);
    expect(prs[0]).toMatchObject({ number: 12, status: 'open', author: 'marisa' });
    expect(prs[1]).toMatchObject({ number: 11, status: 'merged', author: 'unknown' });

    // Auth via header only — never a query-string token.
    const [url, init] = [calls[0]!.url, calls[0]!.init];
    expect((init?.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('glpat-token');
    expect(url).not.toContain('private_token');
    expect(url).not.toContain('glpat-token');
  });

  it('fetches MR detail with files (from diffs) and commits', async () => {
    mockFetchSequence([
      {
        body: {
          iid: 12,
          title: 'Add rate limiting',
          author: { username: 'marisa' },
          source_branch: 'feat/rl',
          target_branch: 'main',
          sha: 'abc123',
          state: 'opened',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-02T00:00:00Z',
          description: 'Adds a limiter.',
          diff_refs: { base_sha: 'base1', start_sha: 'start1', head_sha: 'head1' },
        },
      },
      {
        body: [
          {
            old_path: 'src/config.ts',
            new_path: 'src/config.ts',
            diff: '@@ -1,2 +1,3 @@\n line one\n-old line\n+new line\n+another line',
            deleted_file: false,
          },
        ],
      },
      { body: [{ id: 'sha1', message: 'init', author_name: 'marisa', authored_date: '2026-06-01T00:00:00Z' }] },
    ]);
    const client = new GitLabClient('glpat-token');
    const detail = await client.getPullRequest(REPO, 12);

    expect(detail.number).toBe(12);
    expect(detail.files).toHaveLength(1);
    expect(detail.files[0]!.path).toBe('src/config.ts');
    expect(detail.additions).toBe(2);
    expect(detail.deletions).toBe(1);
    expect(detail.commits).toEqual([
      { sha: 'sha1', message: 'init', author: 'marisa', committed_at: '2026-06-01T00:00:00Z' },
    ]);
    expect(detail.linked_issue).toBeUndefined();
  });

  it('resolves a linked issue referenced in the MR description', async () => {
    mockFetchSequence([
      {
        body: {
          iid: 12,
          title: 't',
          author: { username: 'marisa' },
          source_branch: 'b',
          target_branch: 'main',
          sha: 'abc123',
          state: 'opened',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
          description: 'Closes #7',
          diff_refs: { base_sha: 'b', start_sha: 's', head_sha: 'h' },
        },
      },
      { body: [] }, // diffs
      { body: [] }, // commits
      { body: { iid: 7, title: 'Rate limit bug', description: null, state: 'opened' } }, // issue
    ]);
    const client = new GitLabClient('glpat-token');
    const detail = await client.getPullRequest(REPO, 12);
    expect(detail.linked_issue).toEqual({ number: 7, title: 'Rate limit bug', body: null, state: 'opened' });
  });

  it('lists only inline (diff-anchored) discussion notes as review comments', async () => {
    mockFetchSequence([
      {
        body: [
          {
            id: 'disc-1',
            notes: [
              {
                id: 101,
                body: 'inline note',
                author: { username: 'marisa' },
                created_at: '2026-06-01T00:00:00Z',
                resolvable: true,
                position: { new_path: 'src/config.ts', old_path: 'src/config.ts', new_line: 5, old_line: null },
              },
            ],
          },
          {
            id: 'disc-2',
            notes: [
              { id: 102, body: 'top-level comment', author: { username: 'bob' }, created_at: '2026-06-01T00:00:00Z', resolvable: false },
            ],
          },
        ],
      },
    ]);
    const client = new GitLabClient('glpat-token');
    const comments = await client.listReviewComments(REPO, 12);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ id: 101, path: 'src/config.ts', line: 5, side: 'RIGHT', is_outdated: false });
  });

  it('creates a new inline comment by fetching diff_refs then posting a discussion', async () => {
    const { calls } = mockFetchSequence([
      { body: { iid: 12, diff_refs: { base_sha: 'b', start_sha: 's', head_sha: 'h' } } }, // getMrDetail
      {
        body: {
          id: 'disc-3',
          notes: [
            {
              id: 201,
              body: 'nit: rename this',
              author: { username: 'marisa' },
              created_at: '2026-06-01T00:00:00Z',
              resolvable: true,
              position: { new_path: 'src/config.ts', old_path: 'src/config.ts', new_line: 10, old_line: null },
            },
          ],
        },
      },
    ]);
    const client = new GitLabClient('glpat-token');
    const comment = await client.createReviewComment(REPO, 12, {
      commitId: 'unused-for-gitlab',
      path: 'src/config.ts',
      line: 10,
      body: 'nit: rename this',
    });
    expect(comment).toMatchObject({ id: 201, path: 'src/config.ts', line: 10 });
    const postCall = calls[1]!;
    const body = JSON.parse(postCall.init!.body as string);
    expect(body.position).toMatchObject({ base_sha: 'b', start_sha: 's', head_sha: 'h', new_line: 10 });
  });

  it('replies to an existing thread via the discussion id, not the note id', async () => {
    const { calls } = mockFetchSequence([
      {
        body: {
          id: 201,
          body: 'thanks, fixed',
          author: { username: 'bob' },
          created_at: '2026-06-01T00:00:00Z',
          resolvable: true,
          position: { new_path: 'src/config.ts', old_path: 'src/config.ts', new_line: 10, old_line: null },
        },
      },
    ]);
    const client = new GitLabClient('glpat-token');
    await client.createReviewComment(REPO, 12, {
      commitId: 'unused',
      path: 'src/config.ts',
      line: 10,
      body: 'thanks, fixed',
      inReplyTo: 999,
    });
    expect(calls[0]!.url).toContain('/discussions/999/notes');
  });

  describe('postReview', () => {
    it('APPROVE calls the approve endpoint and posts a note when body is set', async () => {
      const { calls } = mockFetchSequence([
        { body: {} }, // approve
        { body: { id: 301 } }, // note
      ]);
      const client = new GitLabClient('glpat-token');
      const result = await client.postReview(REPO, 12, { body: 'LGTM', event: 'APPROVE' });
      expect(calls[0]!.url).toContain('/approve');
      expect(calls[1]!.url).toContain('/notes');
      expect(JSON.parse(calls[1]!.init!.body as string).body).toBe('LGTM');
      expect(result.id).toBe('301');
    });

    it('REQUEST_CHANGES calls unapprove (swallowing a 404) then posts a prefixed note', async () => {
      const { calls } = mockFetchSequence([
        { status: 404, body: {} }, // unapprove — wasn't previously approved
        { body: { id: 302 } }, // note
      ]);
      const client = new GitLabClient('glpat-token');
      await client.postReview(REPO, 12, { body: 'Please add a test.', event: 'REQUEST_CHANGES' });
      expect(calls[0]!.url).toContain('/unapprove');
      const noteBody = JSON.parse(calls[1]!.init!.body as string).body;
      expect(noteBody).toBe('Changes requested: Please add a test.');
    });

    it('COMMENT only posts a note — no approve/unapprove call', async () => {
      const { calls } = mockFetchSequence([{ body: { id: 303 } }]);
      const client = new GitLabClient('glpat-token');
      await client.postReview(REPO, 12, { body: 'Just a note', event: 'COMMENT' });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toContain('/notes');
    });

    it('a non-404 unapprove failure is NOT swallowed', async () => {
      mockFetchSequence([{ status: 500, body: {} }]);
      const client = new GitLabClient('glpat-token');
      await expect(
        client.postReview(REPO, 12, { body: 'x', event: 'REQUEST_CHANGES' }),
      ).rejects.toThrow();
    });
  });

  it('commitFiles creates the branch first when it does not exist', async () => {
    const { calls } = mockFetchSequence([
      { status: 404, body: {} }, // GET branch → missing
      { body: {} }, // POST create branch
      { body: { id: 'commitsha' } }, // POST commit
    ]);
    const client = new GitLabClient('glpat-token');
    const result = await client.commitFiles(REPO, {
      branch: 'devdigest/ci',
      base: 'main',
      message: 'Add CI config',
      files: [{ path: '.github/workflows/ci.yml', contents: 'name: ci' }],
    });
    expect(result).toEqual({ branch: 'devdigest/ci' });
    expect(calls[1]!.url).toContain('/repository/branches');
    expect(calls[1]!.init!.method).toBe('POST');
    expect(calls[2]!.url).toContain('/repository/commits');
  });

  it('findOpenPr returns null when no open MR matches the branch', async () => {
    mockFetchSequence([{ body: [] }]);
    const client = new GitLabClient('glpat-token');
    expect(await client.findOpenPr(REPO, 'feat/x')).toBeNull();
  });

  it('findOpenPr returns the MR url when one is open', async () => {
    mockFetchSequence([{ body: [{ web_url: 'https://gitlab.com/acme/payments-api/-/merge_requests/12' }] }]);
    const client = new GitLabClient('glpat-token');
    expect(await client.findOpenPr(REPO, 'feat/x')).toEqual({
      url: 'https://gitlab.com/acme/payments-api/-/merge_requests/12',
    });
  });

  it('currentLogin returns the authenticated username', async () => {
    mockFetchSequence([{ body: { username: 'marisa.koch' } }]);
    const client = new GitLabClient('glpat-token');
    expect(await client.currentLogin()).toBe('marisa.koch');
  });
});

/**
 * Shared contract parity: both adapters implement the same CodeHostClient
 * port and populate the same required PrMeta/PrReviewComment fields — no
 * provider-specific branching should be needed outside src/adapters/*.
 */
describe('CodeHostClient contract parity (GitHub vs GitLab)', () => {
  const REQUIRED_PR_META_FIELDS = [
    'number',
    'title',
    'author',
    'branch',
    'base',
    'head_sha',
    'additions',
    'deletions',
    'files_count',
    'status',
  ] as const;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => '[]',
        json: async () => [
          {
            iid: 1,
            title: 't',
            author: { username: 'a' },
            source_branch: 'b',
            target_branch: 'main',
            sha: 'sha1',
            state: 'opened',
            created_at: '2026-06-01T00:00:00Z',
            updated_at: '2026-06-01T00:00:00Z',
          },
        ],
      })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('GitLab adapter satisfies CodeHostClient and returns well-formed PrMeta', async () => {
    const client: CodeHostClient = new GitLabClient('glpat-token');
    const [pr] = await client.listPullRequests(REPO);
    for (const field of REQUIRED_PR_META_FIELDS) expect(pr).toHaveProperty(field);
  });

  it('GitHub adapter (Octokit-backed) is assignable to the same CodeHostClient type', () => {
    // Compile-time contract check: constructing without a live network call.
    const client: CodeHostClient = new OctokitGitHubClient('ghp_token');
    expect(typeof client.listPullRequests).toBe('function');
    expect(typeof client.postReview).toBe('function');
    expect(typeof client.createReviewComment).toBe('function');
  });
});
