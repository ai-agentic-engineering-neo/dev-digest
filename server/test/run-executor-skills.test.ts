import { describe, it, expect, vi } from 'vitest';
import type { RunTrace } from '@devdigest/shared';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import { RunBus } from '../src/platform/sse.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * Skills wiring in a live review run (no DB, no network): linked AND enabled
 * skills reach the assembled prompt (in `order`) and are recorded against the
 * run; disabled / unlinked skills do not.
 */

const DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 export {};`;

const APPROVE = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

type SkillFixture = { id: string; name: string; body: string; enabled: boolean; order: number };

function skill(over: Partial<SkillFixture> & { id: string }): SkillFixture {
  return { name: over.id, body: `BODY-${over.id}`, enabled: true, order: 0, ...over };
}

async function runWith(linked: SkillFixture[]) {
  const llm = new MockLLMProvider('openai', { structured: APPROVE });
  const runBus = new RunBus();
  const container = {
    runBus,
    llm: async () => llm,
    git: new MockGitClient({ diff: DIFF }),
    repoIntel: {
      getCallerSignatures: async () => [],
      getRepoMap: async () => ({ degraded: true, text: '', tokens: 0, cached: false }),
      getFileRank: async () => [],
    },
  };
  const traces: RunTrace[] = [];
  const repo = {
    getPrFiles: async () => [],
    insertReview: vi.fn(async () => ({ id: 'review-1' })),
    insertFindings: vi.fn(async () => []),
    markReviewed: vi.fn(async () => undefined),
    completeAgentRun: vi.fn(async () => undefined),
    recordRunSkills: vi.fn(async () => undefined),
    saveRunTrace: vi.fn(async (_id: string, trace: RunTrace) => {
      traces.push(trace);
    }),
  };
  // Mirrors AgentsRepository.linkedSkills: rows come back ordered by `order`.
  const agents = {
    linkedSkills: vi.fn(async () =>
      [...linked]
        .sort((a, b) => a.order - b.order)
        .map(({ order, ...rest }) => ({ skill: rest, order })),
    ),
  };

  const executor = new ReviewRunExecutor(container as never, repo as never, agents as never);
  const pull = {
    id: 'pr-1',
    repoId: 'repo-1',
    number: 7,
    title: 'Add b',
    author: 'dev',
    body: null,
    base: 'main',
    headSha: 'abc123',
  };
  const agent = {
    id: 'agent-1',
    name: 'Test Quality Reviewer',
    provider: 'openai',
    model: 'gpt-4.1',
    systemPrompt: 'You review tests.',
    strategy: 'single-pass',
    ciFailOn: 'critical',
    repoIntel: false,
    version: 1,
  };
  await executor.executeRuns(
    'ws-1',
    pull as never,
    { owner: 'acme', name: 'api' } as never,
    [{ agent: agent as never, runId: 'run-1' }],
  );

  const userMessage = (llm.calls.find((c) => c.method === 'completeStructured')!.req as {
    messages: { role: string; content: string }[];
  }).messages[1]!.content;
  return { userMessage, repo, agents, trace: traces[0]! };
}

describe('run-executor: linked skills', () => {
  it('passes linked+enabled skill bodies into the prompt and records them on the run', async () => {
    const { userMessage, repo, trace } = await runWith([skill({ id: 's1', body: 'CHECK-COVERAGE' })]);

    expect(userMessage).toContain('## Skills / rules');
    expect(userMessage).toContain('CHECK-COVERAGE');
    expect(repo.recordRunSkills).toHaveBeenCalledWith('run-1', ['s1']);
    // ...and flows end-to-end into the persisted trace's prompt assembly.
    expect(trace.prompt_assembly.skills).toContain('CHECK-COVERAGE');
  });

  it('follows the link order when several skills are active', async () => {
    const { userMessage, repo } = await runWith([
      skill({ id: 'late', body: 'SECOND-BODY', order: 1 }),
      skill({ id: 'early', body: 'FIRST-BODY', order: 0 }),
    ]);

    expect(userMessage.indexOf('FIRST-BODY')).toBeGreaterThan(-1);
    expect(userMessage.indexOf('FIRST-BODY')).toBeLessThan(userMessage.indexOf('SECOND-BODY'));
    expect(repo.recordRunSkills).toHaveBeenCalledWith('run-1', ['early', 'late']);
  });

  it('skips a linked skill that is globally disabled', async () => {
    const { userMessage, repo } = await runWith([
      skill({ id: 'on', body: 'ENABLED-BODY', order: 0 }),
      skill({ id: 'off', body: 'DISABLED-BODY', order: 1, enabled: false }),
    ]);

    expect(userMessage).toContain('ENABLED-BODY');
    expect(userMessage).not.toContain('DISABLED-BODY');
    expect(repo.recordRunSkills).toHaveBeenCalledWith('run-1', ['on']);
  });

  it('omits the Skills section and records nothing when the agent has no active skills', async () => {
    const none = await runWith([]);
    expect(none.userMessage).not.toContain('## Skills / rules');
    expect(none.repo.recordRunSkills).toHaveBeenCalledWith('run-1', []);
    expect(none.trace.prompt_assembly.skills).toBeNull();

    const allOff = await runWith([skill({ id: 'off', body: 'OFF-BODY', enabled: false })]);
    expect(allOff.userMessage).not.toContain('## Skills / rules');
    expect(allOff.userMessage).not.toContain('OFF-BODY');
    expect(allOff.repo.recordRunSkills).toHaveBeenCalledWith('run-1', []);
  });

  it('does not record skills for a run that did not complete', async () => {
    const llm = new MockLLMProvider('openai', { structured: { nonsense: true } });
    const runBus = new RunBus();
    const repo = {
      getPrFiles: async () => [],
      completeAgentRun: vi.fn(async () => undefined),
      recordRunSkills: vi.fn(async () => undefined),
      saveRunTrace: vi.fn(async () => undefined),
    };
    const agents = {
      linkedSkills: vi.fn(async () => [{ skill: skill({ id: 's1' }), order: 0 }]),
    };
    const executor = new ReviewRunExecutor(
      {
        runBus,
        llm: async () => llm,
        git: new MockGitClient({ diff: DIFF }),
        repoIntel: {},
      } as never,
      repo as never,
      agents as never,
    );
    await executor.executeRuns(
      'ws-1',
      { id: 'pr-1', repoId: 'r', number: 1, title: 't', author: 'a', body: null, base: 'main', headSha: 'x' } as never,
      { owner: 'acme', name: 'api' } as never,
      [
        {
          agent: {
            id: 'agent-1',
            name: 'A',
            provider: 'openai',
            model: 'm',
            systemPrompt: 's',
            strategy: 'single-pass',
            ciFailOn: 'critical',
            repoIntel: false,
            version: 1,
          } as never,
          runId: 'run-x',
        },
      ],
    );

    expect(repo.completeAgentRun).toHaveBeenCalledWith('run-x', expect.objectContaining({ status: 'failed' }));
    expect(repo.recordRunSkills).not.toHaveBeenCalled();
  });
});
