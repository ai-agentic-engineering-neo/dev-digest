/**
 * OctokitGitHubClient.getPullRequest — files/commits are paged (a single
 * per_page=100 call silently truncated big PRs) and capped at GitHub's limits,
 * with a warning when the file list is capped. No network: the Octokit REST
 * methods are stubbed.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  OctokitGitHubClient,
  MAX_PR_FILES,
  mergeSamePath,
  type GitHubClientLogger,
} from '../src/adapters/github/octokit.js';

function pageOf<T>(all: T[], page: number, perPage: number): T[] {
  return all.slice((page - 1) * perPage, page * perPage);
}

function makeClient(opts: { files: number; commits: number; changedFiles?: number }) {
  const log: GitHubClientLogger = { warn: vi.fn() };
  const client = new OctokitGitHubClient('test-token', log);
  const files = Array.from({ length: opts.files }, (_, i) => ({
    filename: `f${i}.ts`,
    additions: 1,
    deletions: 0,
    patch: '@@',
  }));
  const commits = Array.from({ length: opts.commits }, (_, i) => ({
    sha: `sha${i}`,
    commit: { message: `m${i}`, author: { name: 'a', date: null } },
    author: null,
  }));
  const listFiles = vi.fn(async (p: { page: number; per_page: number }) => ({
    data: pageOf(files, p.page, p.per_page),
  }));
  const listCommits = vi.fn(async (p: { page: number; per_page: number }) => ({
    data: pageOf(commits, p.page, p.per_page),
  }));
  const pulls = {
    get: async () => ({
      data: {
        number: 7,
        title: 't',
        user: { login: 'u' },
        head: { ref: 'h', sha: 'abc' },
        base: { ref: 'main' },
        additions: 1,
        deletions: 0,
        changed_files: opts.changedFiles ?? opts.files,
        state: 'open',
        merged_at: null,
        created_at: null,
        updated_at: null,
        body: null,
      },
    }),
    listFiles,
    listCommits,
  };
  (client as unknown as { octokit: { rest: { pulls: unknown } } }).octokit = { rest: { pulls } };
  return { client, log, listFiles, listCommits };
}

const repo = { owner: 'o', name: 'r' };

describe('OctokitGitHubClient.getPullRequest pagination', () => {
  it('returns every file and commit across pages (no silent 100 cap)', async () => {
    const { client, log, listFiles } = makeClient({ files: 250, commits: 120 });
    const detail = await client.getPullRequest(repo, 7);
    expect(detail.files).toHaveLength(250);
    expect(detail.files[249]!.path).toBe('f249.ts');
    expect(detail.commits).toHaveLength(120);
    expect(listFiles).toHaveBeenCalledTimes(3);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('stops after one short page', async () => {
    const { client, listFiles } = makeClient({ files: 3, commits: 1 });
    const detail = await client.getPullRequest(repo, 7);
    expect(detail.files.map((f) => f.path)).toEqual(['f0.ts', 'f1.ts', 'f2.ts']);
    expect(listFiles).toHaveBeenCalledTimes(1);
  });

  it(`caps the file list at ${MAX_PR_FILES} and logs a warning`, async () => {
    const { client, log } = makeClient({ files: MAX_PR_FILES + 150, commits: 1, changedFiles: 3500 });
    const detail = await client.getPullRequest(repo, 7);
    expect(detail.files).toHaveLength(MAX_PR_FILES);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.warn).mock.calls[0]![0]).toMatchObject({
      changedFiles: 3500,
      fetched: MAX_PR_FILES,
    });
  });
});

describe('mergeSamePath (file ↔ symlink type change)', () => {
  it('folds the removed + added entries GitHub returns for one path into one file', () => {
    const merged = mergeSamePath([
      { path: 'a.ts', additions: 2, deletions: 1, patch: '@@ a' },
      { path: 'CLAUDE.md', additions: 0, deletions: 51, patch: '@@ -1,51 +0,0 @@' },
      { path: 'CLAUDE.md', additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@' },
      { path: 'b.bin', additions: 0, deletions: 0, patch: undefined },
      { path: 'b.bin', additions: 0, deletions: 0, patch: undefined },
    ]);
    expect(merged).toEqual([
      { path: 'a.ts', additions: 2, deletions: 1, patch: '@@ a' },
      { path: 'CLAUDE.md', additions: 1, deletions: 51, patch: '@@ -1,51 +0,0 @@\n@@ -0,0 +1 @@' },
      { path: 'b.bin', additions: 0, deletions: 0, patch: undefined },
    ]);
  });

  it('getPullRequest returns unique paths', async () => {
    const { client, listFiles } = makeClient({ files: 2, commits: 1, changedFiles: 1 });
    listFiles.mockResolvedValueOnce({
      data: [
        { filename: 'CLAUDE.md', additions: 0, deletions: 3, patch: '@@ -1,3 +0,0 @@' },
        { filename: 'CLAUDE.md', additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@' },
      ],
    });
    const detail = await client.getPullRequest(repo, 7);
    expect(detail.files).toEqual([
      { path: 'CLAUDE.md', additions: 1, deletions: 3, patch: '@@ -1,3 +0,0 @@\n@@ -0,0 +1 @@' },
    ]);
  });
});
