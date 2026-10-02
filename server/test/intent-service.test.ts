import { describe, it, expect } from 'vitest';
import type { GitHubClient, IssueMeta, RepoRef } from '@devdigest/shared';
import { IntentService } from '../src/modules/intent/service.js';
import type { SaveIntentInput } from '../src/modules/intent/repository.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * Hermetic service test (no DB, no network) for the scope-based intent
 * classifier (specs/05-intent-layer.md revision 2) — same
 * fake-repository-instead-of-testcontainer shape as
 * `conventions-service.test.ts`, since `IntentService` takes narrow function
 * ports, not `Container` (onion-architecture's no-container-in-services rule).
 */
class FakeIntentRepository {
  saved: { prId: string; input: SaveIntentInput }[] = [];
  commitMessages: string[] = [];

  async getCommitMessages(_prId: string): Promise<string[]> {
    return this.commitMessages;
  }

  async saveIntent(prId: string, input: SaveIntentInput): Promise<void> {
    this.saved.push({ prId, input });
  }
}

const EXTRACTION_FIXTURE = {
  summary: 'Adds rate limiting to the public API endpoints.',
  in_scope: ['Rate limiter middleware on /api routes'],
  out_of_scope: ['Authentication changes'],
};

const DIFF_FILES = [
  {
    path: 'src/config.ts',
    hunks: [{ oldStart: 10, oldLines: 3, newStart: 10, newLines: 4 }],
  },
];

function githubResolver(client: GitHubClient) {
  return async () => client;
}

function makeService(opts: {
  llm: MockLLMProvider;
  repo: FakeIntentRepository;
  github?: GitHubClient;
  readClone?: (clonePath: string, path: string) => Promise<string | null>;
}) {
  const github: GitHubClient =
    opts.github ??
    ({
      getIssue: async (_repo: RepoRef, n: number): Promise<IssueMeta> => ({
        number: n,
        title: `Issue #${n}`,
        body: 'Fix the thing',
        state: 'open',
      }),
    } as unknown as GitHubClient);

  return new IntentService(
    opts.repo as never,
    async () => ({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' }),
    async () => opts.llm,
    githubResolver(github),
    opts.readClone ?? (async () => null),
  );
}

describe('IntentService.resolve — full-signal PR', () => {
  it('returns in_scope/out_of_scope, no context gaps, and persists the cache row', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { IntentExtraction: EXTRACTION_FIXTURE },
    });
    const repo = new FakeIntentRepository();
    repo.commitMessages = ['fix: add rate limiter'];
    const service = makeService({ llm, repo });

    const signals: string[] = [];
    const result = await service.resolve({
      workspaceId: 'ws-1',
      pull: {
        id: 'pr-1',
        title: 'Add rate limiting',
        body: 'Adds rate limiting to the public API endpoints. Closes #471.',
      },
      repo: { owner: 'acme', name: 'api', clonePath: '/clones/acme/api' },
      diffFiles: DIFF_FILES,
      onSignal: (m) => signals.push(m),
    });

    expect(result.summary).toBe(EXTRACTION_FIXTURE.summary);
    expect(result.inScope).toEqual(EXTRACTION_FIXTURE.in_scope);
    expect(result.outOfScope).toEqual(EXTRACTION_FIXTURE.out_of_scope);
    expect(result.contextGaps).toEqual([]);
    expect(result.rendered).toContain('Summary:');
    expect(result.rendered).not.toContain('Confidence');
    expect(result.provider).toBe('openrouter');
    expect(result.model).toBe('deepseek/deepseek-v4-flash');
    expect(result.userMessageText?.length).toBeGreaterThan(0);

    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0]!.input.inScope).toEqual(EXTRACTION_FIXTURE.in_scope);
    expect(repo.saved[0]!.input.outOfScope).toEqual(EXTRACTION_FIXTURE.out_of_scope);
    expect(repo.saved[0]!.input.contextGaps).toEqual([]);

    expect(signals.some((s) => s.includes('linked issue #471 found'))).toBe(true);
  });

  it("threads the diff's hunk headers into the prompt with no hunk line content", async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { IntentExtraction: EXTRACTION_FIXTURE },
    });
    const repo = new FakeIntentRepository();
    const service = makeService({ llm, repo });

    await service.resolve({
      workspaceId: 'ws-1',
      pull: { id: 'pr-1', title: 'Add rate limiting', body: 'Adds rate limiting.' },
      repo: { owner: 'acme', name: 'api', clonePath: null },
      diffFiles: DIFF_FILES,
    });

    const call = llm.calls.find((c) => c.method === 'completeStructured');
    expect(call).toBeDefined();
    const req = call!.req as { messages: { role: string; content: string }[] };
    const userMessage = req.messages.find((m) => m.role === 'user')!.content;
    expect(userMessage).toContain('## Changed files');
    expect(userMessage).toContain('src/config.ts');
    expect(userMessage).toContain('@@ -10,3 +10,4 @@');
    // No hunk line CONTENT is ever passed — diffFiles only carries path + header
    // numbers, never the added/removed source lines themselves.
    expect(userMessage).not.toContain('stripeKey');
  });
});

describe('IntentService.resolve — empty-body / indirect-only PR', () => {
  it('records a context gap for the empty body, never fabricates confidence/certainty', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        IntentExtraction: { summary: 'Unclear from available signals.', in_scope: [], out_of_scope: [] },
      },
    });
    const repo = new FakeIntentRepository();
    repo.commitMessages = ['wip'];
    const service = makeService({ llm, repo });

    const signals: string[] = [];
    const result = await service.resolve({
      workspaceId: 'ws-1',
      pull: { id: 'pr-1', title: 'wip', body: '' },
      repo: { owner: 'acme', name: 'api', clonePath: null },
      diffFiles: [],
      onSignal: (m) => signals.push(m),
    });

    expect(result.contextGaps).toEqual(['PR description is empty or near-empty']);
    expect(signals.some((s) => s.includes('PR description is empty or near-empty'))).toBe(true);
    expect(repo.saved[0]!.input.contextGaps).toEqual(['PR description is empty or near-empty']);
  });
});

describe('IntentService.resolve — GitHub unavailable', () => {
  it('degrades (issue unresolved) instead of throwing, and still returns a result', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { IntentExtraction: EXTRACTION_FIXTURE },
    });
    const repo = new FakeIntentRepository();
    const throwingGithub: GitHubClient = {
      getIssue: async () => {
        throw new Error('GitHub unavailable');
      },
    } as unknown as GitHubClient;
    const service = makeService({ llm, repo, github: throwingGithub });

    const signals: string[] = [];
    const result = await service.resolve({
      workspaceId: 'ws-1',
      pull: {
        id: 'pr-1',
        title: 'Add rate limiting',
        body: 'Fixes #471, adds a rate limiter to the public API endpoints.',
      },
      repo: { owner: 'acme', name: 'api', clonePath: null },
      diffFiles: [],
      onSignal: (m) => signals.push(m),
    });

    expect(result.summary).toBe(EXTRACTION_FIXTURE.summary);
    expect(result.contextGaps).toEqual(['referenced issue #471 could not be resolved']);
    expect(signals.some((s) => s.includes('referenced issue #471 not found'))).toBe(true);
  });

  it('a total resolution failure (LLM call throws) degrades to signals: [] instead of throwing', async () => {
    const throwingLlm = new MockLLMProvider('openai', {
      // No fixture matches 'IntentExtraction' schemaName's required shape,
      // so MockLLMProvider's own safeParse throws — exercising the outer
      // try/catch in IntentService.resolve.
      structuredBySchema: { IntentExtraction: { not: 'the right shape' } },
    });
    const repo = new FakeIntentRepository();
    const service = makeService({ llm: throwingLlm, repo });

    const result = await service.resolve({
      workspaceId: 'ws-1',
      pull: { id: 'pr-1', title: 'x', body: 'y' },
      repo: { owner: 'acme', name: 'api', clonePath: null },
      diffFiles: [],
    });

    expect(result).toEqual({ signals: [] });
    expect(repo.saved).toHaveLength(0);
  });
});
