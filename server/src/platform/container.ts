import type {
  AuthProvider,
  SecretsProvider,
  GitHubClient,
  GitClient,
  CodeIndex,
  Embedder,
  LLMProvider,
} from '@devdigest/shared';
import type { AppConfig } from './config.js';
import type { Db, DbOrTx } from '../db/client.js';
import { JobRunner, type JobHandlers } from './jobs.js';
import { RunBus } from './sse.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import { LocalNoAuthProvider } from '../adapters/auth/local.js';
import { OctokitGitHubClient, type GitHubClientLogger } from '../adapters/github/octokit.js';
import { PromptLog, type PromptLogPort } from './prompt-log.js';
import { SimpleGitClient } from '../adapters/git/simple-git.js';
import { RipgrepCodeIndex } from '../adapters/codeindex/ripgrep.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
import { MockReviewLLMProvider } from '../adapters/llm/mock.js';
import { OpenAIEmbedder } from '../adapters/embedder/openai.js';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { estimateCost } from '../adapters/llm/pricing.js';
import { PriceBook } from './price-book.js';
import { ConfigError } from './errors.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import { ReviewRepository } from '../modules/reviews/repository.js';
import type { RepoIntel } from '../modules/repo-intel/types.js';
import { moduleFactories } from '../modules/composition.js';
import type { TransactionRunner } from '../application/transaction.js';
import { DrizzleTransactionRunner } from '../db/transaction.js';
import { type DepGraph, DepCruiseGraph } from '../adapters/depgraph/index.js';
import { type Tokenizer, TiktokenTokenizer } from '../adapters/tokenizer/index.js';

/**
 * DI container = the composition root. One per app instance. Holds config, db,
 * the JobRunner, the SSE bus, lazily-constructed adapters (resolved through
 * SecretsProvider) and the feature modules' services.
 *
 * - Platform/adapters: getters below (`git`, `codeIndex`, `llm()`, …).
 * - Feature services: `container.modules.<name>` — built lazily by the module's
 *   own factory (`modules/<name>/composition.ts`, listed in
 *   `modules/composition.ts`). Modules own their wiring; this file does not
 *   change when a module's services or their deps change.
 * - Tests construct a container with `overrides` to inject mock adapters.
 */

/** Lazily-built services of every feature module, typed from the factories. */
export type Modules = {
  readonly [K in keyof typeof moduleFactories]: ReturnType<(typeof moduleFactories)[K]>;
};

function lazyModules(c: Container): Modules {
  const out = {} as Record<string, unknown>;
  const cache = new Map<string, unknown>();
  for (const [name, build] of Object.entries(moduleFactories)) {
    Object.defineProperty(out, name, {
      enumerable: true,
      get: () => {
        if (!cache.has(name)) cache.set(name, (build as (c: Container) => unknown)(c));
        return cache.get(name);
      },
    });
  }
  return out as Modules;
}

export interface ShutdownResult {
  /** Every live review run completed (cancelled) within the timeout. */
  runsDrained: boolean;
  /** The JobRunner went idle within the timeout. */
  jobsDrained: boolean;
  cancelledRuns: string[];
}
export interface ContainerOverrides {
  secrets?: SecretsProvider;
  auth?: AuthProvider;
  github?: GitHubClient;
  git?: GitClient;
  codeIndex?: CodeIndex;
  embedder?: Embedder;
  /** Pre-built providers by id (skip key lookup). */
  llm?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>;
  /** repo-intel facade (T1.1+) — tests inject mock RepoIntel implementations. */
  repoIntel?: RepoIntel;
  /** repo-intel T3 adapters — only the indexer pipeline reads these. */
  depgraph?: DepGraph;
  tokenizer?: Tokenizer;
}

export class Container {
  readonly config: AppConfig;
  readonly db: Db;
  readonly secrets: SecretsProvider;
  readonly auth: AuthProvider;
  readonly jobs: JobRunner;
  readonly runBus: RunBus;
  /** Feature-module services, built on first access by each module's factory. */
  readonly modules: Modules;
  /** Structured, content-free prompt-assembly logging (platform/prompt-log.ts). */
  readonly promptLog: PromptLogPort;

  private _git?: GitClient;
  private _github?: GitHubClient;
  private _codeIndex?: CodeIndex;
  private _embedder?: Embedder;
  private llmCache = new Map<string, LLMProvider>();

  // Shared repositories for cross-cutting entities (agents, reviews/pulls,
  // runs). Constructed here, in the composition root, so consuming modules use
  // `container.agentsRepo` instead of reaching into another module's folder.
  private _agentsRepo?: AgentsRepository;
  private _reviewRepo?: ReviewRepository;
  private _depgraph?: DepGraph;
  private _tokenizer?: Tokenizer;
  private _priceBook?: PriceBook;

  /**
   * @param log app logger (fastify `app.log`) handed to adapters that warn
   *   (and, when it exposes `info`, to PromptLog) — optional so unit tests can
   *   build a bare Container; adapters then fall back to console and PromptLog
   *   becomes a no-op.
   */
  constructor(
    config: AppConfig,
    db: Db,
    private overrides: ContainerOverrides = {},
    private readonly log?: GitHubClientLogger & { info?: (obj: Record<string, unknown>, msg: string) => void },
  ) {
    this.config = config;
    this.db = db;
    this.secrets = overrides.secrets ?? new LocalSecretsProvider(config.secretsPath);
    this.auth = overrides.auth ?? new LocalNoAuthProvider(db);
    this.runBus = new RunBus();
    this.jobs = new JobRunner(db);
    this.modules = lazyModules(this);
    this.promptLog = new PromptLog(config.promptLogVerbose, this.log);
  }

  /** Register every module's declared job handlers on the JobRunner. Call once at boot. */
  registerJobHandlers(): void {
    for (const mod of Object.values(this.modules) as { jobs?: JobHandlers }[]) {
      for (const [kind, handler] of Object.entries(mod.jobs ?? {})) this.jobs.register(kind, handler);
    }
  }

  /**
   * A TransactionRunner port whose `work` receives the repositories `bind`
   * builds on the transaction handle. Use in a module's composition.ts:
   *   tx: c.transactionRunner((db) => ({ agents: new AgentsRepository(db) }))
   */
  transactionRunner<R>(bind: (tx: DbOrTx) => R): TransactionRunner<R> {
    return new DrizzleTransactionRunner(this.db, bind);
  }

  /**
   * Graceful stop (called from the app's preClose hook): cancel every live
   * review run and stop the JobRunner, wait for both (bounded), then complete
   * whatever is left on the bus so open SSE streams end and never stall close.
   */
  async shutdown(opts: { runsTimeoutMs?: number; jobsTimeoutMs?: number } = {}): Promise<ShutdownResult> {
    const cancelledRuns = this.runBus.cancelAll();
    const [runsDrained, jobsDrained] = await Promise.all([
      this.runBus.whenIdle(opts.runsTimeoutMs ?? 5_000),
      this.jobs.shutdown(opts.jobsTimeoutMs ?? 10_000),
    ]);
    this.runBus.completeAll();
    return { runsDrained, jobsDrained, cancelledRuns };
  }

  get git(): GitClient {
    if (this.overrides.git) return this.overrides.git;
    // The PAT is resolved per git command (never embedded in the clone URL),
    // so rotating it via Settings takes effect without resetting the client.
    this._git ??= new SimpleGitClient(this.config.cloneDir, () => this.secrets.get('GITHUB_TOKEN'));
    return this._git;
  }

  get agentsRepo(): AgentsRepository {
    return (this._agentsRepo ??= new AgentsRepository(this.db));
  }

  get reviewRepo(): ReviewRepository {
    return (this._reviewRepo ??= new ReviewRepository(this.db));
  }

  get codeIndex(): CodeIndex {
    if (this.overrides.codeIndex) return this.overrides.codeIndex;
    this._codeIndex ??= new RipgrepCodeIndex(this.git);
    return this._codeIndex;
  }

  /**
   * The repo-intel facade (T1.1). All higher-level features (reviews,
   * blast/onboarding migrations, phantom-gate) code against this interface.
   * Tests inject a mock via `ContainerOverrides.repoIntel`.
   */
  get repoIntel(): RepoIntel {
    return this.overrides.repoIntel ?? this.modules.repoIntel.service;
  }

  /** Import-graph builder (dependency-cruiser). T3 indexer pipeline only. */
  get depgraph(): DepGraph {
    if (this.overrides.depgraph) return this.overrides.depgraph;
    this._depgraph ??= new DepCruiseGraph();
    return this._depgraph;
  }

  /** Token counter (js-tiktoken) for the repo-map budget search. */
  get tokenizer(): Tokenizer {
    if (this.overrides.tokenizer) return this.overrides.tokenizer;
    this._tokenizer ??= new TiktokenTokenizer();
    return this._tokenizer;
  }

  /**
   * Live OpenRouter pricing for cost attribution. The lister builds a bare
   * OpenRouter provider just for `/models` (no estimator needed) and degrades to
   * `[]` when no key is configured; the static `estimateCost` table is the
   * fallback for OpenAI/Anthropic and a cold/cold-failed cache.
   */
  get priceBook(): PriceBook {
    this._priceBook ??= new PriceBook(async () => {
      try {
        const key = await this.secrets.get('OPENROUTER_API_KEY');
        if (!key) return [];
        return await new OpenRouterProvider(key).listModels();
      } catch {
        return [];
      }
    }, estimateCost);
    return this._priceBook;
  }

  async github(): Promise<GitHubClient> {
    if (this.overrides.github) return this.overrides.github;
    if (this._github) return this._github;
    const token = await this.secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
    this._github = new OctokitGitHubClient(token, this.log);
    return this._github;
  }

  /** Resolve an LLM provider by id; constructs from the secret key, cached. */
  async llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    const injected = this.overrides.llm?.[id];
    if (injected) return injected;
    const cached = this.llmCache.get(id);
    if (cached) return cached;
    const provider = await this.buildLlm(id);
    this.llmCache.set(id, provider);
    return provider;
  }

  private async buildLlm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    // DEV/E2E switch (LLM_PROVIDER_OVERRIDE=mock): every provider is the
    // deterministic mock — no key lookup, no network. Test overrides still win.
    if (this.config.llmProviderOverride === 'mock') {
      return new MockReviewLLMProvider(id, { delayMs: this.config.llmMockDelayMs ?? 0 });
    }
    if (id === 'openai') {
      const key = await this.secrets.get('OPENAI_API_KEY');
      if (!key) throw new ConfigError('OPENAI_API_KEY is not configured');
      return new OpenAIProvider(key);
    }
    if (id === 'openrouter') {
      // Single OpenRouter provider lives in reviewer-core (shared with the CI
      // runner); inject the PriceBook so cost attribution uses LIVE OpenRouter
      // prices (with the static table as a fallback) rather than a hardcoded one.
      const key = await this.secrets.get('OPENROUTER_API_KEY');
      if (!key) throw new ConfigError('OPENROUTER_API_KEY is not configured');
      return new OpenRouterProvider(key, {
        estimateCost: (model, tokensIn, tokensOut) =>
          this.priceBook.estimate(model, tokensIn, tokensOut),
      });
    }
    const key = await this.secrets.get('ANTHROPIC_API_KEY');
    if (!key) throw new ConfigError('ANTHROPIC_API_KEY is not configured');
    return new AnthropicProvider(key);
  }

  async embedder(): Promise<Embedder> {
    // Injected embedders (tests) always win. Otherwise embeddings are gated by
    // config: when disabled we throw BEFORE constructing the OpenAI client, so
    // the app makes ZERO OpenAI requests. All callers wrap this in try/catch and
    // degrade gracefully (memory/RAG simply returns no hits).
    if (this.overrides.embedder) return this.overrides.embedder;
    if (!this.config.embeddingsEnabled) {
      throw new ConfigError('Embeddings are disabled (set EMBEDDINGS_ENABLED=true to enable memory/RAG)');
    }
    if (this._embedder) return this._embedder;
    const openai = await this.llm('openai');
    this._embedder = new OpenAIEmbedder(openai);
    return this._embedder;
  }

  /**
   * Drop cached provider clients so the next resolve picks up changed secrets.
   * Call after persisting a new API key/PAT via SecretsProvider.set.
   */
  invalidateSecretCaches(): void {
    this.llmCache.clear();
    this._github = undefined;
    this._embedder = undefined;
  }
}
