# `repo-intel` — the codebase indexer

`repo-intel` reads a cloned repository **once on clone** (and incrementally on
fetch, keyed by file content hash) and turns it into queryable facts: symbols,
the import graph, a PageRank-based file importance score, and a compact **repo
map** (the project skeleton). On a review it is only **read** — the index is
already computed, so adding context to a prompt costs no analysis at request time.

This is **starter infrastructure**: it works from day 1 (the **Indexed** badge),
but you don't write it. Course lessons build features _on top_ of its facade —
Blast Radius (L04), Conventions samples (L02), Onboarding reading-path (L05),
the Phantom-API gate (L06) — by calling `repoIntel.*`, not by re-indexing.

## Pipeline

```mermaid
flowchart LR
  CLONE["git clone / fetch"] --> WALK["infrastructure/walk.ts<br/>discover source files"]
  WALK --> AST["ast-grep adapter<br/>symbols + references"]
  AST --> EDGES["import graph<br/>(dependency-cruiser)"]
  EDGES --> RANK["domain/rank.ts<br/>PageRank → file rank"]
  RANK --> MAP["domain/repo-map.ts<br/>compact repo skeleton (cached)"]
  AST --> DB[("Postgres<br/>symbols · references · file_edges · file_rank · repo_map_cache")]
  EDGES --> DB
  RANK --> DB
  MAP --> DB
```

Full vs incremental indexing lives in `application/{full-index,incremental-index}.ts`;
an unindexed or partially-indexed repo degrades gracefully (the facade returns
empty results rather than throwing). A reindex is persisted in ONE transaction
(`TransactionRunner` port); incremental's graph/rank/map step runs in a
savepoint, so its failure only degrades the status to `partial`.

## Layout (onion rings)

| Ring | Files |
|---|---|
| domain | `types.ts` (the `RepoIntel` contract), `constants.ts`, `domain/model.ts` (row / read-model shapes), `domain/rank.ts`, `domain/repo-map.ts`, `domain/rules.ts` (phantom allowlist, junk paths, critical paths) |
| application | `application/ports.ts` (reader, index writer, state writer, source analyzer, clone files, import graph, git, job queue), `full-index.ts`, `incremental-index.ts`, `parse-sources.ts`, `blast-radius.ts`, `source-queries.ts`; `service.ts` = the facade |
| infrastructure | `infrastructure/read-repository.ts` (reads), `repository.ts` (indexer writes, extends the reader), `source-adapters.ts` (ast-grep analyzer, contained clone reads), `walk.ts` (fs walk) |
| http / wiring | `routes.ts`; `composition.ts` builds the ports and the job handlers |

## Facade (`repoIntel.*`)

Everything downstream reads through one facade (`service.ts`) so consumers never
touch the pipeline internals:

- `getRepoMap(repoId)` → the cached repo skeleton (fed into the **review prompt**).
- `getFileRank(repoId, files)` → importance percentile per changed file.
- `getCallerSignatures(repoId, files, limit)` → callers of changed symbols.
- `getBlastRadius(repoId, files)` → impacted symbols / callers (used by L04).
- `getUnresolvedReferences(repoId, …)` → phantom-symbol detection (used by L06).
- `getConventionSamples(repoId)` → top-ranked files for convention extraction (L02).

In the starter, only `getRepoMap` / `getFileRank` / `getCallerSignatures` are
wired — into `modules/reviews/application/run-executor.ts`, which adds the repo map and a
high-blast-radius note to the prompt. Toggled by `REPO_INTEL_ENABLED` (global)
and a per-agent `repo_intel` flag.

## Routes

- `GET /repos/:id/index-state` — index status (drives the **Indexed** badge).
- `POST /repos/:id/resync` — enqueue a re-index (`RepoIntelService.requestResync`, 202).
