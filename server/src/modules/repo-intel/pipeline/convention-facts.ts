/**
 * repo-intel — the index read for convention extraction.
 *
 * Two pure pieces, both computed from data the indexer already stored:
 *
 *   - **stratified sampling** — PageRank alone puts the most-imported files
 *     first, and in a monorepo those all live in one package (a first real scan
 *     of this repository sampled seven server files, five client files and none
 *     of reviewer-core or e2e). Interleaving by top-level package keeps every
 *     part of the codebase in the reading list and still orders each part by
 *     rank.
 *   - **measured facts** — counts over the WHOLE index (every file, every
 *     import edge, every exported symbol), so a model that reads twelve files
 *     can still tell a repo-wide pattern from a coincidence in its sample.
 *
 * No DB, no fs, no clock: paths, edges and symbols in, plain data out.
 */
import type {
  ConventionFacts,
  DependencyFact,
  ExportKindFact,
  NamingFact,
  NamingStyle,
  TestPlacementFact,
} from '../types.js';

/** Most strata the sample interleaves; a repo with more is ranked and cut. */
export const MAX_STRATA = 8;

/** A naming / export row is reported only when its scope has this many files. */
const MIN_SCOPE_FILES = 5;

/** A file name counts as a recurring role (`routes.ts`, `styles.ts`) from this many copies. */
const MIN_RECURRING = 3;

/** Rows per fact list, so the prompt section stays a paragraph, not a report. */
const MAX_ROWS = 12;

/** An import direction seen once is an accident, not a convention. */
const MIN_EDGE_COUNT = 2;

const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/i;
const TEST_DIR_SEGMENTS = new Set(['test', 'tests', '__tests__', 'spec', '__specs__']);

/** Repo-level tooling folders (`.github`, `.claude`) are not the app's code. */
export function isToolingPath(path: string): boolean {
  return path.split('/').some((segment) => segment.startsWith('.'));
}

export function isTestPath(path: string): boolean {
  if (TEST_FILE_RE.test(path)) return true;
  return path.split('/').slice(0, -1).some((s) => TEST_DIR_SEGMENTS.has(s.toLowerCase()));
}

/**
 * How deep a path has to be read to tell the repository's parts apart.
 *
 * Depth 1 when the repo has at least two top-level directories holding code
 * (a monorepo: `server/`, `client/`). Depth 2 otherwise, so a single-package
 * repo splits by `src/api`, `src/lib` instead of lumping everything under `src`.
 */
export function chooseStrataDepth(paths: string[]): number {
  const top = new Set<string>();
  for (const p of paths) {
    const parts = p.split('/');
    if (parts.length > 1) top.add(parts[0]!);
  }
  return top.size >= 2 ? 1 : 2;
}

/** The stratum a file belongs to: its directory prefix at `depth`, or `.` at the root. */
export function stratumOf(path: string, depth: number): string {
  const dirs = path.split('/').slice(0, -1);
  if (dirs.length === 0) return '.';
  return dirs.slice(0, depth).join('/');
}

/**
 * Order ranked files so that every prefix of the result is a fair sample.
 *
 * Round one takes the best file of each stratum, so a small package is never
 * starved. After that, slots go to strata in proportion to their size by the
 * Sainte-Laguë rule (pick the stratum maximising size / (2·taken + 1)), which is
 * what keeps a 176-file client from being matched one-for-one by a 2-file e2e
 * folder. Inside a stratum, rank order is preserved.
 *
 * `rankedDesc` must already be sorted best-first; the result is a permutation of it.
 */
export function interleaveByStratum<T extends { path: string }>(
  rankedDesc: T[],
  depth: number,
  maxStrata: number = MAX_STRATA,
): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rankedDesc) {
    const key = stratumOf(row.path, depth);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  // Map insertion order = order of each stratum's best file, i.e. by rank.
  const keys = [...groups.keys()].slice(0, maxStrata);
  const taken = new Map(keys.map((k) => [k, 0]));
  const out: T[] = [];

  for (const key of keys) {
    out.push(groups.get(key)![0]!);
    taken.set(key, 1);
  }

  const total = keys.reduce((sum, k) => sum + groups.get(k)!.length, 0);
  while (out.length < total) {
    let best: string | null = null;
    let bestScore = -1;
    for (const key of keys) {
      const group = groups.get(key)!;
      const n = taken.get(key)!;
      if (n >= group.length) continue;
      const score = group.length / (2 * n + 1);
      if (score > bestScore) {
        bestScore = score;
        best = key;
      }
    }
    if (best === null) break;
    const n = taken.get(best)!;
    out.push(groups.get(best)![n]!);
    taken.set(best, n + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Measured facts
// ---------------------------------------------------------------------------

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function dirName(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/** File stem without ANY extension: `run-executor.it.test.ts` → `run-executor`. */
function stemOf(path: string): string {
  const base = baseName(path);
  const dot = base.indexOf('.', 1);
  return dot === -1 ? base : base.slice(0, dot);
}

/** Everything after the stem: `.it.test.ts`, `.tsx`, `.d.ts`. */
function suffixOf(path: string): string {
  const base = baseName(path);
  const dot = base.indexOf('.', 1);
  return dot === -1 ? '' : base.slice(dot);
}

export function namingStyleOf(stem: string): NamingStyle {
  if (/^[a-z0-9]+$/.test(stem)) return 'single-word';
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(stem)) return 'kebab-case';
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(stem)) return 'snake_case';
  if (/^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(stem)) return 'camelCase';
  if (/^[A-Z][A-Za-z0-9]*$/.test(stem)) return 'PascalCase';
  return 'other';
}

/** `.tsx`/`.jsx` files are components in most codebases and are named by a different rule. */
function extGroup(path: string): string {
  return /\.[jt]sx$/i.test(path) ? '*.tsx/jsx' : '*.ts/js';
}

function tally<K extends string>(keys: K[]): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = (out[k] ?? 0) + 1;
  return out;
}

export interface ConventionFactsInput {
  /** Every indexed file (the rank table), tests included. */
  paths: string[];
  /** Resolved import edges, importer → imported. */
  edges: Array<{ fromFile: string; toFile: string }>;
  /** Exported, top-level symbols: one row per symbol. */
  exportedSymbols: Array<{ path: string; kind: string }>;
}

export function computeConventionFacts(input: ConventionFactsInput): ConventionFacts {
  const paths = input.paths.filter((p) => !isToolingPath(p));
  const depth = chooseStrataDepth(paths);
  const strataCounts = tally(paths.map((p) => stratumOf(p, depth)));
  const strata = Object.entries(strataCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_STRATA)
    .map(([k]) => k);
  const inStrata = new Set(strata);

  // ---- recurring file names (roles) --------------------------------------
  const nameCounts = tally(paths.map(baseName));
  const recurringFileNames = Object.entries(nameCounts)
    .filter(([, n]) => n >= MIN_RECURRING)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_ROWS)
    .map(([name, count]) => ({ name, count }));
  const recurring = new Set(recurringFileNames.map((r) => r.name));

  // ---- naming style per stratum × extension group -----------------------
  const namingBuckets = new Map<string, NamingStyle[]>();
  for (const p of paths) {
    const stem = stemOf(p);
    if (stem === 'index' || stem.startsWith('_') || isTestPath(p)) continue;
    const scope = `${stratumOf(p, depth)} ${extGroup(p)}`;
    if (!inStrata.has(stratumOf(p, depth))) continue;
    const list = namingBuckets.get(scope);
    const style = namingStyleOf(stem);
    if (list) list.push(style);
    else namingBuckets.set(scope, [style]);
  }
  const naming: NamingFact[] = [...namingBuckets.entries()]
    .filter(([, styles]) => styles.length >= MIN_SCOPE_FILES)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_ROWS)
    .map(([scope, styles]) => ({ scope, total: styles.length, styles: tally(styles) }));

  // ---- test placement per stratum -----------------------------------------
  const testsByStratum = new Map<string, string[]>();
  for (const p of paths) {
    if (!isTestPath(p)) continue;
    const key = stratumOf(p, depth);
    const list = testsByStratum.get(key);
    if (list) list.push(p);
    else testsByStratum.set(key, [p]);
  }
  const tests: TestPlacementFact[] = [...testsByStratum.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_ROWS)
    .map(([scope, files]) => {
      const separateDir = files.filter((f) =>
        f.split('/').slice(0, -1).some((s) => TEST_DIR_SEGMENTS.has(s.toLowerCase())),
      ).length;
      return {
        scope,
        total: files.length,
        colocated: files.length - separateDir,
        separateDir,
        // Only real test files carry a suffix worth counting; a helper under
        // `test/` (`test/helpers/pg.ts`) is placed like a test but named like code.
        suffixes: tally(files.filter((f) => TEST_FILE_RE.test(f)).map(suffixOf)),
      };
    });

  // ---- exported symbol kinds per stratum ---------------------------------
  const kindsByStratum = new Map<string, string[]>();
  for (const s of input.exportedSymbols) {
    // Methods are members, not module exports, and the indexer emits each one
    // twice (`Class.m` and `m`) — counting them would drown the real signal.
    if (s.kind === 'method' || isToolingPath(s.path) || isTestPath(s.path)) continue;
    const key = stratumOf(s.path, depth);
    if (!inStrata.has(key)) continue;
    const list = kindsByStratum.get(key);
    if (list) list.push(s.kind);
    else kindsByStratum.set(key, [s.kind]);
  }
  const exportKinds: ExportKindFact[] = [...kindsByStratum.entries()]
    .filter(([, kinds]) => kinds.length >= MIN_SCOPE_FILES)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([scope, kinds]) => ({ scope, total: kinds.length, kinds: tally(kinds) }));

  // ---- import directions ----------------------------------------------------
  // Between sibling files that play recurring roles (`routes.ts → service.ts`):
  // this is where a layering rule shows up as a number.
  const siblingPairs: string[] = [];
  // Between directories two levels below each stratum (`server/src/modules →
  // server/src/platform`): the coarse dependency direction of the codebase.
  const dirPairs: string[] = [];
  const dirDepth = depth + 2;
  const dirKey = (p: string) => {
    const dirs = dirName(p).split('/').filter(Boolean);
    return dirs.slice(0, dirDepth).join('/') || '.';
  };
  for (const e of input.edges) {
    if (isToolingPath(e.fromFile) || isToolingPath(e.toFile)) continue;
    // Tests import whatever they exercise, so their edges say nothing about
    // how the application is layered — and on a well-tested repo they would
    // be most of the list.
    if (isTestPath(e.fromFile)) continue;
    const fromBase = baseName(e.fromFile);
    const toBase = baseName(e.toFile);
    if (
      dirName(e.fromFile) === dirName(e.toFile) &&
      recurring.has(fromBase) &&
      recurring.has(toBase) &&
      fromBase !== toBase
    ) {
      siblingPairs.push(`${fromBase}\u0000${toBase}`);
    }
    const from = dirKey(e.fromFile);
    const to = dirKey(e.toFile);
    if (from !== to) dirPairs.push(`${from}\u0000${to}`);
  }
  const toDependencyFacts = (pairs: string[]): DependencyFact[] =>
    Object.entries(tally(pairs))
      .filter(([, n]) => n >= MIN_EDGE_COUNT)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_ROWS)
      .map(([key, imports]) => {
        const [from, to] = key.split('\u0000') as [string, string];
        return { from, to, imports };
      });

  return {
    filesIndexed: paths.length,
    edgesIndexed: input.edges.length,
    strataDepth: depth,
    strata,
    recurringFileNames,
    naming,
    tests,
    exportKinds,
    siblingImports: toDependencyFacts(siblingPairs),
    directoryImports: toDependencyFacts(dirPairs),
  };
}
