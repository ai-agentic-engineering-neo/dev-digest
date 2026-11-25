/** Phantom-API gate use case: bare invocations not declared, imported or builtin. */
import { extname } from 'node:path';
import { parseImports, parseInvocationHeads, parseSymbols } from '../../adapters/astgrep/index.js';
import { readClone } from './clone-read.js';
import type { RepoIntelDeps } from './deps.js';
import type { RefRow } from './types.js';
import { SUPPORTED_EXT } from './constants.js';

/**
 * GLOBALS allowlist — common JS/TS builtins + runtime that appear as bare
 * invocations and are NOT phantoms. Tune for PRECISION (false-positive cost
 * > false-negative cost). Anything we miss here can be added
 * later; everything we include here is widely-used baseline.
 *
 * Kept module-scoped (not re-built per call) so the `.has(name)` lookup stays
 * O(1) on the hot path. The list intentionally errs on the inclusive side for
 * standard globals — better to under-flag than to spam reviewers with noise.
 */
const PHANTOM_GLOBALS_ALLOWLIST: ReadonlySet<string> = new Set([
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
 * T1.3 — diff-scoped phantom-API gate fuel.
 *
 * For each changed file: collect bare invocation heads (astgrep
 * parseInvocationHeads). A head is PHANTOM iff it is NOT declared in this
 * file, NOT imported in this file, NOT a JS/TS keyword, and NOT a known
 * runtime/builtin global. `declFile` is intentionally `null` in T1 — Tier 1
 * is ephemeral (no persistent decl_file column; that lands in T2).
 *
 * Degraded gate: flag off, missing clone, or no parseable files → `[]`.
 * NEVER throws — per-file parse errors are swallowed.
 */
export async function getUnresolvedReferences(
  d: Pick<RepoIntelDeps, 'repository' | 'enabled'>,
  repoId: string,
  files: string[],
): Promise<RefRow[]> {
  if (!d.enabled) return [];
  if (files.length === 0) return [];

  const repo = await d.repository.getRepoBasics(repoId);
  if (!repo || !repo.clonePath) return [];

  const out: RefRow[] = [];

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!(SUPPORTED_EXT as readonly string[]).includes(ext)) continue;

    const source = await readClone(repo.clonePath, file);
    if (source == null) continue;

    let declared: ReturnType<typeof parseSymbols>;
    let imports: ReturnType<typeof parseImports>;
    let heads: ReturnType<typeof parseInvocationHeads>;
    try {
      declared = parseSymbols(file, source);
      imports = parseImports(file, source);
      heads = parseInvocationHeads(file, source);
    } catch {
      // Tree-sitter is lenient but a napi-level failure shouldn't blow up
      // the whole gate. Skip the file (= "no phantoms here" — conservative).
      continue;
    }

    // Build the "declared-or-imported" name set. parseSymbols already emits
    // both qualified (`Class.method`) and bare (`method`) forms, so a method
    // declared anywhere in the file is resolvable as the bare invocation.
    const knownNames = new Set<string>();
    for (const s of declared) knownNames.add(s.name);
    for (const i of imports) knownNames.add(i.name);

    for (const head of heads) {
      if (knownNames.has(head.name)) continue;
      if (PHANTOM_GLOBALS_ALLOWLIST.has(head.name)) continue;
      out.push({
        refFile: file,
        refLine: head.line,
        symbolName: head.name,
        declFile: null, // T1: ephemeral
      });
    }
  }

  return out;
}
