/** pr-brief tests: in-memory port fakes for the service tests. */
import type { PrBrief, RunSummary, RunTrace } from '@devdigest/shared';
import { ConflictError } from '../../src/platform/errors.js';
import { MockLLMProvider } from '../../src/adapters/mocks.js';
import { PrBriefService } from '../../src/modules/pr-brief/service.js';
import type {
  NewestReview,
  PrBriefDeps,
  PrBriefRepositoryPort,
  PrFileInfo,
  PullInfo,
  RunUsage,
} from '../../src/modules/pr-brief/ports.js';

export const WS = '11111111-1111-4111-8111-111111111111';
export const PR_ID = '22222222-2222-4222-8222-222222222222';

export const PATCH = ['@@ -9,3 +9,5 @@ x', ' a', '+b', '+c', '-d', ' e'].join('\n');

export const DRAFT = {
  summary: 'Adds a limiter.',
  risks: [
    { kind: 'auth', title: 'Key', explanation: 'e', severity: 'high', file_refs: ['src/a.ts:10', 'src/ghost.ts:1'] },
    { kind: 'config', title: 'Ghost', explanation: 'e', severity: 'low', file_refs: ['src/ghost.ts'] },
  ],
  review_focus: [
    { path: 'src/a.ts', line: 10, reason: 'check' },
    { path: 'src/a.ts', line: 500, reason: 'outside' },
    { path: 'src/ghost.ts', line: 1, reason: 'ghost' },
  ],
};

export class FakeBriefRepo implements PrBriefRepositoryPort {
  runs: RunSummary[] = [];
  stored: PrBrief | null = null;
  traces = new Map<string, RunTrace>();
  pull: PullInfo | undefined = { id: PR_ID, number: 7, title: 'T', branch: 'b', body: 'body', headSha: 'h1' };
  files: PrFileInfo[] = [{ path: 'src/a.ts', additions: 2, deletions: 1, patch: PATCH }];
  review: NewestReview | undefined;
  private seq = 0;

  async getPull(_ws: string, prId: string) {
    return prId === PR_ID ? this.pull : undefined;
  }
  async getPrFiles() {
    return this.files;
  }
  async getNewestReview() {
    return this.review;
  }
  async getLatestRun() {
    return this.runs[this.runs.length - 1];
  }
  async getStored() {
    return this.stored;
  }
  async createRun(_ws: string, _prId: string, model: { provider: string; model: string }) {
    if (this.runs.some((r) => r.status === 'running')) throw new ConflictError('already running');
    const run = {
      run_id: `run-${++this.seq}`,
      kind: 'brief',
      agent_id: null,
      agent_name: null,
      provider: model.provider,
      model: model.model,
      status: 'running',
      error: null,
      duration_ms: null,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      findings_count: null,
      grounding: null,
      ran_at: new Date().toISOString(),
      score: null,
      blockers: null,
    } as RunSummary;
    this.runs.push(run);
    return run;
  }
  async failRun(_ws: string, runId: string, error: string, _usage: RunUsage = {}) {
    const r = this.runs.find((x) => x.run_id === runId);
    if (r) Object.assign(r, { status: 'failed', error });
  }
  async completeRun(_ws: string, _prId: string, runId: string, brief: PrBrief, _u: RunUsage, trace: RunTrace) {
    this.stored = brief;
    this.traces.set(runId, trace);
    const r = this.runs.find((x) => x.run_id === runId);
    if (r) Object.assign(r, { status: 'done', cost_usd: brief.cost_usd });
  }
  async saveTrace(_ws: string, runId: string, trace: RunTrace) {
    this.traces.set(runId, trace);
  }
}

export function makeFakes(
  opts: {
    llm?: { completeStructured: MockLLMProvider['completeStructured'] };
    structured?: unknown;
    repoIntelEnabled?: boolean;
    blastDegraded?: boolean;
    blastThrows?: boolean;
    llmFactoryThrows?: Error;
  } = {},
) {
  const repo = new FakeBriefRepo();
  const mock = new MockLLMProvider('openai', { structured: opts.structured ?? DRAFT });
  const llm = opts.llm ? Object.assign(mock, opts.llm) : mock;
  const calls = { blast: 0, intent: 0 };
  const lines: string[] = [];
  const queue: unknown[] = [];
  const handlers = new Map<string, (p: unknown) => Promise<void>>();
  const deps: PrBriefDeps = {
    repo,
    intent: {
      get: async () => {
        calls.intent++;
        return { intent: 'why', inScope: ['a'], outOfScope: [] };
      },
    },
    smartDiff: { get: async () => ({ has_review: false, groups: [], split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] } }) },
    blast: {
      get: async () => {
        calls.blast++;
        if (opts.blastThrows) throw new Error('index gone');
        return {
          changed_symbols: [],
          downstream: [],
          summary: '',
          degraded: opts.blastDegraded ?? false,
          reason: opts.blastDegraded ? 'no_data' : null,
          head_sha: 'h1',
          history: [],
        } as never;
      },
    },
    repoIntelEnabled: opts.repoIntelEnabled ?? true,
    llm: async () => {
      if (opts.llmFactoryThrows) throw opts.llmFactoryThrows;
      return llm;
    },
    featureModel: async () => ({ provider: 'openrouter', model: 'deepseek-test' }),
    jobs: {
      register: (kind, h) => void handlers.set(kind, h),
      enqueue: async (_ws, _kind, payload) => void queue.push(payload),
    },
    systemPrompt: async () => 'SYSTEM',
    runLog: () => ({
      info: (m) => void lines.push(m),
      tool: (m) => void lines.push(m),
      result: (m) => void lines.push(m),
      error: (m) => void lines.push(m),
      logFor: () => lines.map((msg, i) => ({ t: String(i), kind: 'info' as const, msg })),
    }),
  };
  const service = new PrBriefService(deps);
  return { service, repo, llm, queue, calls, lines, deps };
}
