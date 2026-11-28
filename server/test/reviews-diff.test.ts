/**
 * The review diff is complete or says it is not (BE-11, XC-12), against
 * in-memory ports: the fallback and patchless files are logged, an empty diff
 * fails the run before any model call, listFiles paginates with a cap, and the
 * git adapter refuses flag-like refs.
 */
import { describe, it, expect } from 'vitest';
import type { Agent, LLMProvider, StructuredRequest } from '@devdigest/shared';
import { loadDiff } from '../src/modules/reviews/diff-loader.js';
import { ReviewService } from '../src/modules/reviews/service.js';
import type { ReviewPull, ReviewStore } from '../src/modules/reviews/ports.js';
import { RunBus } from '../src/platform/sse.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { OctokitGitHubClient, MAX_FILE_PAGES } from '../src/adapters/github/octokit.js';
import { SimpleGitClient, UnsafeRefError } from '../src/adapters/git/simple-git.js';

const pull: ReviewPull = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 7,
  title: 't',
  author: 'octocat',
  base: 'main',
  headSha: 'abc123',
  body: null,
};
const repo = { owner: 'acme', name: 'widgets' };
const PATCH = '@@ -0,0 +1,1 @@\n+const a = 1;';

function loaderDeps(opts: { git: () => Promise<unknown>; files: { path: string; patch: string | null }[] }) {
  return {
    git: { diff: opts.git } as never,
    pulls: { filesAndCommits: async () => ({ files: opts.files }) } as never,
    parseDiff: parseUnifiedDiff,
  };
}

describe('loadDiff', () => {
  it('logs the fallback to stored files and counts files without a patch', async () => {
    const notes: string[] = [];
    const deps = loaderDeps({
      git: async () => {
        throw new Error('no clone');
      },
      files: [
        { path: 'a.ts', patch: PATCH },
        { path: 'logo.png', patch: null },
      ],
    });

    const loaded = await loadDiff(deps, pull, repo, { info: (m) => notes.push(m) });

    expect(loaded.diff.files.map((f) => f.path)).toEqual(['a.ts']);
    expect(loaded.skippedFiles).toBe(1);
    expect(notes.some((n) => n.includes('falling back') && n.includes('no clone'))).toBe(true);
    expect(notes.some((n) => n.includes('1 file(s) have no patch'))).toBe(true);
  });

  it('uses the git diff silently when it has files', async () => {
    const notes: string[] = [];
    const diff = parseUnifiedDiff(`diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n${PATCH}\n`);
    const loaded = await loadDiff(loaderDeps({ git: async () => diff, files: [] }), pull, repo, {
      info: (m) => notes.push(m),
    });
    expect(loaded.skippedFiles).toBe(0);
    expect(notes).toEqual([]);
  });
});

describe('ReviewService with an empty diff', () => {
  it('fails the run with a clear error, makes no model call and does not mark the head reviewed', async () => {
    const agent = { id: 'agent-1', name: 'Sec', provider: 'openai', model: 'm', repo_intel: false } as Agent;
    const completed: { status: string; error: string | null }[] = [];
    const marked: string[] = [];
    const requests: StructuredRequest<unknown>[] = [];
    const store = {
      createAgentRun: async () => 'run-1',
      activeRunsForPull: async () => [],
      completeAgentRun: async (_id: string, r: { status: string; error: string | null }) => {
        completed.push(r);
      },
      saveRunTrace: async () => undefined,
    } as unknown as ReviewStore;
    const llm = {
      id: 'openai',
      completeStructured: async (req: StructuredRequest<unknown>) => {
        requests.push(req);
        throw new Error('must not be called');
      },
    } as unknown as LLMProvider;
    const service = new ReviewService({
      store,
      pulls: {
        getById: async () => pull,
        filesAndCommits: async () => ({ files: [] }),
        markReviewed: async (id: string) => {
          marked.push(id);
        },
      },
      repos: { getById: async () => repo },
      agents: { listEnabled: async () => [agent], getById: async () => agent },
      llm: async () => llm,
      git: { diff: async () => parseUnifiedDiff('') },
      parseDiff: parseUnifiedDiff,
      repoIntel: {} as never,
      events: new RunBus(),
      skills: { effectiveSkills: async () => [] },
      tokens: { count: (s: string) => Math.ceil(s.length / 4) },
    });

    await service.runReview('ws-1', pull.id, [agent]);
    for (let i = 0; i < 50 && completed.length === 0; i++) await new Promise((r) => setTimeout(r, 5));

    expect(completed).toHaveLength(1);
    expect(completed[0]!.status).toBe('failed');
    expect(completed[0]!.error).toMatch(/diff is empty/);
    expect(requests).toHaveLength(0);
    expect(marked).toEqual([]);
  });
});

describe('OctokitGitHubClient.getPullRequest', () => {
  function fakeClient(pageCount: number) {
    const client = new OctokitGitHubClient('t');
    const requested: number[] = [];
    const file = (i: number) => ({ filename: `f${i}.ts`, additions: 1, deletions: 0, patch: PATCH });
    (client as unknown as { octokit: unknown }).octokit = {
      rest: {
        pulls: {
          get: async () => ({
            data: {
              number: 7,
              title: 't',
              user: { login: 'u' },
              head: { ref: 'b', sha: 's' },
              base: { ref: 'main' },
              state: 'open',
              body: '',
              created_at: 'x',
              updated_at: 'x',
            },
          }),
          listFiles: 'listFiles',
          listCommits: async () => ({ data: [] }),
        },
      },
      // Mirrors Octokit's contract: the map callback gets each page and `done`.
      paginate: async (_route: unknown, _params: unknown, map: (r: { data: unknown[] }, done: () => void) => unknown[]) => {
        const out: unknown[] = [];
        let stopped = false;
        for (let page = 1; page <= pageCount && !stopped; page++) {
          requested.push(page);
          out.push(...map({ data: [file(page)] }, () => (stopped = true)));
        }
        return out;
      },
    };
    return { client, requested };
  }

  it('collects every page of files', async () => {
    const { client, requested } = fakeClient(3);
    const pr = await client.getPullRequest(repo, 7);
    expect(pr.files.map((f) => f.path)).toEqual(['f1.ts', 'f2.ts', 'f3.ts']);
    expect(requested).toEqual([1, 2, 3]);
  });

  it('stops at the page cap', async () => {
    const { client, requested } = fakeClient(MAX_FILE_PAGES + 10);
    await client.getPullRequest(repo, 7);
    expect(requested).toHaveLength(MAX_FILE_PAGES);
  });
});

describe('SimpleGitClient ref guard', () => {
  const client = () => new SimpleGitClient('/tmp/dd-clones-never-created');

  it('rejects a flag-like ref in diff and sync before running git', async () => {
    await expect(client().diff(repo, '--output=/tmp/x', 'abc')).rejects.toThrow(UnsafeRefError);
    await expect(client().diff(repo, 'main', '-p')).rejects.toThrow(UnsafeRefError);
    await expect(client().sync(repo, '--upload-pack=evil')).rejects.toThrow(UnsafeRefError);
  });
});
