/**
 * Bounded, non-duplicated runs (XC-5, BE-12) against in-memory ports: a second
 * request for a running (PR, agent) returns the existing run; an oversized diff
 * is cut at a file boundary, logged, and the head is not marked reviewed; the
 * model call carries the output-token cap.
 */
import { describe, it, expect } from 'vitest';
import type { Agent, LLMProvider, Review, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { ReviewService } from '../src/modules/reviews/service.js';
import { MAX_DIFF_CHARS, REVIEW_MAX_OUTPUT_TOKENS } from '../src/modules/reviews/constants.js';
import type { ReviewOutcome, ReviewPull, ReviewStore } from '../src/modules/reviews/ports.js';
import { RunBus } from '../src/platform/sse.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';

const agent: Agent = {
  id: 'agent-1',
  name: 'Sec',
  description: '',
  provider: 'openai',
  model: 'gpt-4.1',
  system_prompt: 'sec',
  enabled: true,
  version: 1,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: false,
  skill_count: 0,
};

const pull: ReviewPull = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 7,
  title: 'Add config',
  author: 'octocat',
  base: 'main',
  headSha: 'abc123',
  body: null,
};

const EMPTY: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

function fileDiff(path: string, lines: number): string {
  const body = Array.from({ length: lines }, (_, i) => `+const v${i} = ${i};`).join('\n');
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -0,0 +1,${lines} @@\n${body}\n`;
}

function setup(rawDiff: string) {
  const requests: StructuredRequest<unknown>[] = [];
  const reviews: ReviewOutcome[] = [];
  const marked: string[] = [];
  const created: string[] = [];
  const active: { run_id: string; agent_id: string | null; agent_name: string | null; ran_at: string | null }[] = [];

  const store = {
    createAgentRun: async () => {
      const id = `run-${created.length + 1}`;
      created.push(id);
      return id;
    },
    activeRunsForPull: async () => active,
    saveReviewOutcome: async (o: ReviewOutcome) => {
      reviews.push(o);
      return { reviewId: 'review-1' };
    },
    saveRunTrace: async () => undefined,
    completeAgentRun: async () => undefined,
  } as unknown as ReviewStore;

  const llm = {
    id: 'openai',
    completeStructured: async <T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> => {
      requests.push(req as StructuredRequest<unknown>);
      return {
        data: req.schema.parse(EMPTY),
        model: req.model,
        tokensIn: 1,
        tokensOut: 1,
        costUsd: 0,
        raw: '{}',
        attempts: 1,
      };
    },
  } as unknown as LLMProvider;

  const service = new ReviewService({
    store,
    pulls: {
      getById: async () => pull,
      filesAndCommits: async () => ({ files: [] }),
      markReviewed: async (id) => {
        marked.push(id);
      },
    },
    repos: { getById: async () => ({ owner: 'acme', name: 'widgets' }) },
    agents: { listEnabled: async () => [agent], getById: async () => agent },
    llm: async () => llm,
    git: { diff: async () => parseUnifiedDiff(rawDiff) },
    parseDiff: parseUnifiedDiff,
    repoIntel: {
      getCallerSignatures: async () => [],
      getRepoMap: async () => ({ text: '', tokens: 0, cached: false, degraded: true }),
      getFileRank: async () => [],
    } as never,
    events: new RunBus(),
    skills: { effectiveSkills: async () => [] },
    tokens: { count: (s: string) => Math.ceil(s.length / 4) },
  });
  // The run is over once its trace-bearing save resolved and markReviewed had its turn.
  const settle = async () => {
    for (let i = 0; i < 50 && reviews.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
    await new Promise((r) => setTimeout(r, 5));
  };
  return { service, requests, reviews, marked, created, active, settle };
}

describe('ReviewService run bounds', () => {
  it('returns the running run for the same PR and agent instead of starting another', async () => {
    const t = setup(fileDiff('a.ts', 2));
    t.active.push({ run_id: 'run-existing', agent_id: agent.id, agent_name: agent.name, ran_at: null });

    const { runs } = await t.service.runReview('ws-1', pull.id, [agent]);

    expect(runs).toEqual([{ run_id: 'run-existing', agent_id: agent.id, agent_name: agent.name }]);
    expect(t.created).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 20));
    expect(t.requests).toHaveLength(0); // no second model call
  });

  it('caps the output tokens and marks a small diff reviewed', async () => {
    const t = setup(fileDiff('a.ts', 2));
    await t.service.runReview('ws-1', pull.id, [agent]);
    await t.settle();

    expect(t.requests[0]!.maxTokens).toBe(REVIEW_MAX_OUTPUT_TOKENS);
    expect(t.marked).toEqual([pull.id]);
  });

  it('cuts an oversized diff at a file boundary, says so in the log, and does not mark the head reviewed', async () => {
    const small = fileDiff('small.ts', 10);
    const huge = fileDiff('huge.ts', 20_000);
    expect((small + huge).length).toBeGreaterThan(MAX_DIFF_CHARS);
    const t = setup(small + huge);

    await t.service.runReview('ws-1', pull.id, [agent]);
    await t.settle();

    const prompt = t.requests[0]!.messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('small.ts');
    expect(prompt).not.toContain('huge.ts');
    const log = t.reviews[0]!.trace.log.map((l) => l.msg).join('\n');
    expect(log).toMatch(/Diff truncated.*1 file\(s\) not reviewed.*partial/);
    expect(t.marked).toHaveLength(0);
  });
});
