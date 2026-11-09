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
import type { Db } from '../db/client.js';
import { JobRunner } from './jobs.js';
import { runBus, type RunBus } from './sse.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import { LocalNoAuthProvider } from '../adapters/auth/local.js';
import { OctokitGitHubClient } from '../adapters/github/octokit.js';
import { SimpleGitClient } from '../adapters/git/simple-git.js';
import { RipgrepCodeIndex } from '../adapters/codeindex/ripgrep.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
import { OpenAIEmbedder } from '../adapters/embedder/openai.js';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { estimateCost } from '../adapters/llm/pricing.js';
import { PriceBook } from './price-book.js';
import { ConfigError } from './errors.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import { ReviewRepository } from '../modules/reviews/repository.js';
import { SkillsRepository } from '../modules/skills/repository.js';
import type { SkillsRepositoryPort } from '../modules/skills/ports.js';
import { ConventionsRepository } from '../modules/conventions/repository.js';
import type { ConventionsRepositoryPort } from '../modules/conventions/ports.js';
import { IntentRepository } from '../modules/intent/repository.js';
import type { IntentRepositoryPort } from '../modules/intent/ports.js';
import { IntentService } from '../modules/intent/service.js';
import { BlastRepository } from '../modules/blast/repository.js';
import { BlastService } from '../modules/blast/service.js';
import { BriefRepository } from '../modules/brief/repository.js';
import type { BriefRepositoryPort } from '../modules/brief/ports.js';
import { BriefService } from '../modules/brief/service.js';
import { BRIEF_LLM_TIMEOUT_MS, BRIEF_TRANSPORT_RETRIES } from '../modules/brief/constants.js';
import type { BlastRepositoryPort } from '../modules/blast/ports.js';
import type { RepoIntel } from '../modules/repo-intel/types.js';
import { RepoIntelService } from '../modules/repo-intel/service.js';
import { type DepGraph, DepCruiseGraph } from '../adapters/depgraph/index.js';
import { type Tokenizer, TiktokenTokenizer } from '../adapters/tokenizer/index.js';
import { type DocWalker, FsDocWalker } from '../adapters/docs/index.js';
import { ContextRepository } from '../modules/context/repository.js';
import { DevdigestDocsRepository } from '../modules/context/repository/devdigest-docs.repo.js';
import type { ContextRepositoryPort, DevdigestDocsRepositoryPort } from '../modules/context/ports.js';
import { ProjectContextService } from '../modules/context/service.js';

/**
 * DI container. One per app instance. Holds config, db, the JobRunner,
 * the SSE bus, and lazily-constructed adapters resolved through SecretsProvider.
 *
 * Tests construct a container with `overrides` to inject mock adapters; the
 * Services depend on these interfaces, not the concrete classes.
 */
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
  /** Skills storage — tests inject an in-memory fake. */
  skillsRepo?: SkillsRepositoryPort;
  /** Conventions storage — tests inject an in-memory fake. */
  conventionsRepo?: ConventionsRepositoryPort;
  /** Intent storage — tests inject an in-memory fake. */
  intentRepo?: IntentRepositoryPort;
  /** Blast storage — tests inject an in-memory fake. */
  blastRepo?: BlastRepositoryPort;
  /** PR brief storage — tests inject an in-memory fake. */
  briefRepo?: BriefRepositoryPort;
  /** Markdown lister for the Project Context Folder — tests inject a fake. */
  docWalker?: DocWalker;
  /** Project-context attachment storage — tests inject an in-memory fake. */
  contextRepo?: ContextRepositoryPort;
  /** DevDigest-owned docs storage — tests inject an in-memory fake. */
  devdigestDocsRepo?: DevdigestDocsRepositoryPort;
}

export class Container {
  readonly config: AppConfig;
  readonly db: Db;
  readonly secrets: SecretsProvider;
  readonly auth: AuthProvider;
  readonly jobs: JobRunner;
  readonly runBus: RunBus;

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
  private _skillsRepo?: SkillsRepositoryPort;
  private _conventionsRepo?: ConventionsRepositoryPort;
  private _intentRepo?: IntentRepositoryPort;
  private _intent?: IntentService;
  private _blastRepo?: BlastRepositoryPort;
  private _blast?: BlastService;
  private _briefRepo?: BriefRepositoryPort;
  private _brief?: BriefService;
  private _docWalker?: DocWalker;
  private _contextRepo?: ContextRepositoryPort;
  private _devdigestDocsRepo?: DevdigestDocsRepositoryPort;
  private _projectContext?: ProjectContextService;
  private _repoIntel?: RepoIntel;
  private _depgraph?: DepGraph;
  private _tokenizer?: Tokenizer;
  private _priceBook?: PriceBook;

  constructor(config: AppConfig, db: Db, private overrides: ContainerOverrides = {}) {
    this.config = config;
    this.db = db;
    this.secrets = overrides.secrets ?? new LocalSecretsProvider(config.secretsPath);
    this.auth = overrides.auth ?? new LocalNoAuthProvider(db);
    this.runBus = runBus;
    this.jobs = new JobRunner(db);
  }

  get git(): GitClient {
    if (this.overrides.git) return this.overrides.git;
    this._git ??= new SimpleGitClient(this.config.cloneDir);
    return this._git;
  }

  get agentsRepo(): AgentsRepository {
    return (this._agentsRepo ??= new AgentsRepository(this.db));
  }

  get reviewRepo(): ReviewRepository {
    return (this._reviewRepo ??= new ReviewRepository(this.db));
  }

  /** Skills storage — the skills module and the review executor (prompt skills). */
  get skillsRepo(): SkillsRepositoryPort {
    if (this.overrides.skillsRepo) return this.overrides.skillsRepo;
    return (this._skillsRepo ??= new SkillsRepository(this.db));
  }

  /** Conventions Extractor storage (conventions module). */
  get conventionsRepo(): ConventionsRepositoryPort {
    if (this.overrides.conventionsRepo) return this.overrides.conventionsRepo;
    return (this._conventionsRepo ??= new ConventionsRepository(this.db));
  }

  /** PR intent storage (intent module). */
  get intentRepo(): IntentRepositoryPort {
    if (this.overrides.intentRepo) return this.overrides.intentRepo;
    return (this._intentRepo ??= new IntentRepository(this.db));
  }

  /** PR intent service (lazy singleton: holds the single-flight map). */
  get intent(): IntentService {
    return (this._intent ??= new IntentService(this));
  }

  /** Blast radius storage (blast module). */
  get blastRepo(): BlastRepositoryPort {
    if (this.overrides.blastRepo) return this.overrides.blastRepo;
    return (this._blastRepo ??= new BlastRepository(this.db));
  }

  /** Blast radius service (the brief reads it; the blast routes keep their own instance). */
  get blast(): BlastService {
    return (this._blast ??= new BlastService(this));
  }

  /** PR brief storage (brief module). */
  get briefRepo(): BriefRepositoryPort {
    if (this.overrides.briefRepo) return this.overrides.briefRepo;
    return (this._briefRepo ??= new BriefRepository(this.db));
  }

  /** PR brief service (lazy singleton: holds the single-flight map). */
  get brief(): BriefService {
    return (this._brief ??= new BriefService(this));
  }

  /** Lists markdown files of a local clone (Project Context Folder). */
  get docWalker(): DocWalker {
    if (this.overrides.docWalker) return this.overrides.docWalker;
    return (this._docWalker ??= new FsDocWalker());
  }

  /** Agent ↔ doc attachments per repo (context module). */
  get contextRepo(): ContextRepositoryPort {
    if (this.overrides.contextRepo) return this.overrides.contextRepo;
    return (this._contextRepo ??= new ContextRepository(this.db));
  }

  /** DevDigest-owned docs (`.devdigest/specs/`) storage (context module). */
  get devdigestDocsRepo(): DevdigestDocsRepositoryPort {
    if (this.overrides.devdigestDocsRepo) return this.overrides.devdigestDocsRepo;
    return (this._devdigestDocsRepo ??= new DevdigestDocsRepository(this.db));
  }

  /** Project Context Folder service — the context routes and the review executor. */
  get projectContext(): ProjectContextService {
    return (this._projectContext ??= new ProjectContextService(this));
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
    if (this.overrides.repoIntel) return this.overrides.repoIntel;
    this._repoIntel ??= new RepoIntelService(this);
    return this._repoIntel;
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
    this._github = new OctokitGitHubClient(token);
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

  /**
   * Provider for the PR brief: for OpenRouter (the default) 60 s per call and
   * 0 transport retries, so one generation is at most 1 call + 1 validation
   * retry. OpenAI / Anthropic are built as `llm()` builds them (adapters
   * unchanged; they may retry transport errors). Cached under `brief:<id>`.
   */
  async briefLlm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    const injected = this.overrides.llm?.[id];
    if (injected) return injected;
    const cacheKey = `brief:${id}`;
    const cached = this.llmCache.get(cacheKey);
    if (cached) return cached;
    let provider: LLMProvider;
    if (id === 'openrouter') {
      const key = await this.secrets.get('OPENROUTER_API_KEY');
      if (!key) throw new ConfigError('OPENROUTER_API_KEY is not configured');
      provider = new OpenRouterProvider(key, {
        timeoutMs: BRIEF_LLM_TIMEOUT_MS,
        maxRetries: BRIEF_TRANSPORT_RETRIES,
        estimateCost: (model, tokensIn, tokensOut) =>
          this.priceBook.estimate(model, tokensIn, tokensOut),
      });
    } else {
      provider = await this.buildLlm(id);
    }
    this.llmCache.set(cacheKey, provider);
    return provider;
  }

  private async buildLlm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
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
