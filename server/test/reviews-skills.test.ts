/**
 * M2 skills in a review run, against in-memory ports and MockLLMProvider:
 * the effective skill's block reaches the prompt, the trace records
 * `skills_tokens` and `skills_used`, and the run log names it in one line.
 * With no effective skill there is no `## Skills / rules` section, both trace
 * fields are null and no skill is named. (Which skills are effective is the
 * repository's join, tested against Postgres in agents-skills.it.test.ts.)
 */
import { describe, it, expect } from 'vitest';
import type { Agent, Review, RunTrace, StructuredRequest } from '@devdigest/shared';
import { ReviewService } from '../src/modules/reviews/service.js';
import type { ReviewStore } from '../src/modules/reviews/ports.js';
import type { EffectiveSkill } from '../src/modules/skills/index.js';
import { RunBus } from '../src/platform/sse.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';

const DIFF = `diff --git a/src/api/users.ts b/src/api/users.ts
--- a/src/api/users.ts
+++ b/src/api/users.ts
@@ -1,2 +1,3 @@
 export const a = 1;
+export const b = 2;
 export const c = 3;`;

const REVIEW: Review = { verdict: 'approve', summary: 'Fine.', score: 100, findings: [] };

const agent: Agent = {
  id: 'agent-1',
  name: 'Tests',
  description: '',
  provider: 'openai',
  model: 'gpt-4.1',
  system_prompt: 'review tests',
  enabled: true,
  version: 1,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: false,
  skill_count: 1,
};

const EFFECTIVE: EffectiveSkill = {
  id: 'skill-1',
  name: 'branch-coverage-check',
  description: 'Flag new branches that no test exercises.',
  type: 'custom',
  body: 'For every new if/else, check a test covers both sides.',
  version: 3,
};

function setup(skills: EffectiveSkill[]) {
  const traces = new Map<string, RunTrace>();
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  const store = {
    activeRunsForPull: async () => [],
    createAgentRun: async () => 'run-1',
    completeAgentRun: async () => undefined,
    saveReviewOutcome: async (o: { runId: string; trace: RunTrace }) => {
      traces.set(o.runId, o.trace);
      resolveDone();
      return { reviewId: 'review-1' };
    },
    saveRunTrace: async (runId: string, trace: RunTrace) => {
      traces.set(runId, trace);
      resolveDone();
    },
  } as unknown as ReviewStore;

  const pull = {
    id: 'pr-1',
    repoId: 'repo-1',
    number: 483,
    title: 'Add refunds endpoint',
    author: 'dev',
    base: 'main',
    headSha: 'abc',
    body: null,
  };
  const llm = new MockLLMProvider('openai', { structured: REVIEW });
  const service = new ReviewService({
    store,
    pulls: {
      getById: async () => pull,
      filesAndCommits: async () => ({ files: [] }),
      markReviewed: async () => undefined,
    },
    repos: { getById: async () => ({ owner: 'acme', name: 'payments-api' }) },
    agents: { listEnabled: async () => [agent], getById: async () => agent },
    llm: async () => llm,
    git: { diff: async () => parseUnifiedDiff(DIFF) },
    parseDiff: parseUnifiedDiff,
    repoIntel: {} as never,
    events: new RunBus(),
    skills: { effectiveSkills: async () => skills },
    tokens: { count: (s) => s.length },
  });

  const run = async () => {
    await service.runReview('ws-1', pull.id, [agent]);
    await done; // the run executes in the background
    const trace = traces.get('run-1')!;
    const req = llm.calls.find((c) => c.method === 'completeStructured')!.req as StructuredRequest<unknown>;
    const user = req.messages.map((m) => m.content).join('\n');
    return { trace, user, log: trace.log.map((l) => l.msg) };
  };
  return { run };
}

describe('review run with skills', () => {
  it('puts the effective skill block in the prompt and records it in the trace and log', async () => {
    const { run } = setup([EFFECTIVE]);
    const { trace, user, log } = await run();

    const block = `### branch-coverage-check\n_Flag new branches that no test exercises._\n\n${EFFECTIVE.body}`;
    expect(user).toContain(`## Skills / rules\n${block}`);
    expect(trace.prompt_assembly.skills).toBe(block);
    expect(trace.prompt_assembly.skills_tokens).toBe(block.length);
    expect(trace.prompt_assembly.skills_used).toEqual([
      { id: 'skill-1', name: 'branch-coverage-check', version: 3 },
    ]);
    expect(log).toContain(`Loaded 1 skill(s) (+${block.length} tokens): branch-coverage-check v3`);
  });

  it('with no effective skill: no section, null trace fields, no skill named', async () => {
    const { run } = setup([]);
    const { trace, user, log } = await run();

    expect(user).not.toContain('## Skills / rules');
    expect(trace.prompt_assembly.skills).toBeNull();
    expect(trace.prompt_assembly.skills_tokens).toBeNull();
    expect(trace.prompt_assembly.skills_used).toBeNull();
    expect(log).toContain('No skills enabled for this agent');
    expect(log.join('\n')).not.toContain('branch-coverage-check');
  });
});
