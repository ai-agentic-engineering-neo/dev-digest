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
- **2026-10-15 · Drizzle leaks past repositories** — `pulls`, `settings`, `polling`,
  `workspace` routes and `reviews/run-executor.ts`, `diff-loader.ts` query `container.db`
  directly. Don't copy them as templates; follow `modules/repos/` and the
  `onion-architecture` skill (queries only in `repository*`).

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

- **2026-10-16 · Skills in the run** — `run-executor.buildSkills` sends attached skills
  (`agent_skills` row, ordered) only when `skills.enabled` is on; it logs one
  `skill attached:` line each and writes `trace.skills_used`. Changing an agent's skill
  links does NOT bump the agent version — only `agents` config edits do.

- **2026-10-16 · Text enums need no migration** — `skills.type` / `skills.source` (and
  other `text('x', { enum })` columns) are plain `text` in SQL with no CHECK, so adding
  a value is a TS + Zod change only (`imported_file` was added this way).

## Tool & Library Notes
<!-- Quirks and gotchas of dependencies -->

- **2026-10-10 · Drizzle `sum()` is a string** — `sum(col)` returns a numeric string
  (or null), not a number. Convert with `Number()` before returning it from a route,
  or the API sends `"0.0027"`.
- **2026-10-10 · PR-list tests hit real GitHub** — `GET /repos/:id/pulls` syncs from
  GitHub whenever a token resolves (incl. `~/.devdigest/secrets.json`). Override
  `github` with a stub (`{ listPullRequests: async () => [] }`) to keep tests deterministic.

- **2026-10-16 · fflate lists without inflating** — `unzipSync(buf, { filter: f => (seen.push(f), false) })`
  enumerates entries (with `originalSize`) without decompressing anything; skill import
  uses this two-pass pattern so only `SKILL.md` is ever inflated.

## Recurring Errors & Fixes
- **2026-10-16 · `db:generate` hangs on a rename prompt** — when one schema change both
  drops and adds columns on a table, drizzle-kit asks interactively "rename or create?"
  and the command blocks forever in a non-TTY shell. Split it: generate the additive
  migration first, then remove the old column and generate again (0011/0012 conventions).

<!-- Error message / symptom → fix -->

- **2026-10-20 · Failed background job killed the API** — `JobRunner.enqueue` returns a
  `done` promise that rejects on final failure; fire-and-forget callers (`RepoService.refresh`
  / `add`) never awaited it, so a failing clone (e.g. seeded `acme/payments-api`) became an
  unhandled rejection and Node exited → client shows "Cannot reach the DevDigest engine".
  `enqueue` now attaches `done.catch(() => {})`; keep job failures on the `jobs` row.

- **2026-09-23 · Seed is required** — `LocalNoAuthProvider` always resolves the seeded
  system user and workspace; without `pnpm db:seed` requests fail with
  "No system user found".

## Session Notes
<!-- Dated 1–2 sentence summaries of meaningful sessions -->

## Open Questions
- **2026-10-16 · Feature-model defaults need an OpenAI key** — `conventions` (and the other
  `FEATURE_MODELS` entries) default to `openai`/`gpt-5.4`; with only an OpenRouter key
  extraction fails with "OPENAI_API_KEY is not configured" until a Settings → Feature
  Models override is saved. Consider an OpenRouter fallback default.

<!-- Unresolved items worth investigating -->

- **2026-10-15 · `RipgrepCodeIndex.grep` arg injection** — the pattern is passed to `rg`
  as a positional arg, so a pattern starting with `-` (e.g. `--pre=<cmd>`) is parsed as a
  flag. Unused today; pass it as `-e <pattern>` before wiring it to LLM tool calls.

