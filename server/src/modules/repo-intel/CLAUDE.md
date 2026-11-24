# repo-intel — codebase indexer

- Consumers read ONLY through the facade (`service.ts`, interface in `types.ts`) via `container.repoIntel` — never import `pipeline/*` from other modules.
- The facade must degrade (return empty) on unindexed/partial repos, never throw — reviews rely on that.
- Indexing runs at clone/fetch time (`pipeline/full.ts`, `pipeline/incremental.ts`); review time is read-only.
- Gated by `REPO_INTEL_ENABLED` (global) and the per-agent `repo_intel` flag.

Pipeline, facade methods, routes: [README.md](README.md)
