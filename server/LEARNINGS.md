# server — engineering learnings

Append-only. Never rewrite or delete a past entry — if one turns out wrong,
add a new entry correcting it. Covers `server/` and its submodules,
including `server/src/modules/repo-intel` (no separate file for it).

## What Works

### 2026-07-28 — per-run cost is already computed; the pipeline just drops it

`reviewer-core` computes cost end-to-end with no extra API calls:
`OpenRouterProvider.completeStructured` (`reviewer-core/src/llm/openrouter.ts`)
asks OpenRouter for `usage: { include: true }`, prefers OpenRouter's own
`usage.cost`, and falls back to the injected `estimateCost` (wired from
`platform/price-book.ts` → `adapters/llm/pricing.ts` in `container.ts`).
`reviewPullRequest` then sums it into `ReviewOutcome.costUsd`.

Commit `d45ab0d` removed only the *persistence* of that value, not its
computation — `run-executor.ts` was destructuring `const { tokensIn,
tokensOut, grounding } = outcome;` and silently discarding `costUsd`. So
surfacing run cost is a wiring job (schema column + `completeAgentRun` +
contracts), never a provider/pricing job. Check what `ReviewOutcome` already
carries before adding anything to the LLM path.

Caveat from `reviewer-core/src/review/run.ts`: on the map-reduce strategy
`costUsd` collapses to `null` if *any* chunk lacks a cost — so null means
"unknown", and must not be rendered as $0.

## What Doesn't Work

## Codebase Patterns

### 2026-07-28 — list endpoints denormalize per-PR data with IN-query + JS grouping, not SQL joins

`GET /repos/:id/pulls` (`modules/pulls/routes.ts`) does not join `reviews` or
`agent_runs`. It collects `prIds`, runs one `inArray(...)` query ordered
`desc(createdAt/ranAt)`, and takes first-seen-per-PR in a JS `Map` as "the
latest". Follow that shape when adding another per-PR column (I added the
`latestRunByPr` block for tokens/cost this way).

Non-obvious part: the newest `agent_runs` row for a PR is frequently *not*
`done` (still running, or failed). Gate on `status === 'done'` when building
the map, otherwise the list shows a half-finished run's zeroed tokens — or
worse, silently falls through to an older run's numbers as if they were
current.

### 2026-07-28 — `vendor/shared` copies have already drifted

Diffing `server/src/vendor/shared` against `client/src/vendor/shared` shows
they're not identical: server has `sessionId`, the `openrouter` provider id,
`CommitFile`/`CommitFilesPayload` that client's copy lacks. There is no sync
script — editing a shared contract in one copy does not propagate to the
other; the other package keeps stale types and still type-checks clean.

## Tool & Library Notes

## Recurring Errors & Fixes

### 2026-07-28 — `.nullable()` on a shared contract breaks every fixture that builds it

Adding `cost_usd: z.number().nullable()` to `RunStats`/`RunSummary`
(`vendor/shared/contracts/trace.ts`) makes the *key required* — value may be
null, presence may not. Every object literal building one of those types
stops compiling until the field is added, including test fixtures far from
the change (`server/test/contracts.test.ts` `RunTrace` fixture, client's
`RunHistory.test.tsx` / `RunTraceDrawer.test.tsx`).

Use `.nullable()` when siblings are required-but-nullable (`RunStats`,
`RunSummary`); use `.nullish()` for `PrMeta`-style optional-tolerant types
where `score`, `opened_at` etc. are already `.nullish()`. Picking the wrong
one is not caught by tests — it shows up as a spray of TS2741/TS2719 errors
in unrelated files, or as a field that silently goes missing from responses.

## Session Notes

## Open Questions
