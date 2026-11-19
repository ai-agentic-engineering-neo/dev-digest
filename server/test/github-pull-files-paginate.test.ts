import { describe, expect, it, vi } from 'vitest';
import { OctokitGitHubClient } from '../src/adapters/github/octokit.js';

/** AC-35: >100 files must be fetched across pages via octokit.paginate, in order, with status/rename/base.sha mapped. */
describe('OctokitGitHubClient.getPullRequest — files pagination', () => {
  it('merges all pages in order and maps status, previous_filename, base.sha', async () => {
    const listFiles = vi.fn();
    const page1 = Array.from({ length: 100 }, (_, i) => ({ filename: `f${i}.ts`, additions: 1, deletions: 0, patch: '@@', status: 'modified' }));
    const page2 = [
      { filename: 'new.ts', previous_filename: 'old.ts', additions: 2, deletions: 1, patch: '@@', status: 'renamed' },
      { filename: 'f101.ts', additions: 0, deletions: 3, status: 'removed' },
    ];
    const paginate = vi.fn(async (_fn: unknown, _params: unknown) => [...page1, ...page2]);
    const client = new OctokitGitHubClient('tok');
    (client as unknown as { octokit: unknown }).octokit = {
      paginate,
      rest: {
        pulls: {
          listFiles,
          get: async () => ({
            data: {
              number: 5, title: 't', body: null, user: { login: 'u' }, head: { ref: 'b', sha: 'h1' }, base: { ref: 'main', sha: 'b1' },
              additions: 1, deletions: 1, changed_files: 102, state: 'open', merged_at: null,
              created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
            },
          }),
          listCommits: async () => ({ data: [] }),
        },
      },
    };

    const detail = await client.getPullRequest({ owner: 'o', name: 'r' }, 5);

    expect(paginate).toHaveBeenCalledWith(listFiles, { owner: 'o', repo: 'r', pull_number: 5, per_page: 100 });
    expect(detail.files).toHaveLength(102);
    expect(detail.files[0]!.path).toBe('f0.ts');
    expect(detail.files[99]!.path).toBe('f99.ts');
    expect(detail.files[100]).toMatchObject({ path: 'new.ts', status: 'renamed', previous_filename: 'old.ts' });
    expect(detail.files[101]).toMatchObject({ path: 'f101.ts', status: 'removed', previous_filename: null });
    expect(detail.base_sha).toBe('b1');
    expect(detail.head_sha).toBe('h1');
  });
});
