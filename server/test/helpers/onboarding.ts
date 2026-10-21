/** onboarding tests: in-memory port fakes shared by the service and route tests. */
import type { Onboarding, OnboardingRun } from '@devdigest/shared';
import { MockGitClient, MockLLMProvider } from '../../src/adapters/mocks.js';
import { OnboardingService } from '../../src/modules/onboarding/service.js';
import type { OnboardingDeps, OnboardingRepositoryPort, RepoIntelPort, RunUsage } from '../../src/modules/onboarding/ports.js';

export const WS = '11111111-1111-4111-8111-111111111111';
export const REPO_ID = '33333333-3333-4333-8333-333333333333';

export class FakeOnboardingRepo implements OnboardingRepositoryPort {
  runs: OnboardingRun[] = [];
  stored: Onboarding | null = null;
  private seq = 0;

  async getStored() {
    return this.stored;
  }
  async getLatestRun(_ws: string, repoId: string) {
    return [...this.runs].reverse().find((r) => r.repo_id === repoId);
  }
  async createRun(_ws: string, repoId: string, model: { provider: string; model: string }) {
    if (this.runs.some((r) => r.repo_id === repoId && r.status === 'running')) {
      throw Object.assign(new Error('duplicate key'), { code: '23505' });
    }
    const run: OnboardingRun = {
      id: `run-${++this.seq}`,
      repo_id: repoId,
      status: 'running',
      provider: model.provider,
      model: model.model,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: null,
      files_indexed: 0,
      error: null,
      started_at: new Date().toISOString(),
      finished_at: null,
    };
    this.runs.push(run);
    return run;
  }
  async failRun(_ws: string, runId: string, error: string, usage: RunUsage = {}) {
    const r = this.runs.find((x) => x.id === runId);
    if (r) Object.assign(r, { status: 'failed', error, finished_at: new Date().toISOString(), cost_usd: usage.costUsd ?? r.cost_usd });
  }
  async completeRun(_ws: string, _repoId: string, runId: string, tour: Onboarding) {
    this.stored = tour;
    const r = this.runs.find((x) => x.id === runId);
    if (r) Object.assign(r, { status: 'done', finished_at: new Date().toISOString(), cost_usd: tour.cost_usd, tokens_in: tour.tokens_in });
  }
}

export const README = '# Demo\n\n```\npnpm install\npnpm dev\n```\n';
export const PKG = JSON.stringify({ scripts: { dev: 'tsx watch', build: 'tsc' } });
export const FILES: Record<string, string> = {
  'README.md': README,
  'package.json': PKG,
  'src/server.ts': 'export const app = 1;\n',
  'src/lib/redis.ts': 'export const redis = 1;\n',
};

export const DRAFT = {
  architecture: { body: 'A **service**.', diagram: 'flowchart LR\n A --> B' },
  critical_paths: {
    items: [
      { path: 'src/server.ts', why: 'bootstrap' },
      { path: 'src/ghost.ts', why: 'hallucinated' },
    ],
  },
  run_locally: {
    items: [
      { command: 'pnpm install', note: null },
      { command: 'pnpm dev', note: 'starts the API' },
      { command: 'rm -rf /', note: null },
    ],
  },
  reading_path: {
    items: [
      { path: 'src/ghost.ts', why: 'nope' },
      { path: 'src/lib/redis.ts', why: 'singleton' },
      { path: 'src/server.ts', why: 'entry' },
    ],
  },
  first_tasks: {
    items: [
      { title: 'Add a log line', why: 'easy', files: [{ path: 'src/server.ts' }] },
      { title: 'Ghost task', why: 'x', files: [{ path: 'src/ghost.ts' }] },
    ],
  },
};

export function makeFakes(
  opts: {
    clonePath?: string | null;
    files?: Record<string, string>;
    structured?: unknown;
    indexStatus?: 'full' | 'partial' | 'degraded' | 'failed';
    repoIntelEnabled?: boolean;
    indexedPaths?: string[];
    lastPolledAt?: Date | null;
    indexUpdatedAt?: Date;
    llm?: MockLLMProvider;
  } = {},
) {
  const repo = new FakeOnboardingRepo();
  const git = new MockGitClient({ files: opts.files ?? FILES });
  const llm = opts.llm ?? new MockLLMProvider('openai', { structured: opts.structured ?? DRAFT });
  const calls = { rank: 0, top: 0 };
  const repoIntel: RepoIntelPort = {
    getIndexState: async () => ({
      status: opts.indexStatus ?? 'full',
      filesIndexed: 120,
      updatedAt: opts.indexUpdatedAt ?? new Date(0),
    }),
    getTopFilesByRank: async () => {
      calls.top++;
      return ['src/server.ts', 'src/lib/redis.ts'];
    },
    getCriticalPaths: async () => [['src/server.ts', 'src/lib/redis.ts']],
    getFileRank: async (_id, paths) => {
      calls.rank++;
      const known = opts.indexedPaths ?? ['src/server.ts', 'src/lib/redis.ts'];
      return paths.filter((p) => known.includes(p)).map((path) => ({ path }));
    },
  };
  const queue: unknown[] = [];
  const handlers = new Map<string, (p: unknown) => Promise<void>>();
  const deps: OnboardingDeps = {
    repo,
    repos: {
      getById: async (ws, id) =>
        ws === WS && id === REPO_ID
          ? {
              id,
              owner: 'acme',
              name: 'payments-api',
              fullName: 'acme/payments-api',
              defaultBranch: 'main',
              clonePath: opts.clonePath === undefined ? '/tmp/clone' : opts.clonePath,
              lastPolledAt: opts.lastPolledAt ?? null,
            }
          : undefined,
    },
    repoIntel,
    repoIntelEnabled: opts.repoIntelEnabled ?? true,
    git,
    llm: async () => llm,
    featureModel: async () => ({ provider: 'openai', model: 'gpt-test' }),
    jobs: {
      register: (kind, h) => void handlers.set(kind, h),
      enqueue: async (_ws, _kind, payload) => void queue.push(payload),
    },
    systemPrompt: async () => 'SYSTEM',
  };
  const service = new OnboardingService(deps);
  return { service, repo, git, llm, queue, calls, deps };
}
