/**
 * RepoIntelService — T1.1 facade skeleton.
 *
 * Every method returns a DEGRADED-but-valid result (see types.ts header). The
 * only methods that do real work in T1 are:
 *   - `getBlastRadius`: best-effort port of blast/service.ts logic, mapped
 *     into the `BlastResult` shape (and always tagged `degraded: true,
 *     reason: 'no_data'`, because T1 has no persistent index yet).
 *   - `getIndexState`: queries `repo_index_state` if the table exists (T2+),
 *     otherwise synthesises a degraded row so callers never throw.
 *
 * Everything else returns `[]` (array methods) or a degraded object literal
 * (object methods). T1.2 wires the astgrep adapter into
 * `getUnresolvedReferences` and (via T1.3) `getCallerSignatures`. T2 fills in
 * the rank-driven methods. T3 unlocks `getCriticalPaths` etc.
 *
 * The constructor takes the repository and an explicit `RepoIntelDeps` bag
 * (git, codeIndex, jobs, resolver, tokenizer, repoIntelEnabled) — never the
 * DI Container. `platform/container.ts` is the composition point.
 */
import type { CodeSymbol, RepoRef } from '@devdigest/shared';
import type { RepoIntelDeps } from './deps.js';
import { extractEndpoints } from '../../adapters/codeindex/extract.js';
import {
  parseImports,
  parseInvocationHeads,
  parseSymbols,
  langForFile,
} from '../../adapters/astgrep/index.js';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { RepoIntelRepository, type IndexerEdgeRow } from './repository.js';
import { buildOverlay, overlaySource, type OverlayBuild } from './blast-overlay.js';
import { blastIndexInfo, emptyBlastGraphResult, toLegacyBlastResult } from './blast-legacy.js';
import { computeBlast } from './graph/blast.js';
import { computeChangedSymbols, type DeclRange } from './graph/changed.js';
import type {
  BlastCallerRow,
  BlastChangedSymbol,
  BlastGraphResult,
  BlastRadiusOpts,
  BlastRequest,
  BlastResult,
  FileRankRow,
  IndexResult,
  IndexState,
  RefRow,
  RepoIntel,
  RepoMapResult,
  SignatureRow,
  SymbolRow,
  WeightedFileRow,
} from './types.js';
import {
  BFS_DEPTH,
  BLAST_QUERY_CHUNK,
  DEFAULT_REPO_MAP_TOKEN_BUDGET,
  INDEX_JOB_KIND,
  INDEXER_VERSION,
  LOW_CONFIDENCE_VALUE_SHARE,
  MAX_CALLERS_PER_SYMBOL,
  MAX_DEGRADED_FILES_LISTED,
  MAX_INDEXED_FILES,
  REFRESH_JOB_KIND,
  RESYNC_JOB_KIND,
  SUPPORTED_EXT,
} from './constants.js';
import { runFullIndex, type IndexPayload } from './pipeline/full.js';
import { runIncremental } from './pipeline/incremental.js';

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

export class RepoIntelService implements RepoIntel {
  constructor(
    private readonly repo: RepoIntelRepository,
    private readonly deps: RepoIntelDeps,
  ) {}

  // -------------------------------------------------------------------------
  // Indexing — T2.2 worker. The job handlers (registered via
  // registerIndexJobHandlers below) are the ASYNC entry; these methods are
  // SYNC-from-the-handler (they ARE the handler body). HTTP/Repo callers go
  // through `container.jobs.enqueue(INDEX_JOB_KIND, ...)` so the clone job
  // closes promptly and the index runs in the background.
  // -------------------------------------------------------------------------

  /**
   * Run a full index of the repo INLINE (no enqueue). The job handler for
   * INDEX_JOB_KIND delegates to this, and tests / explicit calls can also
   * use it. The CI runner needs the synchronous variant — long-running CI
   * jobs already have their own time budget and don't want a second queue.
   */
  async indexRepo(repoId: string): Promise<IndexResult> {
    return runFullIndex(this.deps, this.repo, { repoId });
  }

  /**
   * Run an incremental refresh INLINE. Same enqueue/inline split as indexRepo.
   * If the persisted state is missing or its `indexerVersion` is stale, this
   * delegates to `runFullIndex` internally.
   */
  async refreshIndex(repoId: string): Promise<IndexResult> {
    return runIncremental(this.deps, this.repo, { repoId });
  }

  /**
   * Manual "re-analyze": advance the clone to `origin/<defaultBranch>` (so the
   * index reflects the latest code), then run an incremental refresh. The
   * incremental pass falls back to a full reindex internally when the diff base
   * is unreachable or the indexer version moved, so this is always
   * correct — never a destructive re-clone. Degrades (never throws) when the
   * repo isn't cloned yet or the fetch fails.
   */
  async resyncRepo(repoId: string): Promise<IndexResult> {
    const startedAt = Date.now();
    const repo = await this.repo.getRepoBasics(repoId);
    if (!repo || !repo.clonePath) {
      return { status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: Date.now() - startedAt, reason: 'no_clone' };
    }
    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    try {
      await this.deps.git.sync(ref, repo.defaultBranch);
    } catch (err) {
      return {
        status: 'degraded',
        filesIndexed: 0,
        filesSkipped: 0,
        durationMs: Date.now() - startedAt,
        reason: `sync_failed:${err instanceof Error ? err.message : String(err)}`,
      };
    }
    return runIncremental(this.deps, this.repo, { repoId });
  }

  /**
   * Register the INDEX_JOB_KIND + REFRESH_JOB_KIND handlers on the JobRunner.
   * Mirrors `RepoService.registerCloneJobHandler` so the registration is an
   * explicit one-shot at app startup (`repoIntel/routes.ts` invokes this).
   *
   * The handlers swallow the IndexResult on purpose — JobRunner expects
   * `Promise<void>`. Status/progress is observable via `repo_index_state`.
   */
  registerIndexJobHandlers(): void {
    this.deps.jobs.register(INDEX_JOB_KIND, async (payload) => {
      await this.indexRepo((payload as IndexPayload).repoId);
    });
    this.deps.jobs.register(REFRESH_JOB_KIND, async (payload) => {
      await this.refreshIndex((payload as IndexPayload).repoId);
    });
    this.deps.jobs.register(RESYNC_JOB_KIND, async (payload) => {
      await this.resyncRepo((payload as IndexPayload).repoId);
    });
    // Boot sweep (AC-15). Fire-and-forget WITH a catch: an unhandled rejection
    // here would take the whole API process down (plans/17 R1).
    if (this.deps.repoIntelEnabled) {
      void this.sweepStaleIndexes().catch(() => undefined);
    }
  }

  /**
   * Enqueue a full index for every repo whose stored indexer version differs
   * from the current one and mark it `reindex_state='queued'` (AC-15/16a).
   * Idempotent: reads never enqueue, and re-running just re-enqueues an
   * idempotent full index. A failed enqueue clears the queued marker so a
   * repo is never left claiming a reindex that no job will perform.
   */
  async sweepStaleIndexes(): Promise<number> {
    const stale = await this.repo.listReposWithStaleIndex(INDEXER_VERSION);
    let enqueued = 0;
    for (const { repoId, workspaceId } of stale) {
      try {
        await this.repo.setReindexProgress(repoId, 'queued', 0, 0);
        const job = await this.deps.jobs.enqueue(workspaceId, INDEX_JOB_KIND, { repoId });
        job.done.catch(() => undefined); // failures surface in repo_index_state / jobs
        enqueued += 1;
      } catch {
        await this.repo.clearReindexState(repoId).catch(() => undefined);
      }
    }
    return enqueued;
  }

  /**
   * ALWAYS works. If `repo_index_state` exists and has a row, returns it.
   * Otherwise synthesises a degraded row so callers can branch on `degraded`
   * without ever hitting a thrown error.
   */
  async getIndexState(repoId: string): Promise<IndexState> {
    const persisted = await this.repo.tryGetIndexState(repoId);
    if (persisted) return persisted;
    return {
      repoId,
      status: 'degraded',
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: 0,
      reason: 'no_data',
      lastIndexedSha: '',
      indexerVersion: INDEXER_VERSION,
      updatedAt: new Date(0),
      degraded: true,
      degradedReason: 'no_data',
    };
  }

  // -------------------------------------------------------------------------
  // Reads.
  // -------------------------------------------------------------------------

  /**
   * Blast radius — legacy list shape. Served from the persistent v3 graph via
   * `getBlastGraph` (+ `toLegacyBlastResult`); the v1 ripgrep fallback below runs
   * only when there is NO usable index (never indexed / failed / flag off).
   *
   * `opts` is the additive third argument: callers that have a diff pass
   * `files[].patch` (+ `headSha`) for hunk-precise changed symbols and the PR
   * overlay. Without it the whole of each file counts as changed (documented
   * legacy path, for callers that have no diff).
   */
  async getBlastRadius(
    repoId: string,
    changedFiles: string[],
    opts?: BlastRadiusOpts,
  ): Promise<BlastResult> {
    if (this.deps.repoIntelEnabled && changedFiles.length > 0) {
      const byPath = new Map((opts?.files ?? []).map((f) => [f.path, f] as const));
      const res = await this.getBlastGraph(repoId, {
        headSha: opts?.headSha ?? null,
        baseSha: opts?.baseSha ?? null,
        prNumber: opts?.prNumber ?? null,
        files: changedFiles.map((p) => byPath.get(p) ?? { path: p }),
        depth: opts?.depth,
        includeTypeOnly: opts?.includeTypeOnly,
      });
      if (!res.fallback) return toLegacyBlastResult(res);
    }
    return this.degradedBlast(repoId, changedFiles);
  }

  /**
   * Symbol-level PR impact graph (specs/18 AC-25…AC-33): persisted v3 edges +
   * in-memory head overlay, reverse reachability, caps and truncation.
   * Never throws for "no data" states — see `BlastGraphResult`.
   */
  async getBlastGraph(repoId: string, req: BlastRequest): Promise<BlastGraphResult> {
    const state = this.deps.repoIntelEnabled ? await this.repo.tryGetIndexState(repoId) : null;
    const quiet = (extra: Partial<BlastGraphResult> = {}): BlastGraphResult =>
      emptyBlastGraphResult(req, state, extra);

    if (!this.deps.repoIntelEnabled) return quiet({ fallback: 'flag_off' });
    if (!state) return quiet({ fallback: 'no_data' });
    // Reindexing wins over everything: empty result + progress, no data, no fallback (AC-16a).
    if (state.reindexing) return quiet({ reindexing: state.reindexing });
    if (state.status !== 'full' && state.status !== 'partial') {
      return quiet({ fallback: state.degradedReason ?? 'index_failed' });
    }
    if (req.files.length === 0) return quiet();

    const basics = await this.repo.getRepoBasics(repoId);
    const ref: RepoRef | null = basics ? { owner: basics.owner, name: basics.name } : null;

    const paths = [...new Set(req.files.flatMap((f) => (f.previousPath ? [f.path, f.previousPath] : [f.path])))];
    const baseRows = await this.repo.getSymbolRows(repoId, paths);
    const base = new Map<string, DeclRange[]>();
    for (const r of baseRows) {
      const line = r.line ?? 1;
      const d: DeclRange = { name: r.name, kind: r.kind, line, endLine: r.endLine ?? line };
      const arr = base.get(r.path);
      if (arr) arr.push(d);
      else base.set(r.path, [d]);
    }

    const overlay: OverlayBuild =
      req.headSha && ref
        ? await buildOverlay(
            {
              git: this.deps.git,
              resolver: this.deps.resolver,
              ref,
              root: basics?.clonePath ?? null,
              headSha: req.headSha,
              prNumber: req.prNumber,
              files: req.files,
              indexedPaths: await this.repo.getIndexedFilePaths(repoId),
              loadContext: () => this.repo.getGraphContext(repoId),
            },
            state.lastIndexedSha,
          )
        : { head: new Map(), replaced: new Set(), edges: [], degraded: [] };

    const head = new Map<string, DeclRange[]>();
    for (const [path, h] of overlay.head) head.set(path, h.facts.symbols);

    const changed = computeChangedSymbols({ files: req.files, base, head });
    const deletedIds = new Set(changed.filter((c) => c.deleted).map((c) => `${c.path}#${c.name}`));
    const source = overlaySource(
      {
        incomingEdges: (targets) => this.repo.getIncomingEdges(repoId, targets),
        fileFacts: async (ps) =>
          new Map(
            (await this.repo.getFileFacts(repoId, [...ps])).map(
              (f) => [f.filePath, { endpoints: f.endpoints, crons: f.crons }] as const,
            ),
          ),
        fileRanks: (ps) => this.repo.getFileRankValues(repoId, ps),
      },
      overlay,
      deletedIds,
    );
    const comp = await computeBlast(
      changed.map((c) => ({ path: c.path, name: c.name, kind: c.kind, deleted: c.deleted })),
      source,
      { depth: req.depth, includeTypeOnly: req.includeTypeOnly },
    );

    await this.attachDeclLines(repoId, comp.graph.nodes, head);

    // ---- list projection (untruncated) ----
    const callers: BlastCallerRow[] = [];
    const seenCaller = new Set<string>();
    for (const c of comp.directCallers) {
      const key = `${c.from.path}|${c.from.name}|${c.via.name}`;
      if (seenCaller.has(key)) continue;
      seenCaller.add(key);
      callers.push({ file: c.from.path, symbol: c.from.name, viaSymbol: c.via.name, line: c.line, rank: c.rank });
    }
    const endpoints = new Set<string>();
    const factsByFile: Record<string, { endpoints: string[]; crons: string[] }> = {};
    for (const f of comp.impactedFiles) {
      const facts = comp.facts.get(f);
      if (!facts || (facts.endpoints.length === 0 && facts.crons.length === 0)) continue;
      factsByFile[f] = { endpoints: [...facts.endpoints], crons: [...facts.crons] };
      for (const e of facts.endpoints) endpoints.add(e);
    }

    const degraded = [...overlay.degraded].sort();
    const value = state.coverage?.value;
    return {
      graph: comp.graph,
      overlay: {
        staleOverlay: req.baseSha === null || state.lastIndexedSha !== req.baseSha,
        overlayDegraded: degraded.length > 0,
        degradedFiles: degraded.slice(0, MAX_DEGRADED_FILES_LISTED),
        degradedCount: degraded.length,
        baseSha: req.baseSha,
        headSha: req.headSha ?? '',
        indexedSha: state.lastIndexedSha,
      },
      index: blastIndexInfo(state, value && value.total > 0 && value.resolved / value.total < LOW_CONFIDENCE_VALUE_SHARE),
      reindexing: null,
      changed: changed.map((c) => ({ file: c.path, name: c.name, kind: c.kind, deleted: c.deleted })),
      projection: { callers, impactedEndpoints: [...endpoints], factsByFile },
    };
  }

  /**
   * AC-42: give every kept, non-deleted node its declaration line at head so
   * the UI can link `file:line`. Overlay-parsed files use head declarations;
   * the rest are unchanged by the PR, so their indexed line is the head line.
   */
  private async attachDeclLines(
    repoId: string,
    nodes: BlastGraphResult['graph']['nodes'],
    head: ReadonlyMap<string, readonly DeclRange[]>,
  ): Promise<void> {
    const basePaths = [...new Set(nodes.filter((n) => !n.deleted && !head.has(n.path)).map((n) => n.path))];
    const baseLine = new Map<string, number>();
    if (basePaths.length > 0) {
      for (const r of await this.repo.getSymbolRows(repoId, basePaths)) {
        const key = `${r.path}#${r.name}`;
        if (!baseLine.has(key)) baseLine.set(key, r.line ?? 1);
      }
    }
    for (const n of nodes) {
      if (n.deleted) continue;
      const line = head.has(n.path)
        ? head.get(n.path)!.find((d) => d.name === n.name)?.line
        : baseLine.get(`${n.path}#${n.name}`);
      if (line != null && line > 0) n.line = line;
    }
  }

  /** v1 ripgrep best-effort blast — only for "no usable index". Tagged `degraded: true`. */
  private async degradedBlast(repoId: string, changedFiles: string[]): Promise<BlastResult> {
    const empty: BlastResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'no_data',
    };

    const repo = await this.repo.getRepoBasics(repoId);
    if (!repo || !repo.clonePath || changedFiles.length === 0) return empty;

    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    const changedSet = new Set(changedFiles);

    let allSymbols: CodeSymbol[];
    try {
      allSymbols = await this.deps.codeIndex.symbols(ref);
    } catch {
      return empty;
    }

    // changed symbols = declared in any changed file (dedup by name+file).
    const changedSymbols: BlastChangedSymbol[] = [];
    const seen = new Set<string>();
    for (const s of allSymbols) {
      if (!changedSet.has(s.path)) continue;
      const key = `${s.name}:${s.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      changedSymbols.push({ file: s.path, name: s.name, kind: s.kind });
    }

    const callerRows: BlastCallerRow[] = [];
    const endpoints = new Set<string>();
    const callerSeen = new Set<string>();

    for (const sym of changedSymbols) {
      let refs;
      try {
        refs = await this.deps.codeIndex.references(ref, sym.name);
      } catch {
        continue;
      }
      const callerFiles = new Set<string>();
      for (const r of refs) {
        if (r.fromPath === sym.file) continue; // skip the decl's own file
        const callerName = enclosingSymbolName(allSymbols, r.fromPath, r.line);
        const key = `${r.fromPath}|${callerName}|${sym.name}`;
        if (callerSeen.has(key)) continue;
        callerSeen.add(key);
        callerRows.push({
          file: r.fromPath,
          symbol: callerName,
          viaSymbol: sym.name,
          line: r.line,
          rank: 0, // ripgrep/degraded path has no persistent rank
        });
        callerFiles.add(r.fromPath);
      }

      // Detect HTTP routes reachable from any caller file (best-effort, just
      // like the legacy blast service).
      for (const file of callerFiles) {
        const content = await readClone(repo.clonePath, file);
        if (!content) continue;
        for (const e of extractEndpoints(content)) endpoints.add(e);
      }
    }

    return {
      changedSymbols,
      callers: callerRows,
      impactedEndpoints: [...endpoints],
      degraded: true,
      reason: 'no_data',
    };
  }

  /**
   * Serve the cached repo-map for the repo's last-indexed SHA. The map is only
   * rendered by the pipeline at `DEFAULT_REPO_MAP_TOKEN_BUDGET`; other budgets
   * (or an unindexed / partial-without-rank repo) miss and degrade cleanly.
   */
  async getRepoMap(repoId: string, tokenBudget?: number): Promise<RepoMapResult> {
    const degraded: RepoMapResult = {
      text: '',
      tokens: 0,
      cached: false,
      degraded: true,
      reason: 'no_data',
    };
    if (!this.deps.repoIntelEnabled) {
      return { ...degraded, reason: 'flag_off' };
    }
    const state = await this.repo.tryGetIndexState(repoId);
    if (!state || !state.lastIndexedSha) return degraded;
    const budget = tokenBudget ?? DEFAULT_REPO_MAP_TOKEN_BUDGET;
    const hit = await this.repo.getRepoMapCache(repoId, state.lastIndexedSha, budget);
    if (!hit) return degraded;
    return { text: hit.mapText, tokens: hit.tokenCount, cached: true };
  }

  /** Percentile per path from `file_rank` (smart-diff / run-executor "top-N%"). */
  async getFileRank(repoId: string, paths: string[]): Promise<FileRankRow[]> {
    if (!this.deps.repoIntelEnabled) return [];
    if (paths.length === 0) return [];
    return this.repo.getFileRankFor(repoId, paths);
  }

  /** Persistent symbol read-model (T2 columns) for the given files. */
  async getSymbolsInFiles(repoId: string, paths: string[]): Promise<SymbolRow[]> {
    if (!this.deps.repoIntelEnabled) return [];
    if (paths.length === 0) return [];
    const rows = await this.repo.getSymbolRows(repoId, paths);
    return rows.map((r) => ({
      file: r.path,
      name: r.name,
      kind: r.kind,
      exported: r.exported,
      startLine: r.line ?? 0,
      endLine: r.endLine ?? r.line ?? 0,
      signature: r.signature,
    }));
  }

  /**
   * Diff-scoped callers-in-prompt fuel (specs/18 AC-38), read from the persisted
   * v3 graph — no clone parsing, no ripgrep.
   *
   * Changed symbols = callable declarations (function / class / qualified
   * method) of the changed files; when `changedRanges` has a file's hunk
   * ranges (OLD-side / base coordinates), only declarations intersecting them count,
   * otherwise every declaration of the file does (legacy, no diff). Callers
   * are the incoming `symbol_edges` into those symbols, `exact` before
   * `inferred` and runtime before type-only, each labelled with its own
   * declaration's signature. Returns at most `limit` rows, deduped by
   * (file, symbol, viaSymbol). Degraded gate: flag off, no index, missing
   * clone, or empty input → `[]`.
   */
  async getCallerSignatures(
    repoId: string,
    changedFiles: string[],
    limit: number = MAX_CALLERS_PER_SYMBOL,
    changedRanges?: ReadonlyMap<string, ReadonlyArray<{ start: number; end: number }>>,
  ): Promise<SignatureRow[]> {
    if (!this.deps.repoIntelEnabled) return [];
    if (changedFiles.length === 0) return [];

    const repo = await this.repo.getRepoBasics(repoId);
    if (!repo || !repo.clonePath) return [];
    const state = await this.repo.tryGetIndexState(repoId);
    if (!state || (state.status !== 'full' && state.status !== 'partial')) return [];

    // 1. Changed, callable symbols (hunk ∩ declaration when hunks are known).
    const decls = await this.repo.getSymbolRows(repoId, changedFiles);
    const targets: Array<{ path: string; name: string }> = [];
    for (const d of decls) {
      if (d.kind !== 'function' && d.kind !== 'method' && d.kind !== 'class') continue;
      // Dual-emit (Class.method + method): the qualified form is the graph key.
      if (d.kind === 'method' && !d.name.includes('.')) continue;
      const ranges = changedRanges?.get(d.path);
      if (ranges && ranges.length > 0) {
        const start = d.line ?? 0;
        const end = d.endLine ?? start;
        if (!ranges.some((r) => r.start <= end && start <= r.end)) continue;
      }
      targets.push({ path: d.path, name: d.name });
    }
    if (targets.length === 0) return [];

    // 2. Incoming edges (chunked), best evidence first.
    const edges: Awaited<ReturnType<RepoIntelRepository['getIncomingEdges']>> = [];
    for (let i = 0; i < targets.length; i += BLAST_QUERY_CHUNK) {
      edges.push(...(await this.repo.getIncomingEdges(repoId, targets.slice(i, i + BLAST_QUERY_CHUNK))));
    }
    const weight = (e: { kind: string; confidence: string }): number =>
      (e.confidence === 'exact' ? 0 : 2) + (e.kind === 'type' ? 1 : 0);
    edges.sort((a, b) => weight(a) - weight(b));

    // 3. Label each caller with its own declaration's signature.
    const callerFiles = [...new Set(edges.map((e) => e.fromPath))];
    const sigByKey = new Map<string, string>();
    for (const r of await this.repo.getSymbolRows(repoId, callerFiles)) {
      if (r.signature) sigByKey.set(`${r.path}\0${r.name}`, r.signature);
    }

    const out: SignatureRow[] = [];
    const seen = new Set<string>();
    for (const e of edges) {
      if (out.length >= limit) break;
      if (e.fromPath === e.toPath) continue; // skip self-references
      const signature = sigByKey.get(`${e.fromPath}\0${e.fromName}`);
      if (!signature) continue; // `<module>` / unsigned caller → nothing to emit
      const dedupKey = `${e.fromPath}|${e.fromName}|${e.toName}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      out.push({
        file: e.fromPath,
        symbol: e.fromName,
        signature,
        rank: 0, // enriched from file_rank below (T3)
      });
    }

    // T3: enrich each caller with its file's rank percentile so the prompt can
    // lead with the most important callers. No-op when no index exists yet.
    if (out.length > 0) {
      const files = [...new Set(out.map((o) => o.file))];
      const ranks = await this.repo.getFileRankFor(repoId, files);
      if (ranks.length > 0) {
        const byFile = new Map(ranks.map((r) => [r.path, r.percentile]));
        for (const o of out) o.rank = byFile.get(o.file) ?? 0;
        out.sort((a, b) => b.rank - a.rank);
      }
    }

    return out;
  }

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
  async getUnresolvedReferences(repoId: string, files: string[]): Promise<RefRow[]> {
    if (!this.deps.repoIntelEnabled) return [];
    if (files.length === 0) return [];

    const repo = await this.repo.getRepoBasics(repoId);
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

  /** Top-N files by rank, minus tests/configs/migrations — conventions sample. */
  async getConventionSamples(repoId: string, n: number): Promise<string[]> {
    return this.getTopFilesByRank(repoId, n);
  }

  /**
   * Top-N file paths by rank DESC, dropping tests/configs/migrations and any
   * caller-supplied `exclude` substrings. Over-fetches by 10× before filtering
   * so the post-filter still yields N where possible.
   */
  async getTopFilesByRank(
    repoId: string,
    n: number,
    opts?: { exclude?: string[] },
  ): Promise<string[]> {
    if (!this.deps.repoIntelEnabled) return [];
    if (n <= 0) return [];
    const exclude = opts?.exclude ?? [];
    const rows = await this.repo.getRankedPaths(repoId, Math.max(n * 10, 100));
    const out: string[] = [];
    for (const r of rows) {
      if (isJunkPath(r.path)) continue;
      if (exclude.some((e) => r.path.includes(e))) continue;
      out.push(r.path);
      if (out.length >= n) break;
    }
    return out;
  }

  /**
   * Dependency chains from the highest-ranked files (onboarding reading-path).
   * For each of the top roots, greedily follow the highest-ranked import target
   * up to BFS_DEPTH hops. Pure read over `file_edges` + `file_rank`.
   *
   * `opts` is additive (D7): omitted, it reproduces today's behavior exactly
   * (`order: 'rank'`, `roots: CRITICAL_PATH_ROOTS`) — the AC-11 regression
   * surface. `order: 'weighted'` seeds roots from the read-time
   * `pagerank * (1 + hotness)` score instead, for the onboarding module only.
   */
  async getCriticalPaths(
    repoId: string,
    opts?: { order?: 'rank' | 'weighted'; roots?: number },
  ): Promise<string[][]> {
    if (!this.deps.repoIntelEnabled) return [];
    const edges = await this.repo.getEdges(repoId);
    if (edges.length === 0) return [];

    const rootCount = opts?.roots ?? CRITICAL_PATH_ROOTS;

    if (opts?.order === 'weighted') {
      const weighted = await this.getWeightedRankRows(repoId);
      const rankOf = new Map(weighted.map((r) => [r.path, r.weighted]));
      return chainsFrom(edges, weighted, rankOf, rootCount);
    }

    const ranked = await this.repo.getRankedPaths(repoId, 100_000);
    const rankOf = new Map(ranked.map((r) => [r.path, r.rank]));
    return chainsFrom(edges, ranked, rankOf, rootCount);
  }

  /**
   * Descending by `pagerank * (1 + hotness)` (D7's read-time weighted score),
   * filtered through the same junk-path + caller-`exclude` rules as
   * `getTopFilesByRank`. `[]` when the flag is off, `n <= 0`, or nothing is
   * ranked — the array-degraded contract (`types.ts`).
   */
  async getWeightedRankedFiles(
    repoId: string,
    n: number,
    opts?: { exclude?: string[] },
  ): Promise<WeightedFileRow[]> {
    if (!this.deps.repoIntelEnabled) return [];
    if (n <= 0) return [];
    const exclude = opts?.exclude ?? [];
    const rows = await this.getWeightedRankRows(repoId);
    const out: WeightedFileRow[] = [];
    for (const r of rows) {
      if (isJunkPath(r.path)) continue;
      if (exclude.some((e) => r.path.includes(e))) continue;
      out.push(r);
      if (out.length >= n) break;
    }
    return out;
  }

  /**
   * All `file_rank` rows for a repo, mapped to the read-time weighted score
   * and sorted desc by it. Unfiltered (no junk-path drop) — callers that need
   * a display-ready list filter themselves (`getWeightedRankedFiles`);
   * `getCriticalPaths`'s weighted order deliberately mirrors its `rank` order
   * sibling, which also takes roots unfiltered.
   */
  private async getWeightedRankRows(repoId: string): Promise<WeightedFileRow[]> {
    const rows = await this.repo.getFileRankRows(repoId, MAX_INDEXED_FILES);
    return rows
      .map((r) => ({
        path: r.path,
        pagerank: r.pagerank,
        hotness: r.hotness,
        weighted: r.pagerank * (1 + r.hotness),
        percentile: r.percentile,
      }))
      .sort((a, b) => b.weighted - a.weighted);
  }

  /** Thin passthrough to the repository's per-file endpoint/cron facts. */
  async getFileFacts(
    repoId: string,
    paths: string[],
  ): Promise<Array<{ file: string; endpoints: string[]; crons: string[] }>> {
    if (!this.deps.repoIntelEnabled) return [];
    if (paths.length === 0) return [];
    const rows = await this.repo.getFileFacts(repoId, paths);
    return rows.map((r) => ({ file: r.filePath, endpoints: r.endpoints, crons: r.crons }));
  }
}

/**
 * Shared BFS chain-builder for `getCriticalPaths`: greedily walks the
 * highest-`rankOf` import target up to BFS_DEPTH hops from each of the top
 * `rootCount` entries in `ranked` (already sorted desc by whatever score the
 * caller wants — plain `rank` or the D7 weighted score). Extracted so the two
 * orderings share one adjacency/BFS implementation rather than duplicating it.
 */
function chainsFrom(
  edges: IndexerEdgeRow[],
  ranked: Array<{ path: string }>,
  rankOf: Map<string, number>,
  rootCount: number,
): string[][] {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const arr = adj.get(e.fromFile);
    if (arr) arr.push(e.toFile);
    else adj.set(e.fromFile, [e.toFile]);
  }

  const roots = ranked.slice(0, rootCount).map((r) => r.path);
  const paths: string[][] = [];
  const seenPaths = new Set<string>();
  for (const root of roots) {
    const chain = [root];
    const inChain = new Set(chain);
    let cur = root;
    for (let depth = 0; depth < BFS_DEPTH; depth += 1) {
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

/** How many top-ranked files seed `getCriticalPaths` dependency chains. */
const CRITICAL_PATH_ROOTS = 5;

/**
 * Directory kinds excluded from rank-driven file samples: tests, migrations,
 * fixtures. Substring match on the repo-relative path — safe because every
 * pattern here is slash-delimited, so it can't match inside an unrelated
 * filename or directory name.
 */
const JUNK_DIR_PATTERNS = ['__tests__/', '__mocks__/', '/test/', '/tests/', '/migrations/', '/__fixtures__/'] as const;

/**
 * File kinds excluded from rank-driven file samples: tests, tool configs,
 * declaration files. Matched against the basename only (not the full path)
 * so a real source file merely living under/next to a tool-named directory
 * or file — e.g. `src/eslint-plugin-custom/index.ts`, `src/jest.utils.ts` —
 * isn't misclassified as junk.
 */
const JUNK_BASENAME_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /\.d\.ts$/,
  /\.config\./,
  /^\.?eslint(rc)?(\.|$)/,
  /^\.?prettier(rc)?(\.|$)/,
  /^jest\.(config|setup)\./,
  /^vitest\.(config|setup)\./,
] as const;

function isJunkPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (JUNK_DIR_PATTERNS.some((p) => lower.includes(p))) return true;
  const basename = lower.slice(lower.lastIndexOf('/') + 1);
  return JUNK_BASENAME_PATTERNS.some((re) => re.test(basename));
}

// ---------------------------------------------------------------------------
// helpers — local to T1, replaced when blast/onboarding migrate to the facade.
// ---------------------------------------------------------------------------

/**
 * Best-effort: name the enclosing top-level symbol of a reference line. Mirrors
 * blast/helpers.ts callerName so we get the same caller labels.
 */
function enclosingSymbolName(
  allSymbols: CodeSymbol[],
  fromPath: string,
  line: number,
): string {
  const inFile = allSymbols
    .filter((s) => s.path === fromPath && s.line <= line && !s.name.includes('.'))
    .sort((a, b) => b.line - a.line);
  return inFile[0]?.name ?? fromPath.split('/').pop() ?? fromPath;
}

async function readClone(clonePath: string, file: string): Promise<string | null> {
  return readFile(join(clonePath, file), 'utf8').catch(() => null);
}
