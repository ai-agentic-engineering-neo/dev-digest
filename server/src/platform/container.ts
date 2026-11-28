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
import { parseUnifiedDiff } from '../adapters/git/diff-parser.js';
import { RipgrepCodeIndex } from '../adapters/codeindex/ripgrep.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
import { OpenAIEmbedder } from '../adapters/embedder/openai.js';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { estimateCost } from '../adapters/llm/pricing.js';
import { PriceBook } from './price-book.js';
import { NotConfiguredError } from './errors.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import { RepoRepository } from '../modules/repos/repository.js';
import { PullsRepository } from '../modules/pulls/repository.js';
import { ReviewRepository } from '../modules/reviews/repository.js';
import { SkillsRepository } from '../modules/skills/repository.js';
import { SkillsService } from '../modules/skills/service.js';
import { FflateArchiveReader, YamlFrontmatterParser } from '../adapters/skill-import/index.js';
import type { RepoIntel } from '../modules/repo-intel/types.js';
import { RepoIntelService } from '../modules/repo-intel/service.js';
import { RepoIntelRepository } from '../modules/repo-intel/repository.js';
import { runFullIndex } from '../modules/repo-intel/pipeline/full.js';
import { runIncremental } from '../modules/repo-intel/pipeline/incremental.js';
import {
  langForFile,
  parseImports,
  parseInvocationHeads,
  parseSymbols,
} from '../adapters/astgrep/index.js';
import { extractEndpoints } from '../adapters/codeindex/extract.js';
import { readContainedFile } from './contained-read.js';
import { type DepGraph, DepCruiseGraph } from '../adapters/depgraph/index.js';
import { type Tokenizer, TiktokenTokenizer } from '../adapters/tokenizer/index.js';

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
  private _repoStore?: RepoRepository;
  private _pullStore?: PullsRepository;
  private _reviewRepo?: ReviewRepository;
  private _skillsRepo?: SkillsRepository;
  private _skillsService?: SkillsService;
  private _repoIntelService?: RepoIntelService;
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
    this._git ??= new SimpleGitClient(this.config.cloneDir, {
      getToken: () => this.secrets.get('GITHUB_TOKEN'),
    });
    return this._git;
  }

  /** Unified-diff text → `UnifiedDiff`. Pure; lives with the git adapter. */
  readonly parseDiff = parseUnifiedDiff;

  get agentsRepo(): AgentsRepository {
    return (this._agentsRepo ??= new AgentsRepository(this.db));
  }

  /** The `repos` table. Shared by the repos and workspace modules. */
  get repoStore(): RepoRepository {
    return (this._repoStore ??= new RepoRepository(this.db));
  }

  /** Imported pull requests. Shared by the pulls and polling modules. */
  get pullStore(): PullsRepository {
    return (this._pullStore ??= new PullsRepository(this.db));
  }

  get reviewRepo(): ReviewRepository {
    return (this._reviewRepo ??= new ReviewRepository(this.db));
  }

  /**
   * Skills and their versions (M2). The skills service writes through it; the
   * agents module checks link ids and reads link display fields with it.
   */
  get skillsRepo(): SkillsRepository {
    return (this._skillsRepo ??= new SkillsRepository(this.db));
  }

  /**
   * Skills use cases (M2). Shared: the skills routes serve it, and the review
   * run reads `effectiveSkills` from it (agent link ids from `agentsRepo`,
   * skill content from `skillsRepo`).
   */
  get skillsService(): SkillsService {
    return (this._skillsService ??= new SkillsService({
      skills: this.skillsRepo,
      tokens: this.tokenizer,
      archive: this.skillArchive,
      frontmatter: this.skillFrontmatter,
      links: this.agentsRepo,
    }));
  }

  /** In-memory zip reader for the skill import (M2). Stateless. */
  readonly skillArchive = new FflateArchiveReader();

  /** YAML frontmatter parser for the skill import (M2). Stateless. */
  readonly skillFrontmatter = new YamlFrontmatterParser();

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
    return this.overrides.repoIntel ?? this.repoIntelService;
  }

  /**
   * The real repo-intel service. It owns the index/refresh/resync job
   * handlers, so the routes plugin uses it even when a test replaces the read
   * facade above. Composed here: the store, the indexing pipeline, the
   * parsers and the clone reader are infrastructure the service only knows as
   * ports. Adapters are reached through the getters at call time, so test
   * overrides and lazy construction behave as before.
   */
  get repoIntelService(): RepoIntelService {
    if (this._repoIntelService) return this._repoIntelService;
    const store = new RepoIntelRepository(this.db);
    this._repoIntelService = new RepoIntelService({
      store,
      indexer: {
        runFull: (repoId) => runFullIndex(this, store, { repoId }),
        runIncremental: (repoId) => runIncremental(this, store, { repoId }),
      },
      parser: { langForFile, parseSymbols, parseImports, parseInvocationHeads, extractEndpoints },
      readCloneFile: readContainedFile,
      git: { sync: (repo, branch) => this.git.sync(repo, branch) },
      codeIndex: {
        symbols: (repo) => this.codeIndex.symbols(repo),
        references: (repo, symbol) => this.codeIndex.references(repo, symbol),
      },
      jobs: this.jobs,
      enabled: this.config.repoIntelEnabled,
    });
    return this._repoIntelService;
  }

  /** Import-graph builder (dependency-cruiser). T3 indexer pipeline only. */
  get depgraph(): DepGraph {
    if (this.overrides.depgraph) return this.overrides.depgraph;
    this._depgraph ??= new DepCruiseGraph();
    return this._depgraph;
  }

  /** Token counter (js-tiktoken): repo-map budget, skill token counts, run skill tokens. */
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
    if (!token) throw new NotConfiguredError('GITHUB_TOKEN is not configured');
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
   * S11 (security hardening) — a provider built from a CANDIDATE key,
   * neither read from nor written to the secrets store and not cached. Used
   * by "Test connection" so a typo is verified before it can overwrite a
   * working key.
   */
  async llmWithKey(id: 'openai' | 'anthropic' | 'openrouter', key: string): Promise<LLMProvider> {
    const injected = this.overrides.llm?.[id];
    if (injected) return injected;
    return this.buildLlm(id, key);
  }

  /** S11 — a GitHub client for a candidate token, not persisted or cached. */
  githubWithToken(token: string): GitHubClient {
    return this.overrides.github ?? new OctokitGitHubClient(token);
  }

  private async buildLlm(
    id: 'openai' | 'anthropic' | 'openrouter',
    keyOverride?: string,
  ): Promise<LLMProvider> {
    if (id === 'openai') {
      const key = keyOverride ?? (await this.secrets.get('OPENAI_API_KEY'));
      if (!key) throw new NotConfiguredError('OPENAI_API_KEY is not configured');
      return new OpenAIProvider(key);
    }
    if (id === 'openrouter') {
      // Single OpenRouter provider lives in reviewer-core (shared with the CI
      // runner); inject the PriceBook so cost attribution uses LIVE OpenRouter
      // prices (with the static table as a fallback) rather than a hardcoded one.
      const key = keyOverride ?? (await this.secrets.get('OPENROUTER_API_KEY'));
      if (!key) throw new NotConfiguredError('OPENROUTER_API_KEY is not configured');
      return new OpenRouterProvider(key, {
        estimateCost: (model, tokensIn, tokensOut) =>
          this.priceBook.estimate(model, tokensIn, tokensOut),
      });
    }
    const key = keyOverride ?? (await this.secrets.get('ANTHROPIC_API_KEY'));
    if (!key) throw new NotConfiguredError('ANTHROPIC_API_KEY is not configured');
    return new AnthropicProvider(key);
  }

  async embedder(): Promise<Embedder> {
    // Injected embedders (tests) always win. Otherwise embeddings are gated by
    // config: when disabled we throw BEFORE constructing the OpenAI client, so
    // the app makes ZERO OpenAI requests. All callers wrap this in try/catch and
    // degrade gracefully (memory/RAG simply returns no hits).
    if (this.overrides.embedder) return this.overrides.embedder;
    if (!this.config.embeddingsEnabled) {
      throw new NotConfiguredError('Embeddings are disabled (set EMBEDDINGS_ENABLED=true to enable memory/RAG)');
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
