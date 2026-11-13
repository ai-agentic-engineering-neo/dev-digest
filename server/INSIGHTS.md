# Insights — server

Non-obvious, actionable lessons for this module — treat as high-confidence guidance.
Agents append via the `engineering-insights` skill (dated, atomic, append-only);
humans consolidate at ~100 entries.

## What Works
<!-- Approaches, patterns and solutions that proved effective -->

## What Doesn't Work
<!-- Dead ends and anti-patterns: the wrong approach and the right one -->

- **2026-09-23 · Re-export shims** — `platform/grounding.ts`, `prompt.ts` and
  `structured.ts` only re-export from `@devdigest/reviewer-core`. Import from the engine
  directly in new code.

## Codebase Patterns
<!-- Conventions, architecture decisions, naming -->

- **2026-09-23 · Single instance only** — `RunBus` (live log, cancellation) and
  `JobRunner` (p-queue) live in process memory. On boot, `app.ts` marks every
  `running` agent run as failed. Running two API instances against one DB breaks this.
- **2026-09-23 · Static module registry** — `@fastify/autoload` is a dependency, but
  modules are registered statically in `modules/index.ts` because dynamic `import()` of
  `.ts` files doesn't behave the same under tsx, bundlers and vitest.
- **2026-09-23 · Two LLM homes** — OpenAI and Anthropic providers live in
  `adapters/llm`, OpenRouter lives in `reviewer-core`. Pricing comes from the live
  `PriceBook` with `adapters/llm/pricing.ts` as fallback.
- **2026-09-23 · Review runs are fire-and-forget** — the review route queues runs and
  returns; `ReviewRunExecutor` runs agents sequentially in the background and reports
  progress over SSE.
- **2026-10-09 · Trace jsonb is cast, not parsed** — `getRunTrace` returns
  `run_traces.trace` as `RunTrace` without Zod, so old rows lack newly added fields.
  Make new `RunStats`/trace fields `.nullish()` and handle `undefined` in the UI.

## Tool & Library Notes
<!-- Quirks and gotchas of dependencies -->

- **2026-10-10 · Drizzle `sum()` is a string** — `sum(col)` returns a numeric string
  (or null), not a number. Convert with `Number()` before returning it from a route,
  or the API sends `"0.0027"`.
- **2026-10-10 · PR-list tests hit real GitHub** — `GET /repos/:id/pulls` syncs from
  GitHub whenever a token resolves (incl. `~/.devdigest/secrets.json`). Override
  `github` with a stub (`{ listPullRequests: async () => [] }`) to keep tests deterministic.

## Recurring Errors & Fixes
<!-- Error message / symptom → fix -->

- **2026-09-23 · Seed is required** — `LocalNoAuthProvider` always resolves the seeded
  system user and workspace; without `pnpm db:seed` requests fail with
  "No system user found".

## Session Notes
<!-- Dated 1–2 sentence summaries of meaningful sessions -->

## Open Questions
<!-- Unresolved items worth investigating -->
