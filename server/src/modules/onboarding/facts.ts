import type { RepoIntelPort } from './ports.js';
import { detectStack, emptyStackFacts, type StackFacts } from './stack.js';
import { collectSetupCandidates, type SetupCandidate } from './setup.js';
import {
  CRITICAL_PATHS_MAX,
  DEFAULT_HOTNESS_WINDOW_DAYS,
  FACT_ALL_PATHS_POOL,
  FACT_CRONS_MAX,
  FACT_DIR_DEPTH,
  FACT_DIR_ENTRIES,
  FACT_RANKED_FILES,
  FACT_ROUTES_MAX,
  READING_PATH_MAX,
} from './constants.js';

/**
 * AC-1/AC-3/AC-5/AC-18: assemble the WHOLE deterministic fact set for a
 * repository — zero LLM calls on this path, by construction (nothing here
 * touches `LlmResolver`). Structure comes from the index (via `RepoIntelPort`)
 * plus a handful of containment-checked checkout reads (`stack.ts`/
 * `setup.ts`) — never a fresh unbounded filesystem walk.
 */

export interface RankedFileFact {
  path: string;
  pagerank: number;
  hotness: number;
  weighted: number;
}

export interface RouteFact {
  file: string;
  endpoints: string[];
  crons: string[];
}

export interface ReadingPathEntry {
  path: string;
  weighted: number;
}

export interface CriticalPathChain {
  /** The chain's highest-weighted seed file — the only sensible link target. */
  root: string;
  /** Root first, then each hop in walk order. */
  chain: string[];
}

export interface CoverageFacts {
  filesIndexed: number;
  filesExcluded: number;
  indexStatus: string;
  indexReason?: string;
  indexSha: string;
  indexUpdatedAt?: Date;
  indexerVersion: number;
  prsWeighted: number;
  hotnessWindowDays: number;
}

export interface FactSet {
  stack: StackFacts;
  setupCandidates: SetupCandidate[];
  /** Directory skeleton — repo-relative directory prefixes, depth ≤
   *  `FACT_DIR_DEPTH`, bounded to `FACT_DIR_ENTRIES`. */
  directory: string[];
  /** The candidate pool named in the payload (`FACT_RANKED_FILES`). */
  rankedFiles: RankedFileFact[];
  routes: RouteFact[];
  /** Top `READING_PATH_MAX` of `rankedFiles`, in weighted order. */
  readingPath: ReadingPathEntry[];
  criticalPaths: CriticalPathChain[];
  coverage: CoverageFacts;
  /**
   * The FULL indexed path set (up to `FACT_ALL_PATHS_POOL`), used ONLY by
   * grounding to check "is this path present in the index" — never sent to
   * the model. NOTE (judgment call, `FACT_ALL_PATHS_POOL`'s doc comment):
   * sourced from `getWeightedRankedFiles`, which junk-filters (drops tests/
   * configs/migrations/generated paths) — a real but junk-filtered file will
   * read as "not indexed" to grounding. Over-strict, not a security gap.
   */
  allIndexedPaths: Set<string>;
}

export interface AssembleFactsInput {
  repoId: string;
  /** `null` when the repo has no synced checkout yet (AC-37's empty state). */
  clonePath: string | null;
  repoIntel: RepoIntelPort;
}

export async function assembleFacts(input: AssembleFactsInput): Promise<FactSet> {
  const { repoId, clonePath, repoIntel } = input;

  const [state, stack, setupCandidates, allPathsRows] = await Promise.all([
    repoIntel.getIndexState(repoId),
    clonePath ? detectStack(clonePath) : Promise.resolve(emptyStackFacts()),
    clonePath ? collectSetupCandidates(clonePath) : Promise.resolve([]),
    repoIntel.getWeightedRankedFiles(repoId, FACT_ALL_PATHS_POOL),
  ]);

  const allIndexedPaths = new Set(allPathsRows.map((r) => r.path));
  const directory = deriveDirectorySkeleton(
    allPathsRows.map((r) => r.path),
    FACT_DIR_ENTRIES,
    FACT_DIR_DEPTH,
  );

  const rankedFiles: RankedFileFact[] = allPathsRows.slice(0, FACT_RANKED_FILES).map((r) => ({
    path: r.path,
    pagerank: r.pagerank,
    hotness: r.hotness,
    weighted: r.weighted,
  }));

  const readingPath: ReadingPathEntry[] = rankedFiles
    .slice(0, READING_PATH_MAX)
    .map((r) => ({ path: r.path, weighted: r.weighted }));

  const criticalChains = await repoIntel.getCriticalPaths(repoId, {
    order: 'weighted',
    roots: CRITICAL_PATHS_MAX,
  });
  const criticalPaths: CriticalPathChain[] = criticalChains
    .filter((chain) => chain.length > 0)
    .map((chain) => ({ root: chain[0]!, chain }));

  const routes = await collectRoutes(
    repoIntel,
    repoId,
    rankedFiles.map((r) => r.path),
  );

  const coverage: CoverageFacts = {
    filesIndexed: state.filesIndexed,
    filesExcluded: state.filesExcludedByBound ?? 0,
    indexStatus: state.status,
    ...(state.reason !== undefined ? { indexReason: state.reason } : {}),
    indexSha: state.lastIndexedSha,
    ...(state.updatedAt !== undefined ? { indexUpdatedAt: state.updatedAt } : {}),
    indexerVersion: state.indexerVersion,
    prsWeighted: state.hotnessPrs ?? 0,
    hotnessWindowDays: state.hotnessWindowDays ?? DEFAULT_HOTNESS_WINDOW_DAYS,
  };

  return {
    stack,
    setupCandidates,
    directory,
    rankedFiles,
    routes,
    readingPath,
    criticalPaths,
    coverage,
    allIndexedPaths,
  };
}

/** From `file_facts`, for the ranked pool only (`FACT_ROUTES_MAX` files);
 *  crons are capped to `FACT_CRONS_MAX` TOTAL across every returned file
 *  (endpoints are never capped — they're the primary fact, crons the
 *  secondary one). */
async function collectRoutes(
  repoIntel: RepoIntelPort,
  repoId: string,
  rankedPaths: string[],
): Promise<RouteFact[]> {
  const candidatePaths = rankedPaths.slice(0, FACT_ROUTES_MAX);
  if (candidatePaths.length === 0) return [];
  const rows = await repoIntel.getFileFacts(repoId, candidatePaths);
  const nonEmpty = rows.filter((r) => r.endpoints.length > 0 || r.crons.length > 0);

  let cronBudget = FACT_CRONS_MAX;
  const out: RouteFact[] = [];
  for (const r of nonEmpty) {
    const crons = cronBudget > 0 ? r.crons.slice(0, cronBudget) : [];
    cronBudget -= crons.length;
    out.push({ file: r.file, endpoints: r.endpoints, crons });
  }
  return out;
}

/** Directory prefixes of `paths`, depth ≤ `maxDepth`, sorted, bounded to
 *  `maxEntries`. Pure — derived from already-fetched index paths, never a
 *  filesystem call (AC-3). */
function deriveDirectorySkeleton(paths: string[], maxEntries: number, maxDepth: number): string[] {
  const dirs = new Set<string>();
  for (const p of paths) {
    const segments = p.split('/');
    segments.pop(); // drop the filename
    for (let depth = 1; depth <= Math.min(maxDepth, segments.length); depth++) {
      const prefix = segments.slice(0, depth).join('/');
      if (prefix) dirs.add(prefix);
    }
  }
  return [...dirs].sort().slice(0, maxEntries);
}
