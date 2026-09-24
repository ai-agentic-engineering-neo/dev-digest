/**
 * repo-intel domain rules — pure functions the facade's use cases apply to
 * data they loaded through ports. No I/O, no DB, no parser.
 */
import type { CodeSymbol } from '@devdigest/shared';
import type { FullSymbolRow, IndexerEdgeRow, InvocationHead } from './model.js';

/**
 * GLOBALS allowlist — common JS/TS builtins + runtime that appear as bare
 * invocations and are NOT phantoms. Tuned for PRECISION (false-positive cost
 * > false-negative cost): better to under-flag than to spam reviewers.
 */
export const PHANTOM_GLOBALS_ALLOWLIST: ReadonlySet<string> = new Set([
  // Console / process / runtime
  'console', 'process', 'globalThis', 'require', 'module', 'exports',
  '__dirname', '__filename',
  // Math/JSON
  'Math', 'JSON',
  // Core ctors
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'Promise',
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Date', 'RegExp', 'Proxy', 'Reflect',
  'BigInt',
  // Timers / microtask
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'setImmediate', 'clearImmediate', 'queueMicrotask', 'structuredClone',
  // Web/Fetch standard
  'fetch', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder',
  'AbortController', 'AbortSignal', 'Headers', 'Request', 'Response',
  'FormData', 'Blob', 'File', 'FileReader',
  // Node
  'Buffer',
  // Browser globals
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage',
  'performance', 'crypto', 'location', 'history',
  // Numeric coercion / URI
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  // Misc keywords-that-parse-as-identifiers
  'super', 'this', 'arguments', 'undefined', 'NaN', 'Infinity',
  // Test/runtime affordances (vitest/jest globals; harmless to allow)
  'describe', 'it', 'test', 'expect', 'beforeAll', 'beforeEach',
  'afterAll', 'afterEach', 'vi', 'jest',
]);

/**
 * Invocation heads of one file that are PHANTOM: not declared in the file, not
 * imported by it, and not a known runtime/builtin global.
 */
export function phantomHeads(
  heads: InvocationHead[],
  knownNames: ReadonlySet<string>,
): InvocationHead[] {
  return heads.filter((h) => !knownNames.has(h.name) && !PHANTOM_GLOBALS_ALLOWLIST.has(h.name));
}

/**
 * Path kinds excluded from rank-driven file samples (conventions/onboarding):
 * tests, configs, declaration files, migrations, generated dirs. Substring
 * match on the repo-relative path (deliberately simple + deterministic).
 */
const JUNK_PATH_PATTERNS = [
  '.test.',
  '.spec.',
  '.d.ts',
  '__tests__/',
  '__mocks__/',
  '/test/',
  '/tests/',
  '/migrations/',
  '/__fixtures__/',
  '.config.',
  'vitest.',
  'jest.',
  'eslint',
  'prettier',
] as const;

export function isJunkPath(path: string): boolean {
  const lower = path.toLowerCase();
  return JUNK_PATH_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Top-N paths from a rank-DESC list, dropping junk paths and any path that
 * contains one of the caller's `exclude` substrings.
 */
export function pickTopFiles(
  ranked: ReadonlyArray<{ path: string }>,
  n: number,
  exclude: readonly string[] = [],
): string[] {
  const out: string[] = [];
  for (const r of ranked) {
    if (isJunkPath(r.path)) continue;
    if (exclude.some((e) => r.path.includes(e))) continue;
    out.push(r.path);
    if (out.length >= n) break;
  }
  return out;
}

/** Enclosing top-level (bare-name) symbol for a line, from persistent rows. */
export function enclosingFromRows(rows: FullSymbolRow[], line: number): string | null {
  const hit = rows
    .filter((s) => !s.name.includes('.') && (s.line ?? 0) <= line)
    .sort((a, b) => (b.line ?? 0) - (a.line ?? 0))[0];
  return hit?.name ?? null;
}

/**
 * Best-effort: name the enclosing top-level symbol of a reference line, falling
 * back to the file's basename (mirrors the legacy blast `callerName`).
 */
export function enclosingSymbolName(
  allSymbols: CodeSymbol[],
  fromPath: string,
  line: number,
): string {
  const inFile = allSymbols
    .filter((s) => s.path === fromPath && s.line <= line && !s.name.includes('.'))
    .sort((a, b) => b.line - a.line);
  return inFile[0]?.name ?? fromPath.split('/').pop() ?? fromPath;
}

/**
 * Dependency chains from the highest-ranked files (onboarding reading-path).
 * For each of the first `rootCount` ranked files, greedily follow the
 * highest-ranked import target up to `depth` hops. Chains shorter than 2 and
 * duplicates are dropped.
 */
export function criticalPaths(
  edges: IndexerEdgeRow[],
  ranked: ReadonlyArray<{ path: string; rank: number }>,
  opts: { rootCount: number; depth: number },
): string[][] {
  const rankOf = new Map(ranked.map((r) => [r.path, r.rank]));
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const arr = adj.get(e.fromFile);
    if (arr) arr.push(e.toFile);
    else adj.set(e.fromFile, [e.toFile]);
  }

  const paths: string[][] = [];
  const seenPaths = new Set<string>();
  for (const { path: root } of ranked.slice(0, opts.rootCount)) {
    const chain = [root];
    const inChain = new Set(chain);
    let cur = root;
    for (let d = 0; d < opts.depth; d += 1) {
      const next = (adj.get(cur) ?? [])
        .filter((t) => !inChain.has(t))
        .sort((a, b) => (rankOf.get(b) ?? 0) - (rankOf.get(a) ?? 0))[0];
      if (!next) break;
      chain.push(next);
      inChain.add(next);
      cur = next;
    }
    if (chain.length < 2) continue;
    const key = chain.join('>');
    if (seenPaths.has(key)) continue;
    seenPaths.add(key);
    paths.push(chain);
  }
  return paths;
}
