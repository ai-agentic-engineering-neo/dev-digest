/**
 * repo-intel — shared contract (Tier 1).
 *
 * This is the SINGLE interface every feature codes against. Library complexity
 * (@ast-grep/napi, dependency-cruiser, graphology, tokenizer) hides behind the
 * `RepoIntel` facade; features (reviews prompt-assembly, blast, onboarding,
 * conventions, phantom-gate, smart-diff) import THIS, never the libraries.
 *
 * Adapted to real code:
 *   - `repos.id` is a `uuid`, so every `repoId` here is a `string`.
 *   - facade-level rows (SymbolRow / SignatureRow / RefRow) mirror the read model.
 *   - adapter-level extraction types live with the astgrep adapter and stay
 *     compatible with `adapters/codeindex/extract.ts` (ExtractedSymbol/Reference).
 *
 * DEGRADED CONTRACT (lead decision — resolves the read-model vs degraded-contract ambiguity):
 *   - Object-returning methods carry an inline `degraded?: boolean` (+ optional
 *     `reason`). See BlastResult / IndexState / RepoMapResult.
 *   - Array-returning methods return `[]` when degraded. Empty = "no enrichment",
 *     which is exactly what every consumer already treats as the fallback path.
 *     The degraded *status/reason* is always observable via `getIndexState()`.
 * This keeps signatures natural (no `{ degraded, data }` wrappers at call sites)
 * while still guaranteeing every consumer can fall back without throwing.
 */

import type { CodeIndex, GitClient } from '@devdigest/shared';
import type { AppConfig } from '../../platform/config.js';
import type { Db } from '../../db/client.js';
import type { JobRunner } from '../../platform/jobs.js';
import type { DepGraph } from '../../adapters/depgraph/index.js';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';

/**
 * What repo-intel needs from the outside, declared here by the consumer.
 *
 * The DI container satisfies this structurally, so the module depends on a
 * capability set rather than on the composition root — which is also what
 * breaks the repo-intel -> container -> repo-intel import cycle.
 */
export interface RepoIntelDeps {
  readonly config: AppConfig;
  readonly db: Db;
  readonly git: GitClient;
  readonly codeIndex: CodeIndex;
  readonly jobs: JobRunner;
  readonly depgraph: DepGraph;
  readonly tokenizer: Tokenizer;
}

export type IndexStatus = 'full' | 'partial' | 'degraded' | 'failed';

export type DegradedReason =
  | 'flag_off'
  | 'index_failed'
  | 'index_partial'
  | 'repo_too_large'
  | 'no_data';

export interface IndexResult {
  status: IndexStatus;
  filesIndexed: number;
  filesSkipped: number;
  durationMs: number;
  reason?: string;
}

export interface IndexState extends IndexResult {
  repoId: string;
  lastIndexedSha: string;
  indexerVersion: number;
  updatedAt: Date;
  /** True when the layer is running on the ripgrep fallback. */
  degraded?: boolean;
  degradedReason?: DegradedReason;
}

// ---------------------------------------------------------------------------
// Blast radius (facade method `getBlastRadius`). Adopted by blast/service.ts in
// T2; in T1 the facade returns a degraded best-effort over container.codeIndex.
// ---------------------------------------------------------------------------

export interface BlastChangedSymbol {
  file: string;
  name: string;
  kind: string;
}

export interface BlastCallerRow {
  file: string;
  symbol: string;
  /** Which changed symbol this caller reaches. */
  viaSymbol: string;
  /** 1-based line of the reference (representative; for the BlastRadius view). */
  line: number;
  /** file_rank.rank of the caller file (0 in the degraded/ripgrep path). */
  rank: number;
}

export interface BlastResult {
  changedSymbols: BlastChangedSymbol[];
  callers: BlastCallerRow[];
  /** "METHOD /path" (via extractEndpoints / file_facts) — flat union. */
  impactedEndpoints: string[];
  /**
   * Per-caller-file precomputed facts, so consumers (blast) can attribute
   * endpoints/crons to the changed symbol whose callers live in that file.
   * Present on the persistent (non-degraded) path; absent otherwise.
   */
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: DegradedReason;
}

// ---------------------------------------------------------------------------
// Read-model rows.
// ---------------------------------------------------------------------------

export interface SymbolRow {
  file: string;
  name: string;
  kind: string;
  exported: boolean;
  startLine: number;
  endLine: number;
  signature: string | null;
}

export interface SignatureRow {
  file: string;
  symbol: string;
  signature: string;
  /** file_rank.rank of the caller (0 until T3). */
  rank: number;
}

export interface RefRow {
  refFile: string;
  refLine: number;
  symbolName: string;
  /** NULL = unresolved → candidate for the Phantom-gate. */
  declFile: string | null;
}

export interface FileRankRow {
  path: string;
  percentile: number;
}

// ---------------------------------------------------------------------------
// Convention extraction (L02) — the index read behind a conventions scan.
// ---------------------------------------------------------------------------

export type NamingStyle =
  | 'kebab-case'
  | 'camelCase'
  | 'PascalCase'
  | 'snake_case'
  | 'single-word'
  | 'other';

/** File-name style of one scope, e.g. `client *.tsx/jsx`: counts per style. */
export interface NamingFact {
  scope: string;
  total: number;
  styles: Partial<Record<NamingStyle, number>>;
}

/** Where the tests of one stratum live and how they are suffixed. */
export interface TestPlacementFact {
  scope: string;
  total: number;
  colocated: number;
  separateDir: number;
  suffixes: Record<string, number>;
}

/** Exported, top-level symbol kinds of one stratum (methods excluded). */
export interface ExportKindFact {
  scope: string;
  total: number;
  kinds: Record<string, number>;
}

/** How many import edges run from `from` to `to`. */
export interface DependencyFact {
  from: string;
  to: string;
  imports: number;
}

/**
 * Counts over the WHOLE index, so a model reading a dozen sample files can tell
 * a repo-wide pattern from a coincidence in its sample. Every field is derived
 * from tables the indexer already writes — no extra parse, no extra walk.
 */
export interface ConventionFacts {
  filesIndexed: number;
  edgesIndexed: number;
  /** 1 for a multi-package repo, 2 for a single package (see chooseStrataDepth). */
  strataDepth: number;
  /** The repo's parts, largest first: `server`, `client`… or `src/api`, `src/lib`… */
  strata: string[];
  /** File names that recur (`index.ts ×62`, `routes.ts ×10`) — the repo's roles. */
  recurringFileNames: Array<{ name: string; count: number }>;
  naming: NamingFact[];
  tests: TestPlacementFact[];
  exportKinds: ExportKindFact[];
  /** Imports between sibling files with recurring names: the layering, as counts. */
  siblingImports: DependencyFact[];
  /** Imports between directories two levels below each stratum. */
  directoryImports: DependencyFact[];
  degraded?: boolean;
  reason?: DegradedReason;
}

export interface RepoMapResult {
  text: string;
  tokens: number;
  cached: boolean;
  degraded?: boolean;
  reason?: DegradedReason;
}

/**
 * The facade. Studio (T2+) serves reads purely from the Postgres cache; T1 and
 * CI may parse diff-scoped on the hot path. Indexing runs through
 * JobRunner handlers in studio, inline in the CI runner.
 */
export interface RepoIntel {
  // --- Indexing -----------------------------------------------------------
  /** Full (re)index of a repo. */
  indexRepo(repoId: string): Promise<IndexResult>;
  /** Incremental update against the last indexed SHA. */
  refreshIndex(repoId: string): Promise<IndexResult>;
  /** Current index state — ALWAYS works, even degraded. */
  getIndexState(repoId: string): Promise<IndexState>;

  // --- Reads --------------------------------------------------------------
  getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastResult>;
  getRepoMap(repoId: string, tokenBudget?: number): Promise<RepoMapResult>;
  getFileRank(repoId: string, paths: string[]): Promise<FileRankRow[]>;
  getSymbolsInFiles(repoId: string, paths: string[]): Promise<SymbolRow[]>;
  getCallerSignatures(
    repoId: string,
    changedFiles: string[],
    limit?: number,
  ): Promise<SignatureRow[]>;
  /**
   * Unresolved references (= Phantom-gate fuel).
   * T1: diff-scoped, ephemeral (no persistent decl_file).
   * T2/T3: persistent `references.decl_file IS NULL`.
   */
  getUnresolvedReferences(repoId: string, files: string[]): Promise<RefRow[]>;
  /**
   * Up to N file paths for a conventions scan: ranked, filtered of tests,
   * configs and tooling folders, and INTERLEAVED across the repo's top-level
   * parts so that every prefix of the list is a fair sample (see
   * pipeline/convention-facts.ts). Callers may over-fetch and skip files.
   */
  getConventionSamples(repoId: string, n: number): Promise<string[]>;
  /** Whole-index counts that let a conventions scan judge how widespread a pattern is. */
  getConventionFacts(repoId: string): Promise<ConventionFacts>;

  // --- T3: onboarding reading-path + critical paths (graph required) ------
  getTopFilesByRank(
    repoId: string,
    n: number,
    opts?: { exclude?: string[] },
  ): Promise<string[]>;
  getCriticalPaths(repoId: string): Promise<string[][]>;
}
