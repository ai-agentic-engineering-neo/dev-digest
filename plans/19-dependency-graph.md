# Dependency graph, PR impact graph, project graph (Blast Radius v2) — Implementation Plan

Plan number 19 (18 is `plans/18-security-fixes.md`, unrelated; 17 is `plans/17-hardening.md`, untouched).
Branch: `feat/18-dependency-graph` (from `refactor/16-server-ports-inward` 978f44e, which already injects deps into repo-intel — `modules/repo-intel/deps.ts`, `new RepoIntelService(repo, deps)`).

## Source requirements

`specs/18-dependency-graph.md` (665 lines, re-read after the concurrent edit: AC-25c…25f, `staleOverlay`, extended AC-16a, new AC-27a entry-point rules, final AC-24a). Covers AC-1…AC-54 incl. AC-16a, 24a, 25a–f, 27a, 46a. All clarifications resolved; its "Decisions" table is not re-litigated here. Spec ACs that changed late and are planned against their NEW text:

- AC-16/16a: `reindexing` is a SEPARATE field (not an `IndexStatus` value), also for "queued".
- AC-24a: M1/M2/M3/M4/M7 report on THIS repo is NON-gating (script, no CI hook). Gating = synthetic fixture only (AC-19…24).
- AC-27a: entry points = endpoint/cron facts; app-router `page|route|layout`; `*.test.*`, `*.spec.*`, `__tests__/`. NO `pages/**`, NO `e2e/`.
- AC-25f: overlay limits `MAX_FILE_SIZE`/`MAX_PARSE_MS_PER_FILE`; failure => base-only for that file + `overlayDegraded` + `degradedFiles[]`, request never fails.

## Clarifications & recommendations

User-confirmed (not re-asked): multi-agent, four phases; M1–M7-style report as a non-gating script next to the gating test; React Flow + elkjs.

Recommendations (my judgment, NOT settled requirements):

- R-1 Pin `typescript` to `^5.9` and MOVE it from `devDependencies` to `dependencies` in `server/package.json` (`ts.resolveModuleName` is needed at runtime). The npm registry's latest is 7.0.2; I did not verify its JS API, so do not bump to it. Installed today: 5.9.3.
- R-2 `file_edges` stays as a materialised table, but is written ONLY from resolved `file_imports` (AC-7). That keeps `getEdges`, rank, critical paths and the dependency-index working with minimal churn.
- R-3 MCP: add an optional `include_type_only` input (default false) and make ONE appended-sentence edit to `GET_BLAST_RADIUS_DESCRIPTION` (entry points, tests, type-only opt-in). Called out in the commit message as a deliberate description edit (mcp-server/CLAUDE.md, byte-identical rule).
- R-4 Libraries: `@xyflow/react` 13.0.2, MIT, peers `react>=18` (client has React 19.2) — fine. `elkjs` 0.12.1, licence `EPL-2.0 OR GPL-3.0-or-later` (registry metadata) — use under EPL-2.0 (file-level copyleft, we do not modify it); flag for the user's licence sign-off. Load both lazily (`next/dynamic`/dynamic `import()`) so they stay out of the main bundle; run ELK `bundled` build on the main thread (<= 300 nodes).
- R-5 (APPROVED, see Resolved) `pr_files` lacks `status`/`previous_filename`, `pull_requests` lacks the base SHA, the GitHub sync (`modules/pulls/routes.ts:241-262`, `adapters/github/octokit.ts:118-123`) drops them, and `listFiles` is capped at `per_page: 100`. Plan adds nullable `pr_files.status`, `pr_files.previous_path`, `pull_requests.base_sha` in the Phase 1 migration, populates them in P2-C, and paginates `listFiles`.

## Execution mode

Recommendation and user-confirmed choice: MULTI-AGENT, four phases, one `implementer` per task below, then `plan-verifier` and `architecture-reviewer` per phase (server tasks), `test-writer` after phases 1, 2, 4 for gaps. Phase 1 blocks all. Phase 2 blocks Phase 3 data wiring. Phase 4 needs only Phase 1 + its own API.

### Dependency DAG

```
P1-A contracts+migration
  ├─► P1-B parse facts ─┐
  └─► P1-C resolver ────┼─► P1-D pure graph core ─► P1-E pipeline v3 ─► P1-F fixture+gate+report
                        │                                   │
   (P1 done = gate)     ▼                                   ▼
        ┌───────────────────────────── P1 merged ──────────────────────────────┐
        ▼                                   ▼                                  ▼
 P2-A git port ─► P2-B blast engine ─┬─► P2-C blast route + pulls    P3-A canvas foundation (client, needs only P1-A contracts)
                                     ├─► P2-D consumers (brief, callers digest, gate, …)      │
                                     └─► P2-E mcp-server (after P2-C)                          │
 P2-C ─► P3-B PR impact UI (needs P3-A)                                                        │
 P4-A project-graph API (needs P1 only; parallel with all of P2/P3) ─► P4-B project graph UI (needs P3-A + P4-A)
```

Parallel set after P1: {P2-A…E} ∥ {P3-A} ∥ {P4-A}. Then {P3-B} ∥ {P4-B}. Non-overlapping owned paths are listed per task; shared files have ONE owner (table below).

### Shared files — single owner each

| File | Owner | Others must |
|---|---|---|
| `server/src/vendor/shared/contracts/dependency-graph.ts` + client copy (index coverage, reindexing, overlay, blast graph, `BlastRadius` additive fields) and its `index.ts` export lines | P1-A | read only; never edit |
| `server/src/vendor/shared/contracts/project-graph.ts` + client copy and its `index.ts` export lines | P4-A (after P1 merged) | P3 never touches vendor/shared |
| `server/test/shared-export-surface.test.ts` literal | P1-A for its names, then P4-A for its names (strictly sequential: P4-A starts after P1 merged) | — |
| `server/src/db/schema/repo-intel.ts`, `db/schema/pulls.ts` (`pull_requests.base_sha`, `pr_files.status/previous_path`) + the one migration `0027_*` + `_journal.json` | P1-A (only migration in this feature) | no phase adds another migration |
| `server/src/adapters/github/octokit.ts`, `modules/pulls/**` (PR sync) | P2-C | P2-B/D read only |
| `server/src/vendor/shared/contracts/platform.ts` (both copies; only the new optional DTO fields) | P1-A | P2-C never edits it |
| `server/src/platform/container.ts` | P1-C (resolver wiring, drops depgraph), then P4-A (one getter `projectGraph`, last step after rebasing) | P2 needs no container change |
| `server/src/domain/ports/repo-intel.ts` | P1-E (index-state fields), then P2-B (blast types) — sequential | — |
| `server/src/modules/repo-intel/service.ts`, `repository.ts` | P1-E, then P2-B, then P2-D — sequential in that order | P4-A adds NEW files only |
| `client/src/test/setup.ts`, `client/package.json`/lockfile, `client/src/components/graph-canvas/**`, `client/messages/en/graph.json` | P3-A | P3-B/P4-B read only |
| `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/helpers.ts(+.test.ts)` | P4-B | — |
| `client/src/lib/hooks/blast-radius.ts` | P3-B | — |

## Modules affected

- server (all four phases): `adapters/astgrep`, new `adapters/tsresolve` (replaces `adapters/depgraph`), `adapters/git`, `domain/ports`, `modules/repo-intel`, `modules/blast`, `modules/brief`, `modules/reviews` (callers digest only via the facade), `modules/pulls` (sync of status/previous path), new `modules/graph`, `db/schema`, migration, `vendor/shared`.
- client (P3, P4): PR page BlastRadiusCard, new graph canvas component, new "Graph" repo tab, hooks, i18n, vendor/shared copy, vendor/ui nav.
- mcp-server (P2-E): `tools/get-blast-radius.ts` + test only (own local `Raw…` mirror types, no shared import).
- reviewer-core: NOT touched (caller signatures are produced server-side; prompt section and `INJECTION_GUARD` unchanged).
- e2e: not in this plan (recommended follow-up flow `e2e/specs/NN-dependency-graph.flow.json` against `./scripts/e2e.sh`; the seeded demo repo is not guaranteed indexed with v3).

## Architectural constraints

- Ports declared only in `src/domain/ports/*` (`server/LEARNINGS.md` "SPEC-16: ports live in `src/domain/ports/*`…"). New ports: `module-resolver.ts`, `project-graph.ts`; extended: `git.ts`, `repo-intel.ts`. `depgraph.ts` is deleted.
- `no-container-in-services`: services take `(repo, deps)`; compose only in `container.ts`/routes. New deps types go in the leaf `repo-intel/deps.ts` (importing only `domain/ports/*`) — a `PipelineDeps` declared elsewhere creates the `no-circular` cycle the baseline forbids (LEARNINGS, same entry). Baseline `.dependency-cruiser-known-violations.json` must not grow.
- `no-cross-module`: `modules/blast`/`brief`/`graph` read repo-intel through the facade/ports only; hunk parsing cannot import `modules/brief/hunks.ts`, so repo-intel gets its own `graph/hunks.ts` (same header-scan approach as `brief/hunks.ts:14-45`, plus old-side ranges).
- `db-only-in-repositories` (`.dependency-cruiser.cjs`): all SQL in `repository.ts`-named files — new `repo-intel/graph-read.repository.ts` satisfies the pattern.
- Routes are schema-first (`server/CLAUDE.md`); every graph path/depth param validated by zod before the handler.
- Brief reads raw blast through its own local port, never `BlastRadius` (`server/LEARNINGS.md` "brief reads `BlastResult` directly", ~lines 361-416): port stays local, shapes copied not imported.
- `test/shared-export-surface.test.ts` pins the full 248-name export list; any new `export type` fails it until the literal is updated (SPEC-16 entry). Both `vendor/shared` copies are manual; already drifted in 4 files (adapters, knowledge, review-api, trace) — touch neither of those 4 files.
- Characterization tests have ONE factory each (`makeService`/`makeDeps`/`makeExecutor`); edit factories, never the `it(...)` bodies (`run-executor-characterization`: Live Log strings, call order callers → repoMap → rank stay byte-identical).
- `pnpm typecheck` does NOT cover `test/**` (LEARNINGS) — always run the affected vitest files too.
- Migrations: new file only, never edit applied ones; not applied on boot (`pnpm db:migrate`). Journal hazard (`plans/17-hardening.md` R2/H5): `0024.when=1787323230105` < `0023.when=1787337136408`. Existing max `when` = `1788768151665` (0026). The new entry's `when` MUST be strictly greater than every existing one (and than any H5 repair migration if `plans/17` lands first — rebase and re-check). After `pnpm db:generate < /dev/null`, READ the generated SQL for statements on tables this feature does not touch (LEARNINGS "re-emitted ADD COLUMN multi_agent_run_id" trap) and strip them by hand from the new, unapplied file only. Split into two migrations only if drizzle prompts a rename.
- Client: pages thin, feature code in `_components/<Name>/` with its own `*.test.tsx`; data only through `src/lib/hooks/*` → `lib/api.ts`; new strings in `messages/en/*.json`; `src/vendor/ui` is owned source (client/CLAUDE.md). Check `client/LEARNINGS.md` before touching `BlastRadiusCard` (list columns/sync traps).
- mcp-server: `http/client.ts` only fetch; tool description and registration order byte-identical; own local types, no `@devdigest/shared` (mcp-server/CLAUDE.md).
- Security (spec Non-functional): paths repo-relative, normalised, no `..`/absolute/NUL, exist in index (404 otherwise, AC-54); tsconfig parsed with `ts.readConfigFile`/`parseJsonConfigFileContent` over a host that refuses paths outside the clone and does not follow symlinks out; labels rendered as plain text; ref passed to git validated as `^[0-9a-f]{40}$` and used in an argument array (no shell).

## Approach

### Data model (P1-A) — one migration `0027_*`

New tables (all `repo_id uuid → repos ON DELETE CASCADE`, composite PKs for idempotence):

- `file_imports(repo_id, from_file, idx, local_name, imported_name, specifier, is_type bool, kind text 'static|dynamic|require', line int, resolved_file text null, unresolved_reason text null)`; `unresolved_reason ∈ missing|cycle|ambiguous|tsconfig|non_literal|outside_clone|external|builtin`. `external`/`builtin` are NOT counted as unresolved (AC-5). Index `(repo_id, resolved_file)` and `(repo_id, from_file)`.
- `file_exports(repo_id, file, exported_name, local_name null, kind 'local|default|reexport|reexport_all|namespace', specifier null, resolved_file null, line)`.
- `symbol_edges(repo_id, from_path, from_name, to_path, to_name, kind 'call|type|value|extends|implements|re-export', confidence 'exact|inferred', line)`; indexes `(repo_id, to_path, to_name)`, `(repo_id, from_path)`. Module-scope pseudo-symbol name = `<module>` (stored as a `symbols` row, kind `module`, range = whole file, so AC-10/26 attribute and render uniformly). Methods keyed `Class.method`; the v1 dual-emitted bare-name rows stay for v1 readers; overloads/merging collapse to one (path,name).
- `repo_index_state` gains: `coverage jsonb null`, `reindex_state text null` (`'queued'|'running'`), `reindex_done int null`, `reindex_total int null`, `tsconfig_failures jsonb null`. Nothing is added to the `status` enum (AC-16a).
- `pr_files` gains nullable `status text`, `previous_path text` (R-5; cheap, additive).
- `symbols.kind` is free text: `const`, `enum`, `module` need no enum change. `references` keeps its shape; `decl_file` is now set by binding resolution (so phantom gate semantics stay: NULL = not a binding or local).

Index version: `INDEXER_VERSION = 3` (`constants.ts:39`). A stored version < 3 means `reindexing` at read time (derived, no write); `incremental.ts:81` already routes to a full index on mismatch. Boot sweep (AC-15): `registerIndexJobHandlers()` additionally enqueues `INDEX_JOB_KIND` for every repo whose state version != current, fire-and-forget WITH `.catch` (R1 in plans/17: an unhandled rejection kills the process), sets `reindex_state='queued'`. Reads never enqueue (idempotent reads).

### Resolution and graph core (P1-B…E)

- Parse (P1-B): new `adapters/astgrep/module-facts.ts` exporting `parseModuleFacts(file, source)` => imports (binding table incl. default/`*`/`type`/dynamic literal/`require` literal), exports (local, `export {a as b}`, `export … from`, `export *`, default incl. anonymous => symbol named after the file default), symbols (adds exported const/let/var and enum, AC-3), and typed references with position (`call|value|type|extends|implements|member{receiver,prop}`) and 1-based line. Existing `parseSymbols/parseReferences/parseImports` stay (callers digest degraded path, `astgrep.test.ts`); only `parseSymbols` gains const/enum kinds. Reuse helpers in `astgrep/index.ts` (`getField`, `lineOf`, `isInsideImport`, `rightmostName`, ~lines 402-442) by exporting them rather than copying. `.d.ts`: type edges only.
- Resolve (P1-C): port `ModuleResolver` (`domain/ports/module-resolver.ts`): `create({ root, files: ReadonlySet<string>, readText(rel) }) => { resolve(fromFile, spec) => {kind:'file',path}|{kind:'external'}|{kind:'builtin'}|{kind:'unresolved',reason}; tsconfigFailures() }`. Adapter `adapters/tsresolve/index.ts` uses `ts.resolveModuleName` with a custom `ModuleResolutionHost` backed by the walked file set (no `node_modules`, no program, no type-check), nearest tsconfig per file (walk up inside the clone, `extends` chain read through the contained host), default Node resolution when none, tsconfig failure => recorded + default resolution + `partial`. The overlay builds a second resolver over base-file-set + overlay (adds/removes).
- Core (P1-D, pure, no I/O, under `modules/repo-intel/graph/`): `bindings.ts` (follow `export … from`/`export *` to the declaring symbol; visited-set; ambiguous `export *` and cycles => unresolved with reason), `edges.ts` (AC-9…13: exact only via import binding or same-file declaration; `x.m` => inferred only when exactly one method named `m` among classes/interfaces bound in that file, else unresolved; namespace `ns.fn` exact; enclosing declaration by tightest range else `<module>`), `coverage.ts` (value/type resolved shares, unresolved specifiers, tsconfig failures, inferred share), `thresholds.ts` (the AC-19…23 gate predicate, shared by the fixture test and the "broken variant" test). Entry: `buildGraph(files: ParsedModule[], resolver) => { imports, exports, symbols, edges, coverage }`.
- Pipeline (P1-E): rewrite `pipeline/full.ts` and `pipeline/incremental.ts` to parse with `parseModuleFacts`, call `buildGraph`, write via new repository methods (`replaceImports/Exports/SymbolEdges`, `setCoverage`, `setReindexProgress` every 100 files), derive `file_edges` from `file_imports.resolved_file` (R-2), set `references.decl_file` from exact bindings, then rank/repo-map/facts as today. Delete `RepoIntelRepository.resolveReferences` SQL name-join (`repository.ts:427-452`). Incremental (AC-18): changed-set expands to importers of changed files' exports, transitively through `reexport`/`reexport_all` chains (query `file_imports.resolved_file`/`file_exports.resolved_file`), rename/delete removes rows for gone paths; budgets unchanged (`MAX_INDEXED_FILES` 5000 etc., `INDEX_SOFT_BUDGET_MS` => `partial`, same as v1). `PipelineDeps`: replace `depgraph` with `resolver` factory.
- `adapters/depgraph/index.ts` contains a NUL byte (line 85, ``${from}\0${to}``): Edit/Write cannot modify it. It is replaced, so delete it with `git rm server/src/adapters/depgraph/index.ts` and `git rm server/src/domain/ports/depgraph.ts` (shell only), then fix the imports in `container.ts`, `repo-intel/{deps,service}.ts`, `pipeline/{full,incremental}.ts` and the 6 test factories (`test/indexer-pipeline*.test.ts`, `repo-intel-resync`, `container-wiring`, `repo-intel-service-characterization`). `dependency-cruiser` package stays (needed by `pnpm arch`). Update the SPEC-16 AC-5 grep expectation (`export (interface|type) (Tokenizer|DepGraph|RepoIntel)`) if a test pins `DepGraph`.

### Blast v2 (P2)

- P2-A: `GitClient` gains `readFileAtRef(repo, sha, path): Promise<string | null>` (`git show <sha>:<path>` via simple-git `raw`, null when absent), `hasObject(repo, sha)` (`cat-file -e`) (no `resolveRef`: not needed once `base_sha` is persisted); `adapters/mocks.ts` + fakes updated. Working tree untouched. Missing head => `fetchPullHead(repo, number)` once (`simple-git.ts:66`), recheck, else `overlayDegraded` for every file.
- P2-B (repo-intel engine, `modules/repo-intel/graph/`): `hunks.ts` (old+new ranges from `pr_files.patch`), `overlay.ts` (read changed supported files at head, `parseModuleFacts` within `MAX_FILE_SIZE`/`MAX_PARSE_MS_PER_FILE`, concurrency 8, `MAX_OVERLAY_FILES` 200; build overlay resolver; replace those files' symbols/imports/exports/edges in memory; degraded files => base-only + `degradedFiles[]`; never persisted), `changed.ts` (head hunks ∩ head declarations; base-side removed ranges ∩ persisted symbols => `deleted`; head symbols absent from persisted index => changed/added; module-scope pseudo-symbol when no declaration intersects; deleted file => all its persisted symbols `deleted`; no head edge may target a deleted symbol/path), `entry-points.ts` (AC-27a: `file_facts` endpoint/cron, `app/**/{page,route,layout}.*`, `*.test.*`/`*.spec.*`/`__tests__/`), `blast.ts` (reverse reachability, iterative per hop with `SELECT … WHERE repo_id AND (to_path,to_name) IN (chunk)` so no whole-repo edge load; stop at entry point or depth clamp 1…6, default 6; visited set; runtime vs type-only marking; `includeTypeOnly`; truncation; list projection). Facade: new `getBlastGraph(repoId, req)` returning the full result (graph + overlay + index meta + `reindexing`), `getBlastRadius(repoId, paths, opts?)` kept (additive optional third arg) as `toLegacyBlastResult(getBlastGraph(...))` so Brief/legacy keep their shape; with no hunks (`opts` absent) it treats whole files as changed (documented legacy path, used only by callers without a diff). `tryPersistentBlast`, `reverseImportImpact` removed from blast; `BFS_DEPTH` stays only for `getCriticalPaths`/repo-map (`service.ts:727+`, `:814+`). v1 degraded ripgrep fallback stays only for "no index at all". `reindexing` (stored version < 3, or `reindex_state` set) => empty result + progress, no data, no fallback. Index `failed` => existing degraded path.
- `staleOverlay` = `indexedSha !== pull_requests.base_sha`; NULL `base_sha` (PR synced before 0027) => `staleOverlay: true`, `baseSha: null`, until re-sync. `pull_requests.base` (branch name) is not used for this.
- P2-C: `modules/blast/service.ts` ports widen (`getPull` returns `number, headSha, base`; `getPrFiles` returns `path, patch, status, previousPath`); envelope adds `reindexing?`, `index`, `overlay`, `graph`; `data` still validates `BlastRadius` (AC-34), `BlastCaller` gains optional `type_only`; `toBlastRadius` keeps grouping by `viaSymbol`, per-symbol cap `MAX_CALLERS_PER_SYMBOL` 20. Route query `depth` (1…6, clamped), `include_type_only` (default true for HTTP/UI). P2-C is the SOLE owner of PR sync: `adapters/github/octokit.ts`, `modules/pulls/**`. It (a) replaces the single `pulls.listFiles({ per_page: 100 })` call (`octokit.ts:91-96`) with `octokit.paginate(octokit.rest.pulls.listFiles, { per_page: 100 })`, (b) maps `status`, `previous_filename` into the file DTO and `base.sha` into the PR DTO, (c) persists `pr_files.status/previous_path` and `pull_requests.base_sha` (sync block `modules/pulls/routes.ts` ~225-262 and the PR upsert path). The optional DTO fields (`files[].status`, `files[].previous_filename`, `base_sha`) are added by P1-A to BOTH `vendor/shared/contracts/platform.ts` copies (identical; P1-A found the PR/file DTOs `PrMeta`/`PrFile` live here, not in adapters.ts) by hand (only these fields), so P2-C never edits vendor/shared. Tests: new `test/github-pull-files-paginate.test.ts` (fake octokit, >100 files over 2+ pages, all pages merged in order, fields mapped) and a pulls-sync test asserting the columns are written. The overlay cap `MAX_OVERLAY_FILES` 200 stays; files beyond it are base-only, listed in `degradedFiles` with `overlayDegraded`.
- P2-D consumers: Brief (`brief/ports.ts` local `getBlastRadius(repoId, paths, opts?)`, `brief/facts.ts:123` passes hunks via its existing `hunkRangesFor`-adjacent data + `headSha`; `BlastResult` shape unchanged; grounding of blast citations must keep passing); callers digest: rewrite `RepoIntelService.getCallerSignatures` (`service.ts:519-640`) to use v2 edges into symbols actually changed (AC-25), same `limit` (10 from `run-executor.ts:602`), same signature row shape/token budget, no clone parsing; phantom gate `getUnresolvedReferences` keeps reading `references.decl_file IS NULL` (now binding-based); onboarding (`getCriticalPaths`, `getWeightedRankedFiles`, `getFileFacts`), conventions (`getConventionSamples`), `getRepoMap`, `getFileRank`: no code change expected beyond running them on `file_edges` derived per R-2 — verify with their existing tests.
- P2-E: `mcp-server/src/tools/get-blast-radius.ts` calls `/pulls/:id/blast?include_type_only=<input, default false>`, returns existing fields (from v2 data) + `entry_points`, `affected_tests`, and a short `index` object (`low_confidence`, `reindexing`, `staleOverlay`, `overlayDegraded`); renders names/paths as plain text; R-3 description edit.

### Caps (numbers)

| Constant | Value | Applies to |
|---|---|---|
| `BLAST_MAX_DEPTH` / default | 6 / 6 (request clamped 1…6) | AC-27 |
| `MAX_BLAST_NODES` | 300 | PR impact graph; keep order: changed, then entry-points, then impacted by (depth asc, rank desc) |
| `MAX_BLAST_EDGES` | 600 | edges among kept nodes, runtime before type-only, lower depth first |
| `MAX_TRAVERSAL_NODES` | 5000 | internal BFS visited cap; beyond it `truncated.totalsCapped = true` (counts are lower bounds) |
| entry points / tests lists | 50 / 100 (with full counts) | response arrays |
| `degradedFiles` | 50 listed (+count) | overlay |
| `MAX_OVERLAY_FILES` | 200 changed files parsed; the rest base-only + `overlayDegraded` | AC-25f; NFR target is <= 50 |
| legacy callers per symbol | 20 (`MAX_CALLERS_PER_SYMBOL`, unchanged) | list projection |
| `MAX_GRAPH_NODES` / `MAX_GRAPH_EDGES` | 400 / 1200 | every project-graph response |
| symbol-level page | 200 nodes/page | file drill-down |
| file table page | default 100, max 500 | non-visual table |
| unresolved specifiers page | default 50, max 200 | AC-50 |
| cycles | <= 100 SCCs, <= 50 members listed each (+ counts) | AC-49 |
| hot files flagged | top 20 by weighted rank | AC-49 |
| ELK layout | only when nodes <= 300 (always true by caps) | client |

Project graph LoD: choose the shallowest directory depth whose aggregated node count <= 400; expanding a directory (`dir=` focus) shows its children + one aggregate node per neighbour directory; `file=` focus shows that file's symbols and their in/out symbol edges (paged). Cycles = Tarjan SCC (iterative) over `file_edges`, memoised in-process by `(repoId, lastIndexedSha, indexerVersion)`.

### Project graph API (P4-A)

New port `domain/ports/project-graph.ts` (`ProjectGraphReader`), implemented by `repo-intel/graph-read.service.ts` + `graph-read.repository.ts` (+ `graph/scc.ts`, `graph/aggregate.ts` pure), exposed as `container.projectGraph`. New module `modules/graph/` (routes + service + zod schemas, registered in `modules/index.ts`):
`GET /repos/:id/graph?dir=&file=&depth=` (LoD graph + cycles + index + coverage), `GET /repos/:id/graph/files?dir=&page=&page_size=&sort=` (table with in/out counts, rank, hotness, cycle membership), `GET /repos/:id/graph/unresolved?page=&page_size=`, `GET /repos/:id/graph/symbols?file=&page=`. Unknown dir/file/symbol => `NotFoundError` (404, AC-54); reindexing => `reindexing` + no data; no index => explicit empty-state reason (`never_indexed|indexing|failed`). Contract file `contracts/project-graph.ts` in both copies. Existing `GET /repos/:id/index-state` also returns `coverage` and the separate `reindexing` fields (contract in P1-A).

### UI (P3, P4)

- P3-A foundation: `pnpm add @xyflow/react elkjs` in client (lockfile is P3-A's), `components/graph-canvas/` (`GraphCanvas` wrapper around React Flow with pan/zoom/fit, lazy ELK layout hook, `Legend`, `GraphBanner`, live region helper), jsdom mocks in `src/test/setup.ts` (`ResizeObserver` already stubbed at lines 3-9; add `DOMMatrixReadOnly`, element size stubs needed by React Flow), `messages/en/graph.json` (legend, banner and state strings). Visual encodings never by colour alone: role = shape + icon + label; inferred = dashed stroke; type-only = thin stroke + "type" tag; `deleted` = strikethrough + tag.
- P3-B PR impact: `BlastRadiusCard` becomes a `List | Graph` toggle (suggestion §12; keeps the Overview layout); list extended with entry points, tests, runtime/type-only badges, banners (`truncated|partial|staleOverlay|overlayDegraded|lowConfidence|reindexing` with progress and coverage numbers); new `_components/ImpactGraph/` with node detail panel (symbol, file, kind, role, depth, `githubBlobUrl` link at head — `lib/github-urls.ts`), path highlight to changed nodes, filters (type-only, hide inferred), loading/error+retry/empty (full vs low-confidence) states, `aria-live` announcements. `lib/hooks/blast-radius.ts` updated types.
- P4-B project graph: `app/repos/[repoId]/graph/page.tsx` (thin) + `_components/ProjectGraphView/` (canvas, directory expand/collapse, file drill-down, hot-file styling, cycles panel, coverage + paged unresolved list, keyboard-navigable table equivalent, empty states), `lib/hooks/project-graph.ts`, nav entry "Graph" in `vendor/ui/nav.ts` + `activeKeyFor` segment-exact `hasSegment(pathname, "graph")` (same lesson as the `tour` fix in `helpers.ts:35-41`), `messages/en/projectGraph.json`.

### Tests, fixture and measurement (P1-F)

- Fixture: committed synthetic repo `server/test/fixtures/depgraph/` (real `.ts` files + per-package `tsconfig.json`, `extends` chains, alias-only importers, barrels, `export *` (incl. ambiguous and cyclic), default/anonymous default, `import type`/`{ type X }`/`* as ns`/`{a as b}`, dynamic/require literal and non-literal, missing relative import, exported const/enum, class/interface methods + injected-instance member calls, `.d.ts`, a symlink case, overloads, deleted/added/moved symbols via scripted diffs in `diffs/*.json` with `expectedChanged`/`expectedImpacted`). Directory names avoid `vendor`, `dist`, `build`, `node_modules` (`EXCLUDED_DIRS`). It is not matched by `vitest` include (`test/**/*.test.ts`) or `tsc` (`src/**`).
- Gating test `server/test/depgraph-fixture-regression.test.ts` (hermetic, in-memory, no DB): AC-19 >= 95% value bindings resolved; AC-20 >= 95% type bindings + >= 1 `type` edge per used binding; AC-21 zero `exact` edges whose target is neither import binding nor local declaration; AC-22 every alias-only importer has >= 1 file edge; AC-23 >= 95% reported changed symbols intersect a hunk and 100% of expected impacted reported (via `blast.ts` pure core with an in-memory edge source); AC-24 second case runs `thresholds.ts` against a deliberately broken name-join resolver variant and expects it to FAIL.
- Non-gating report `server/test/depgraph-measure.report.ts` (name does not match `*.test.ts`; script `"report:depgraph": "tsx test/depgraph-measure.report.ts [repoRoot]"`; defaults to the repo root via `git ls-files`): prints M1 (last 10 commits, `git log -p -U0` hunks vs declaration ranges), M2, M3, M4, M7 for v3 next to the spec's v1 constants (21%, 37%, 0%, 17%, 1385 edges / 57 alias-only files with zero edges), always exits 0, wired into no test run and no CI job (AC-24a). It uses the same pure core as the gate (no DB).

## Skills for implementer

Source: `.claude/skills/pr-self-review/SKILL.md` Phase 3 table (cap 4 per diff) and `.claude/skills/README.md`. Load by exact name.

| Task | Paths | Skills |
|---|---|---|
| P1-A | `server/src/db/**`, migration, `vendor/shared/**` | `drizzle-orm-patterns`, `postgresql-table-design`, `zod`; also `onion-architecture` for port types |
| P1-B | `server/src/adapters/astgrep/**` | `onion-architecture`, `typescript-expert`, `security` |
| P1-C | `server/src/adapters/tsresolve/**`, `domain/ports/module-resolver.ts`, `container.ts`, `package.json` | `onion-architecture`, `typescript-expert`, `security` (path containment) |
| P1-D | `server/src/modules/repo-intel/graph/**` (pure) | `onion-architecture`, `typescript-expert` |
| P1-E | `repo-intel/pipeline/**`, `repository.ts`, `service.ts`, `constants.ts` | `onion-architecture`, `drizzle-orm-patterns`, `fastify-best-practices` (job handler), `security` |
| P1-F | `server/test/**`, report script | `typescript-expert`; `agent-skills:test-driven-development` optional |
| P2-A | `adapters/git/**`, `domain/ports/git.ts`, `adapters/mocks.ts` | `onion-architecture`, `security` (ref/path args) |
| P2-B | `repo-intel/graph/**`, `service.ts`, `repository.ts` | `onion-architecture`, `drizzle-orm-patterns`, `typescript-expert` |
| P2-C | `modules/blast/**`, `modules/pulls/**`, `adapters/github/octokit.ts` | `onion-architecture`, `fastify-best-practices`, `zod` |
| P2-D | `modules/brief/**`, `modules/repo-intel/service.ts` | `onion-architecture`, `typescript-expert` |
| P2-E | `mcp-server/src/tools/**` | `typescript-expert`, `zod` (no onion: server-only skill; mcp-server has no skill row in the table — gap, rely on `mcp-server/CLAUDE.md`) |
| P3-A, P3-B, P4-B | `client/src/components/**`, `client/src/lib/**`, `client/src/app/**` | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices` (app/), `react-testing-library` for `*.test.tsx` |
| P4-A | `server/src/modules/graph/**`, `repo-intel/graph-read.*`, `domain/ports/project-graph.ts` | `onion-architecture`, `fastify-best-practices`, `zod`, `drizzle-orm-patterns` |
| every `.ts/.tsx` | — | `security` (routing table row) |

Gaps: the routing table has no row for `mcp-server/**`, `adapters/**` parsing code beyond onion, `server/scripts/test` report scripts, or `client/messages/**`; I assigned the closest skills above (judgment). Skills with a 4-skill cap: P1-A and P4-A list 4 max by dropping `onion-architecture` for P1-A if the cap bites.

## Verification

Per task (run from the module dir; scoped, not the whole suite):

| Task | Commands |
|---|---|
| P1-A | `cd server && pnpm db:generate < /dev/null` (read the SQL), `pnpm db:migrate`, `pnpm typecheck`, `pnpm exec vitest run test/shared-export-surface.test.ts test/dependency-graph-contract-parity.test.ts test/contracts.test.ts`; check `_journal.json` `when` strictly increasing (add the monotonic-`when` assertion if `plans/17` H5 has not landed it) |
| P1-B | `pnpm exec vitest run test/astgrep.test.ts test/module-facts.test.ts` + `pnpm typecheck` |
| P1-C | `pnpm exec vitest run test/tsresolve.test.ts test/container-wiring.test.ts` + `pnpm typecheck && pnpm arch` |
| P1-D | `pnpm exec vitest run test/graph-bindings.test.ts test/graph-edges.test.ts test/graph-coverage.test.ts` |
| P1-E | `pnpm exec vitest run test/indexer-pipeline.test.ts test/indexer-pipeline-characterization.test.ts test/indexer-pipeline-hotness.test.ts test/repo-intel-resync.test.ts test/repo-intel-service-characterization.test.ts`; with Docker also `test/repo-intel-symbol-clamp.it.test.ts test/repo-intel-pr-churn.it.test.ts`; `pnpm typecheck && pnpm arch`; then `pnpm db:migrate` and a re-index of the dev repo, confirming `repo_index_state.indexer_version = 3` and `coverage` populated |
| P1-F | `pnpm exec vitest run test/depgraph-fixture-regression.test.ts` (green, and green->red with the broken variant); `pnpm report:depgraph` exits 0 and prints M1/M2/M3/M4/M7 vs v1 |
| P2-A | `pnpm exec vitest run test/adapters.test.ts test/git-readfile-at-ref.test.ts` + `pnpm typecheck && pnpm arch` |
| P2-B | `pnpm exec vitest run test/graph-overlay.test.ts test/graph-blast.test.ts test/graph-entry-points.test.ts test/graph-hunks.test.ts test/depgraph-fixture-regression.test.ts test/repo-intel-facade-degraded.test.ts`; with Docker `test/repo-intel-blast-persistent.it.test.ts` |
| P2-C | `pnpm exec vitest run src/modules/blast/service.test.ts test/routes-smoke.test.ts test/pulls-status.test.ts test/github-pull-files-paginate.test.ts`; with Docker `test/pulls-comments.it.test.ts` |
| P2-D | `pnpm exec vitest run test/brief-facts.test.ts test/brief-grounding.test.ts test/brief-service.test.ts test/prompt-callers.test.ts test/run-executor-characterization.test.ts test/onboarding-facts.test.ts test/onboarding-service.test.ts test/conventions-samples.test.ts test/repo-intel-rank-map.test.ts test/repo-intel-weighted-service.test.ts` |
| P2-E | `cd mcp-server && pnpm exec vitest run test/tools/get-blast-radius.test.ts && pnpm typecheck` |
| P3-A | `cd client && pnpm exec vitest run src/components/graph-canvas src/test/smoke.test.tsx && pnpm typecheck` |
| P3-B | `pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard" "src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab"` + `pnpm typecheck` |
| P4-A | `cd server && pnpm exec vitest run test/graph-scc.test.ts test/graph-aggregate.test.ts test/graph-routes.test.ts test/dependency-graph-contract-parity.test.ts test/shared-export-surface.test.ts test/routes-smoke.test.ts && pnpm typecheck && pnpm arch` |
| P4-B | `cd client && pnpm exec vitest run "src/app/repos/[repoId]/graph" src/components/app-shell && pnpm typecheck` |

Phase gates (plan-verifier/architecture-reviewer): after P1 `cd server && pnpm typecheck && pnpm arch && pnpm test` (full, because the index format, ports and `vendor/shared` changed); after P2 the same plus `cd mcp-server && pnpm test` and a `cd client && pnpm typecheck` (contract change reaches client); after P3/P4 `cd client && pnpm typecheck && pnpm test`. Final: `pr-self-review` (full suites, contract-drift, migration checks). Manual smoke once at the end: `./scripts/dev.sh`, confirm a repo goes `reindexing` -> `full`, open a PR (List|Graph), open the "Graph" tab.

Accessibility/perf checks to demonstrate (not gates): blast read of a 50-file PR < 2 s and project graph read < 1 s on this repo with a warm DB; index of this repo (~860 files) < `INDEX_SOFT_BUDGET_MS` 110 s.

### AC-39: existing fixture expectations that legitimately change

Only fixture DATA/expected values change, with the reason; `it(...)` behaviour assertions and characterization contracts (Live Log strings, call order, `RunTrace`) stay byte-identical.

| Test | Change | Why |
|---|---|---|
| `test/astgrep.test.ts` | symbol lists for sources with exported const/enum gain `const`/`enum` rows | AC-3 |
| `test/indexer-pipeline*.test.ts`, `repo-intel-resync`, `repo-intel-service-characterization`, `container-wiring` | factory swaps `depgraph` stub for resolver; edges now come from resolved imports; `INDEXER_VERSION` 3 | AC-7, AC-15 |
| `test/repo-intel-blast-persistent.it.test.ts` | changed symbols = hunk-intersecting only; callers exclude name-collision matches; no fixed 2-hop file walk; third case (file with no bare symbols) now yields the module-scope pseudo-symbol | AC-25/26/27 |
| `src/modules/blast/service.test.ts` | stub ports return patch/headSha; envelope additive fields | AC-34 |
| `test/brief-facts.test.ts`, `brief-grounding.test.ts` | blast fixtures carry v2 changed symbols; citation grounding assertions unchanged | AC-37 |
| `test/prompt-callers.test.ts`, `run-executor-characterization` factory | caller rows now from v2 edges for actually changed symbols; row limit 10 and token budget unchanged | AC-38 |
| `test/onboarding-*.test.ts`, `repo-intel-rank-map`, `repo-intel-weighted-service`, `conventions-samples` | only if edge fixtures there encode v1 name-join/cruiser edges; expected rank/path ordering may shift | AC-39 |
| `mcp-server/test/tools/get-blast-radius.test.ts` | new output keys; description constant (R-3) | AC-36 |
| client `BlastRadiusCard.test.tsx`, `OverviewTab.test.tsx` | extra response fields, toggle default `List` | AC-34/46 |
| `test/shared-export-surface.test.ts` | literal gains the new exported names (twice: P1-A, P4-A) | AC-35 |

## Resolved (2026-11-18, user decisions)

1. `pr_files.status` + `previous_path`: YES. Migration `0027` (P1-A), populated by PR sync (P2-C), DTO fields in both `vendor/shared/contracts/platform.ts` copies (P1-A).
2. Base SHA: persist GitHub's `base.sha` in a new nullable `pull_requests.base_sha` (same `0027`), filled by PR sync (P2-C). `staleOverlay = indexedSha !== base_sha`; NULL `base_sha` => `staleOverlay: true` until re-sync. `resolveRef('origin/<base>')` dropped.
3. `listFiles` pagination: added to this feature via octokit `paginate` in `adapters/github/octokit.ts`, owned by P2-C, with a test. Overlay cap stays 200; the rest go to `degradedFiles`.
4. Reindexing semantics accepted: stored version < 3 + boot sweep => `reindexing`; never-indexed repos show "never indexed".
5. `elkjs` under EPL-2.0: approved.
6. `typescript` as a server runtime dependency pinned `^5.9`: accepted.

## Open questions

None outstanding.
