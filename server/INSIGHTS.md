# server — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

- **2026-09-16** — Creating the `agent_runs` row before starting the background run is what makes live progress survive a reload: the run id exists before any LLM call, so the client can subscribe to SSE and re-derive state from the database instead of from the stream. Evidence: `server/src/modules/reviews/service.ts:114-131`.

## What Doesn't Work

- **2026-09-16** — Comparing `import.meta.url` to `process.argv[1]` as strings never matches on Windows, where argv is backslash-separated (`C:\...\migrate.ts`) and can never equal a `file://` URL, so the CLI entrypoints compare resolved native paths instead — reverting to the string form silently breaks `pnpm db:migrate` and `pnpm db:seed` on Windows only. Evidence: `server/src/db/migrate.ts:38-40`, `server/src/db/seed.ts:229-231`.

- **2026-09-16** — Boot-time reaping marks *every* `running` agent_run stale, so a second API instance against the same database kills the first one's in-flight runs. Evidence: `server/src/app.ts:78`.

## Codebase Patterns

- **2026-09-16** — `container.embedder()` throwing is the designed path when `EMBEDDINGS_ENABLED` is false — it throws before constructing any OpenAI client so the process makes zero embedding calls, and callers must try/catch and degrade rather than treat it as an error. Evidence: `server/src/platform/container.ts:202`.

- **2026-09-16** — An indexer-version mismatch silently escalates an incremental refresh into a full reindex, so bumping `INDEXER_VERSION` re-indexes every repo on its next refresh rather than failing loudly. Evidence: `server/src/modules/repo-intel/pipeline/incremental.ts:78`.

- **2026-09-16** — `GitClient.sync` runs `git reset --hard` against the clone, so everything under `clones/` is a disposable read-only mirror — never write anything there that matters. Evidence: `server/src/adapters/git/simple-git.ts:79-80`.

- **2026-09-16** — Review enrichment is best-effort by contract: a `repoIntel` failure becomes a Live Log line and the prompt section is omitted, so a broken index degrades review quality without failing a run or showing an error. Evidence: `server/src/modules/reviews/run-executor.ts:338`.

- **2026-09-17** — `GET /repos/:id/pulls` derives every PR-list field beyond the raw `pull_requests` row (both `score` and `cost_usd`) from the SAME latest `reviews` row — one query on `reviews` (kind='review', newest `createdAt` wins per PR) left-joined to `agent_runs` by `runId`. A future "latest run's X" field belongs in that same join/map, not a separate query, or it can silently disagree with `score` on which run counts as "latest". Evidence: `server/src/modules/pulls/routes.ts:114-134`.

- **2026-09-17** — On a failed/cancelled run, `ReviewRunExecutor` persists `tokensIn: 0, tokensOut: 0` but `costUsd: null` — not `0` — even though neither reflects any real partial usage from a cancelled map-reduce run. This asymmetry is deliberate: the client's "no cost data" rule keys off `costUsd == null`, so zeroing it to match tokens would make a failed run render a real `$0.00` badge instead of a dash. Evidence: `server/src/modules/reviews/run-executor.ts:78-87,300-309`.

## Tool & Library Notes

- **2026-09-16** — `TiktokenTokenizer` latches to a `length / 4` heuristic for the rest of the process after a single BPE load failure, so repo-map token budgets can be wrong with nothing in the log saying so. Evidence: `server/src/adapters/tokenizer/index.ts:33-36`.

- **2026-09-16** — The static OpenRouter slugs and prices in the fallback pricing table are approximate and unverified; an unknown slug returns `null` cost rather than a wrong number, so a missing cost badge means "not priced", not "free". Evidence: `server/src/adapters/llm/pricing.ts:27-29`.

- **2026-09-16** — `RunBus` deliberately keeps a run's event buffer after completion so a late SSE subscriber can replay it, but the buffer is in-memory only: after a restart the same events must be read from `run_traces`. Evidence: `server/src/platform/sse.ts:43-44`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
