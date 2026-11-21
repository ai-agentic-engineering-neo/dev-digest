import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import type { CompletionRequest, UnifiedDiff } from '@devdigest/shared';
import type { AgentRow, PullRow } from '../src/db/rows.js';
import type { ReviewRepository } from '../src/modules/reviews/repository.js';
import { ReviewRunExecutor, type Logger, type RunExecutorDeps } from '../src/modules/reviews/run-executor.js';
import { taskLine } from '../src/modules/reviews/helpers.js';
import { RunBus } from '../src/platform/sse.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * SPEC-16 / plan 16, Phase 1 / T2 — characterization net for `ReviewRunExecutor`.
 *
 * Pins CURRENT behaviour (not "correct" behaviour) through the PUBLIC
 * `executeRuns` only: the private `buildCallersDigest` / `buildRankNote` /
 * `traceFromBuffer` are observed via (1) the user message the stub LLM
 * received, (2) the `RunTrace` handed to `repo.saveRunTrace`, (3) Live Log
 * lines. Phase 2 (I3) rewrites the private methods into pure functions and
 * changes ONLY `makeExecutor` below — the `it(...)` bodies and their inline
 * literals must stay byte-identical.
 */

// ---- fixtures --------------------------------------------------------------

const FILES = ['a.ts', 'b.ts', 'c.ts'];

function diffOf(paths: string[]): UnifiedDiff {
  return {
    raw: paths.map((p) => `diff --git a/${p} b/${p}\n@@ -1 +1,2 @@\n+x\n`).join(''),
    files: paths.map((path) => ({
      path,
      additions: 1,
      deletions: 0,
      hunks: [{ header: '@@ -1 +1,2 @@', oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['+x'] }],
    })),
  } as unknown as UnifiedDiff;
}

const PULL = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 482,
  title: 'Add rate limiting',
  author: 'marisa.koch',
  base: 'main',
  headSha: 'a1b2c3',
  body: null,
} as unknown as PullRow;

const REPO_ROW = { owner: 'acme', name: 'api', clonePath: null } as never;

const AGENT = {
  id: 'agent-1',
  name: 'Security Reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  systemPrompt: 'You review pull requests.',
  strategy: 'single-pass',
  ciFailOn: 'critical',
  repoIntel: true,
  version: 3,
} as unknown as AgentRow;

const APPROVE = { verdict: 'approve', summary: 'Looks fine.', score: 95, findings: [] };

// ---- harness: the ONE factory Phase 2 is allowed to change -----------------

type CallerRow = { file: string; symbol: string; signature: string };
type RankRow = { file: string; percentile: number };

interface Fakes {
  /** `undefined` → repoIntel methods throw (proves they were never called). */
  getCallerSignatures?: (repoId: string, files: string[], limit: number) => Promise<CallerRow[]>;
  getFileRank?: (repoId: string, files: string[]) => Promise<RankRow[]>;
  getRepoMap?: (repoId: string) => Promise<{ degraded: boolean; text: string; tokens: number; cached: boolean }>;
  gitDiff?: () => Promise<UnifiedDiff>;
  prFiles?: () => Promise<{ path: string; patch: string | null }[]>;
  llmFails?: string;
  agent?: AgentRow;
  diff?: UnifiedDiff;
}

function makeExecutor(fakes: Fakes = {}) {
  const runBus = new RunBus();
  const llm = new MockLLMProvider('openai', { structured: APPROVE });
  const intentCalls: unknown[] = [];
  const repoIntelCalls: string[] = [];
  const logs: string[] = [];
  const persisted: { completed: Record<string, unknown>[]; traces: Record<string, unknown>; review: unknown[] } = {
    completed: [],
    traces: {},
    review: [],
  };
  const notStubbed = (name: string) => async () => {
    throw new Error(`${name} not stubbed`);
  };
  const track =
    <A extends unknown[], R>(name: string, fn: ((...a: A) => Promise<R>) | undefined) =>
    async (...a: A): Promise<R> => {
      repoIntelCalls.push(name);
      return (fn ?? (notStubbed(name) as unknown as (...a: A) => Promise<R>))(...a);
    };

  const deps: RunExecutorDeps = {
    runBus,
    llm: async () => {
      if (fakes.llmFails) throw new Error(fakes.llmFails);
      return llm;
    },
    tokenizer: { count: (t: string) => t.length },
    promptAssemblyDebugEnabled: false,
    git: { diff: fakes.gitDiff ?? (async () => fakes.diff ?? diffOf(FILES)) },
    repoIntel: {
      getCallerSignatures: track('getCallerSignatures', fakes.getCallerSignatures),
      getFileRank: track('getFileRank', fakes.getFileRank),
      getRepoMap: track('getRepoMap', fakes.getRepoMap ?? (async () => ({ degraded: true, text: '', tokens: 0, cached: false }))),
    },
    resolveProjectContext: async () => ({ documents: [], entries: [] }),
    resolveIntent: async (input: unknown) => {
      intentCalls.push(input);
      return { rendered: undefined, inScope: undefined, outOfScope: undefined, contextGaps: [] };
    },
    agents: { enabledSkills: async () => [] },
  };

  const repo = {
    insertReview: async (input: Record<string, unknown>) => {
      const row = { id: 'review-1', ...input };
      persisted.review.push(row);
      return row;
    },
    insertFindings: async (_id: string, f: unknown[]) => f,
    markReviewed: async () => undefined,
    completeAgentRun: async (runId: string, input: Record<string, unknown>) => {
      persisted.completed.push({ runId, ...input });
    },
    saveRunTrace: async (runId: string, trace: unknown) => {
      persisted.traces[runId] = trace;
    },
    recordRunSkills: async () => undefined,
    getPrFiles: fakes.prFiles ?? (async () => []),
  } as unknown as ReviewRepository;

  const executor = new ReviewRunExecutor(repo, deps);
  const logger: Logger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };

  const agent = fakes.agent ?? AGENT;
  return {
    run: () => executor.executeRuns('ws-1', PULL, REPO_ROW, [{ agent, runId: 'run-1' }], logger),
    userMessage: () => {
      const call = llm.calls.find((c) => c.method === 'completeStructured');
      const msgs = (call!.req as CompletionRequest).messages as { role: string; content: string }[];
      return msgs[1]!.content;
    },
    llmCalled: () => llm.calls.some((c) => c.method === 'completeStructured'),
    logLines: () => runBus.buffer('run-1').map((e) => e.msg),
    repoIntelCalls,
    persisted,
    intentCalls,
    logs,
  };
}

beforeEach(() => {
  // Frozen wall-clock: `t` in log lines, every `ms`/`duration_ms` collapses to 0.
  // Local-time constructor → `toTimeString().slice(0, 8)` is '03:04:05' in any TZ.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 0, 2, 3, 4, 5));
});
afterEach(() => {
  vi.useRealTimers();
});

// ---- 1. callers digest -----------------------------------------------------

describe('executeRuns → callers digest in the prompt', () => {
  it('groups callers by file in first-appearance order, inside the Callers section', async () => {
    const h = makeExecutor({
      getCallerSignatures: async () => [
        { file: 'a.ts', symbol: 'f', signature: 'f(x: number): void' },
        { file: 'b.ts', symbol: 'g', signature: 'g(): string' },
        { file: 'a.ts', symbol: 'h', signature: 'h(): void' },
      ],
    });
    await h.run();

    const user = h.userMessage();
    expect(user).toContain('## Callers of changed symbols\n');
    expect(user).toContain(
      '### a.ts\n- `f` — f(x: number): void\n- `h` — h(): void\n### b.ts\n- `g` — g(): string',
    );
    expect(h.logLines()).toContain('callers digest: 3 caller signature(s) attached');
  });

  it('asks repo-intel for the changed files with limit 10', async () => {
    let seen: { repoId: string; files: string[]; limit: number } | null = null;
    const h = makeExecutor({
      getCallerSignatures: async (repoId, files, limit) => {
        seen = { repoId, files, limit };
        return [];
      },
    });
    await h.run();
    expect(seen).toEqual({ repoId: 'repo-1', files: ['a.ts', 'b.ts', 'c.ts'], limit: 10 });
  });

  it('omits the section when repo-intel returns no callers', async () => {
    const h = makeExecutor({ getCallerSignatures: async () => [] });
    await h.run();
    expect(h.userMessage()).not.toContain('## Callers of changed symbols');
    expect(h.logLines().some((m) => m.startsWith('callers digest:'))).toBe(false);
  });

  it('omits the section and logs the failure when repo-intel throws', async () => {
    const h = makeExecutor({
      getCallerSignatures: async () => {
        throw new Error('index offline');
      },
    });
    await h.run();
    expect(h.userMessage()).not.toContain('## Callers of changed symbols');
    expect(h.logLines()).toContain('callers digest: repoIntel failed — index offline');
    // The run itself still succeeded.
    expect(h.persisted.completed[0]).toMatchObject({ runId: 'run-1', status: 'done' });
  });
});

// ---- 2. rank note ----------------------------------------------------------

describe('executeRuns → rank note appended to the task line', () => {
  const NOTE =
    '\n\n2 of 3 changed file(s) are in the top 5% most-depended-on (high blast risk) — prioritise their correctness.';

  it('appends the exact note when 2 of 3 changed files are at percentile >= 95', async () => {
    const h = makeExecutor({
      getFileRank: async () => [
        { file: 'a.ts', percentile: 99 },
        { file: 'b.ts', percentile: 95 },
        { file: 'c.ts', percentile: 40 },
      ],
    });
    await h.run();

    const user = h.userMessage();
    expect(user).toContain(taskLine(PULL) + NOTE);
    expect(h.logLines()).toContain('file rank: 2/3 changed file(s) in top 5%');
  });

  it('the 95 boundary is inclusive: 95 counts, 94.99 does not', async () => {
    const at = makeExecutor({ getFileRank: async () => [{ file: 'a.ts', percentile: 95 }] });
    await at.run();
    expect(at.userMessage()).toContain(
      '1 of 3 changed file(s) are in the top 5% most-depended-on (high blast risk) — prioritise their correctness.',
    );

    const below = makeExecutor({ getFileRank: async () => [{ file: 'a.ts', percentile: 94.99 }] });
    await below.run();
    expect(below.userMessage()).not.toContain('most-depended-on');
    expect(below.logLines().some((m) => m.startsWith('file rank:'))).toBe(false);
  });

  it('adds no suffix for an empty rank list or a throwing repo-intel (and logs nothing)', async () => {
    const empty = makeExecutor({ getFileRank: async () => [] });
    await empty.run();
    expect(empty.userMessage()).not.toContain('most-depended-on');

    const boom = makeExecutor({
      getFileRank: async () => {
        throw new Error('rank down');
      },
    });
    await boom.run();
    expect(boom.userMessage()).not.toContain('most-depended-on');
    expect(boom.logLines().some((m) => m.includes('rank down'))).toBe(false);
  });
});

// ---- 5. agent.repoIntel === false -----------------------------------------

describe('executeRuns → agent opted out of repo intel', () => {
  it('makes no repoIntel.* call and logs the skip line', async () => {
    const h = makeExecutor({
      agent: { ...AGENT, repoIntel: false } as AgentRow,
      getCallerSignatures: async () => [{ file: 'a.ts', symbol: 'f', signature: 'f()' }],
      getFileRank: async () => [{ file: 'a.ts', percentile: 99 }],
    });
    await h.run();

    expect(h.repoIntelCalls).toEqual([]);
    expect(h.logLines()).toContain('Repo intel disabled for this agent — skipping context enrichment');
    expect(h.userMessage()).not.toContain('## Callers of changed symbols');
    expect(h.userMessage()).not.toContain('most-depended-on');
  });

  it('with repo intel on, the call order is callers → repo map → rank', async () => {
    const h = makeExecutor({
      getCallerSignatures: async () => [],
      getFileRank: async () => [],
    });
    await h.run();
    expect(h.repoIntelCalls).toEqual(['getCallerSignatures', 'getRepoMap', 'getFileRank']);
  });
});

// ---- 3. successful RunTrace ------------------------------------------------

describe('executeRuns → successful RunTrace', () => {
  it('persists the full trace object (time frozen)', async () => {
    const h = makeExecutor({
      agent: { ...AGENT, repoIntel: false } as AgentRow,
      diff: diffOf(['a.ts']),
    });
    await h.run();

    const trace = h.persisted.traces['run-1'] as { prompt_assembly: { user: string } };
    // `prompt_assembly.user` is the assembled prompt (large, covered by the
    // prompt-* tests); pin the rest of the trace verbatim and the user slot
    // against what the LLM actually received.
    const { prompt_assembly, raw_output, ...rest } = trace as Record<string, unknown> & {
      prompt_assembly: Record<string, unknown>;
      raw_output: unknown;
    };
    expect(prompt_assembly.user).toBe(h.userMessage());
    // reviewer-core appends the shared INJECTION_GUARD after the agent prompt.
    expect((prompt_assembly.system as string).startsWith('You review pull requests.\n\nSECURITY')).toBe(true);
    // raw_output is the model's raw JSON string, not a parsed object.
    expect(raw_output).toBe(JSON.stringify(APPROVE));
    expect(rest).toEqual({
      config: {
        agent: 'Security Reviewer',
        version: '3',
        provider: 'openai',
        model: 'gpt-4.1',
        pr: 482,
        source: 'local',
      },
      stats: {
        duration_ms: 0,
        tokens_in: 100,
        tokens_out: 50,
        cost_usd: 0.001,
        findings: 0,
        grounding: '0/0 passed',
      },
      tool_calls: [{ tool: 'review_file', args: 'all files', meta: 'single-pass', ms: 0 }],
      memory_pulled: [],
      specs_read: [],
      log: [
        { t: '03:04:05', kind: 'tool', msg: 'Loading PR diff…' },
        { t: '03:04:05', kind: 'tool', msg: 'Loading PR diff done (0ms)' },
        { t: '03:04:05', kind: 'info', msg: 'Diff ready — 1 changed file(s); starting 1 agent run(s)' },
        { t: '03:04:05', kind: 'tool', msg: 'Resolving PR intent…' },
        { t: '03:04:05', kind: 'tool', msg: 'Resolving PR intent done (0ms)' },
        { t: '03:04:05', kind: 'info', msg: 'Starting review with agent "Security Reviewer" (openai/gpt-4.1)' },
        { t: '03:04:05', kind: 'tool', msg: 'Resolving openai provider…' },
        { t: '03:04:05', kind: 'tool', msg: 'Resolving openai provider done (0ms)' },
        { t: '03:04:05', kind: 'info', msg: 'Repo intel disabled for this agent — skipping context enrichment' },
        { t: '03:04:05', kind: 'tool', msg: 'Loading skills…' },
        { t: '03:04:05', kind: 'tool', msg: 'Loading skills done (0ms)' },
        { t: '03:04:05', kind: 'tool', msg: 'Loading project context…' },
        { t: '03:04:05', kind: 'tool', msg: 'Loading project context done (0ms)' },
        // Emitted by reviewer-core via onEvent → runLog.event:
        { t: '03:04:05', kind: 'info', msg: 'Reviewing 1 changed file(s) in one pass' },
        { t: '03:04:05', kind: 'tool', msg: 'Reviewing all files in one pass' },
        { t: '03:04:05', kind: 'result', msg: 'all files: 0 candidate finding(s)' },
        { t: '03:04:05', kind: 'result', msg: 'Reduced to 0 finding(s); verdict=approve, score=95' },
        { t: '03:04:05', kind: 'result', msg: 'Citation grounding: 0/0 passed' },
        { t: '03:04:05', kind: 'info', msg: 'Run complete' },
        { t: '03:04:05', kind: 'result', msg: 'Persisted review review-1 with 0 finding(s)' },
      ],
    });
  });

  it('records the agent_runs completion row alongside the trace', async () => {
    const h = makeExecutor({ agent: { ...AGENT, repoIntel: false } as AgentRow });
    await h.run();
    expect(h.persisted.completed).toEqual([
      {
        runId: 'run-1',
        status: 'done',
        durationMs: 0,
        tokensIn: 100,
        tokensOut: 50,
        costUsd: 0.001,
        findingsCount: 0,
        grounding: '0/0 passed',
        // reviewer-core recomputes the score from findings (0 findings → 100),
        // ignoring the model's own 95.
        score: 100,
        blockers: 0,
        error: null,
      },
    ]);
  });
});

// ---- 4. fallback trace -----------------------------------------------------

describe('executeRuns → fallback trace (traceFromBuffer)', () => {
  const EMPTY_ASSEMBLY = {
    system: 'You review pull requests.',
    skills: null,
    memory: null,
    specs: null,
    intent: null,
    intent_scope: null,
    user: '',
  };

  it('LLM provider throws → failed run + minimal trace with null/empty slots', async () => {
    const h = makeExecutor({ llmFails: 'no api key' });
    await h.run();

    expect(h.persisted.completed).toEqual([
      {
        runId: 'run-1',
        status: 'failed',
        durationMs: 0,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: null,
        findingsCount: 0,
        grounding: '0/0 passed',
        error: 'no api key',
      },
    ]);
    expect(h.persisted.traces['run-1']).toEqual({
      config: {
        agent: 'Security Reviewer',
        version: '3',
        provider: 'openai',
        model: 'gpt-4.1',
        pr: 482,
        source: 'local',
      },
      stats: { duration_ms: 0, tokens_in: 0, tokens_out: 0, cost_usd: null, findings: 0, grounding: '0/0 passed' },
      prompt_assembly: EMPTY_ASSEMBLY,
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      log: [
        { t: '03:04:05', kind: 'tool', msg: 'Loading PR diff…' },
        { t: '03:04:05', kind: 'tool', msg: 'Loading PR diff done (0ms)' },
        { t: '03:04:05', kind: 'info', msg: 'Diff ready — 3 changed file(s); starting 1 agent run(s)' },
        { t: '03:04:05', kind: 'tool', msg: 'Resolving PR intent…' },
        { t: '03:04:05', kind: 'tool', msg: 'Resolving PR intent done (0ms)' },
        { t: '03:04:05', kind: 'info', msg: 'Starting review with agent "Security Reviewer" (openai/gpt-4.1)' },
        { t: '03:04:05', kind: 'tool', msg: 'Resolving openai provider…' },
        { t: '03:04:05', kind: 'error', msg: 'Resolving openai provider failed (0ms): no api key' },
        { t: '03:04:05', kind: 'error', msg: 'Run failed: no api key' },
      ],
    });
    expect(h.llmCalled()).toBe(false);
  });

  it('pre-work failure (git.diff AND getPrFiles throw) → failAll persists the same minimal trace', async () => {
    const h = makeExecutor({
      gitDiff: async () => {
        throw new Error('git gone');
      },
      prFiles: async () => {
        throw new Error('db gone');
      },
    });
    await h.run();

    expect(h.persisted.completed).toEqual([
      {
        runId: 'run-1',
        status: 'failed',
        durationMs: 0,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: null,
        findingsCount: 0,
        grounding: '0/0 passed',
        error: 'Failed to load PR diff: db gone',
      },
    ]);
    expect(h.persisted.traces['run-1']).toEqual({
      config: {
        agent: 'Security Reviewer',
        version: '3',
        provider: 'openai',
        model: 'gpt-4.1',
        pr: 482,
        source: 'local',
      },
      stats: { duration_ms: 0, tokens_in: 0, tokens_out: 0, cost_usd: null, findings: 0, grounding: '0/0 passed' },
      prompt_assembly: EMPTY_ASSEMBLY,
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      log: [
        { t: '03:04:05', kind: 'tool', msg: 'Loading PR diff…' },
        { t: '03:04:05', kind: 'error', msg: 'Loading PR diff failed (0ms): db gone' },
        { t: '03:04:05', kind: 'error', msg: 'Failed to load PR diff: db gone' },
      ],
    });
    // Pre-work failed → no agent ever started, no intent resolution attempted.
    expect(h.intentCalls).toEqual([]);
    expect(h.llmCalled()).toBe(false);
  });
});
