# src/modules/repo-intel/ — the codebase indexer

Pipeline, facade methods, and routes: [README.md](./README.md).

## The one rule
**Always read through the `repoIntel.*` facade (`service.ts`)** — never call
pipeline internals (`pipeline/*.ts`, `rank.ts`, `repo-map.ts`) directly.
Consumers (the reviewer prompt, and future course lessons) depend only on the
facade staying stable while the pipeline evolves.

## Non-default conventions
- Indexing is content-hash-keyed and incremental on fetch — don't force a full
  re-index unless `pipeline/full.ts` is what you actually need.
- An unindexed or partially-indexed repo must degrade gracefully (empty results,
  never throw) — preserve that contract in any change here.

## Links
[README](./README.md) · [server/AGENTS.md](../../../AGENTS.md) · [server/docs/](../../../docs/)
