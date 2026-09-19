# Insights — server

Lessons an agent cannot guess from the code alone. Read this before starting work in
this module; append to it at wrap-up, but only when something non-obvious came up.
Append-only — correct an entry with a dated note beneath it, never by rewriting it.
See `.claude/skills/engineering-insights/`.

## What Works

_No entries yet._

## What Doesn't Work

_No entries yet._

## Codebase Patterns

### Reuse the existing severity tally instead of duplicating it (2026-09-18)

`rollupSeverities` (`server/src/modules/pulls/status.ts:23`) already tallies `{severity}[]` into `{critical, warning, suggestion}` — it was written for the PR-list FINDINGS column but never wired into a route (`status.ts:1-11` docblock describes exactly this feature). Before adding a new severity-counting function, grep `src/modules/pulls/` for existing pure helpers — this one had its own passing unit test (`test/pulls-status.test.ts`) and sat unused.

**Rule:** `findingsCountsByPr` (`server/src/modules/pulls/findings-counts.ts`) groups rows to "each agent's latest review" and then calls `rollupSeverities` for the leaf count, instead of reimplementing the CRITICAL/WARNING/SUGGESTION branching a second time. (`server/src/modules/pulls/findings-counts.ts:1-50`, `server/src/modules/pulls/status.ts:23-31`)

### PR-list cost changed from "latest batch" to "sum of all runs" (2026-09-18)

The original `latestBatchCostByPr` (deleted this session) summed only the newest "Review all" batch per PR — a re-run's older cost was dropped entirely. The homework criterion for this column defines cost as the PR's cumulative review spend, which is a different aggregation, not a bugfix of the old one: it's a deliberate semantic change (a PR reviewed 3 times now shows 3x the single-run cost, not the latest run's cost).

**Rule:** if a future task touches the COST column again, check `total-cost.ts`'s docblock before assuming "latest batch" — that rule was intentionally replaced, not preserved. (`server/src/modules/pulls/total-cost.ts:1-9`, `server/test/total-cost.test.ts`)

## Tool & Library Notes

### dependency-cruiser `exclude` silently deletes edges to npm packages (2026-09)

While building the onion-architecture rules, an `exclude` pattern containing `node_modules` (and an unanchored `(^|/)dist(/|$)`, which also matches `node_modules/graphology/dist/...`) removed those modules from the graph entirely, not just from traversal. So every rule targeting an SDK package (`sdk-only-in-adapters`, `no-db-outside-infra` → `drizzle-orm`) reported zero violations, even though real ones existed. No error, just a false green.

**Rule:** stop recursion into npm with `doNotFollow: { path: 'node_modules' }`, never with `exclude`, and anchor `exclude` to the package's own output (`^dist(/|$)`). After you change the rules, prove each one fires with a temporary violating import before you trust a clean `pnpm arch`. (`server/.dependency-cruiser.cjs:180-185`)

## Recurring Errors & Fixes

### Migration journal corruption (2026-08)

Merging a branch by copying its whole `src/db/migrations/` dir over upstream's — instead of appending — rewrote history: it replaced an existing entry, dropped a later upstream migration, and lost columns from regenerated snapshots. Fresh databases crashed; already-migrated ones didn't, masking the break in some CI lanes.

**Rule:** never copy the migrations dir wholesale across branches. Always regenerate with `pnpm db:generate` and resolve journal conflicts by appending, never replacing. (`server/src/db/migrations/`, commit `2006964`.)

> **2026-09-18 correction:** sharper pointer — the actual file that got clobbered is `server/src/db/migrations/meta/_journal.json` (its `entries` array is the append-only history; a wholesale copy silently renumbers/replaces entries there).

## Session Notes

_No entries yet._

## Open Questions

### The two `vendor/shared` copies are already out of sync in files this session didn't touch (2026-09-18)

`diff -r server/src/vendor/shared client/src/vendor/shared` shows real drift in `adapters.ts`, `contracts/eval-ci.ts`, `contracts/knowledge.ts`, `contracts/productionize.ts`, and `contracts/trace.ts` — e.g. server's copy has an `'openrouter'` provider variant and an `AgentVersion`/`AgentManifest` shape client's copy lacks entirely. `platform.ts` (the file this session edited) is confirmed in sync; the drift predates this session and is unrelated to the `findings_counts`/cost work.

**Not fixed here** — reconciling it is a separate, larger change (unclear which side is canonical for each divergent symbol) and out of scope for this PR. Flagging so the next session doesn't assume "both copies in sync" without checking the specific file it's about to touch.
