# Insights — server

Non-obvious findings a future session needs. **Read this before working here.**

- Entry: `- YYYY-MM-DD — <what surprised us> → <what to do instead>. (ref: file:line / PR)`
- Append only. Never rewrite an entry — correct it with a dated line beneath it.
- Never trim this file yourself — past 100 lines, propose a consolidation pass.
  It is `@import`ed into every session for this package, so length has a real cost.
- Settled knowledge moves to [docs/](docs/); this file is the draft, not the doc.
- Captured by the `engineering-insights` skill.

> **Consolidated 2026-09-23** with the user's approval: merged two
> parent+correction pairs (pre-built features; markdown heuristics), condensed
> three entries, folded two spent session notes into one line. No finding was
> dropped. Prior text: `git show HEAD:server/INSIGHTS.md`.

## What Works

- 2026-09-22 — A "new" lesson feature here is usually mostly PRE-BUILT, and the
  starter gives no hint of it. L02 skills: the three tables were already in
  `0000_init.sql`, the contracts in `contracts/knowledge.ts`,
  `GET`+`POST /agents/:id/skills` already routed and `assemblePrompt` already
  rendering a `## Skills / rules` section — the whole runtime gap was THREE lines
  in `run-executor.ts` that never read the links. L02 conventions (2026-09-23)
  found the same but wider: the table, the contract,
  `FEATURE_MODELS.conventions`, the i18n namespace, `activeKeyFor()` mapping
  `/conventions`, and a `MockLLMOptions.structuredBySchema` comment naming
  `'ConventionFileSelection'` then `'ConventionExtraction'` → before estimating a
  feature, grep its nouns in `db/schema.ts`, `vendor/shared/contracts/`,
  `reviewer-core/src/prompt.ts`, `src/adapters/mocks.ts`,
  `client/messages/en/*.json` and `client/src/components/app-shell/helpers.ts`.
  A mock's comment is the strongest signal of all: it describes the call shape
  the feature was designed to make. (ref: server/src/db/schema/skills.ts:1,
  src/adapters/mocks.ts:49)

## What Doesn't Work

- 2026-09-24 — `waitForPrRuns` proves only that `agent_runs.status` is
  terminal, and that row is written INSIDE `runOneAgent` — before it returns
  and `executeRuns` logs `review: agent … done`. A test asserting that log line
  right after `waitForPrRuns` passed 3/3 alone and failed once under the full
  parallel `.it.test` suite → for anything emitted after the status write,
  poll for the log call itself (a local `waitForCall` loop), not for the run.
  (ref: server/test/helpers/runs.ts:14, server/src/modules/reviews/run-executor.ts:120-130,
  server/test/prompt-log.it.test.ts)

- 2026-09-24 — A green CI does not prove the `.it.test` suite is hermetic:
  `reviews.it.test.ts` and `skills-prompt.it.test.ts` override only
  `llm.openai`, and `LocalSecretsProvider` falls back from
  `~/.devdigest/secrets.json` (path from `homedir()`) to `process.env`. When
  L03 added an intent call to `executeRuns` pre-work whose default provider is
  `openrouter`, every review in those tests hit the REAL OpenRouter on a
  machine with a stored key — billed calls, and 3 tests failing at
  `waitForPrRuns`' 10 s default, which reads like a code bug. CI has no keys,
  so the same code there fails fast with `ConfigError` and passes → run server
  tests through `scripts/hermetic.sh` (throwaway `HOME`, provider env unset;
  64/64 green where the bare run failed 3), and treat a new LLM call on a
  shared path as live in every existing test that does not override
  `secrets`. (ref: server/src/adapters/secrets/local.ts:36,
  server/src/platform/config.ts:74, server/test/helpers/runs.ts:16)

- 2026-09-22 — A foreign key proves EXISTENCE, not tenancy: `agent_skills.
  skill_id` references `skills.id` with no workspace predicate, so
  `AgentsRepository.setSkills` happily linked another workspace's skill and its
  body would then have been injected into this workspace's review prompts —
  every read path was workspace-scoped, so nothing looked wrong → when a write
  takes an id from the request body (not the path), check ownership explicitly
  before the insert; `SkillsRepository.existingIds(workspaceId, ids)` +
  a `ValidationError` on the difference is the pattern, now asserted by a 422
  case. (ref: server/src/modules/agents/service.ts:202,
  server/test/skills-prompt.it.test.ts)

- 2026-09-20 — Any read path keyed on `agent_runs` silently dies on a fresh
  local DB: `seed.ts` inserts NO `agent_runs` rows and its one review carries
  `run_id = NULL`, so re-pointing the PR list's FINDINGS column from "latest
  review" to "latest run" would have shown `—` on the seeded PR for every
  developer and every e2e run, with nothing broken to debug → give a run-keyed
  column an explicit fallback to the review-keyed source, and check what
  `seed.ts` actually inserts before assuming a table has rows. The same query
  also needs the case where a run exists but produced no review (every agent
  failed) — falling through to `0` there claims the PR is clean when nothing
  looked at it. (ref: server/src/db/seed.ts:136,
  server/src/modules/pulls/routes.ts:242)

## Codebase Patterns

## Tool & Library Notes

- 2026-09-23 — `StructuredRequest.timeoutMs` is PER ATTEMPT, not per call, and
  `maxRetries` defaults to 2 (`adapters/llm/openai.ts:90,108` — the timeout sits
  INSIDE the retry loop), so a bound that is merely tight does not fail: it
  silently reprompts. A conventions scan set 120_000 and took 2 min 32 s
  wall-clock for a call that reports one model answer — attempt 1 was cut off at
  120 s and the retry paid for the whole prompt again, with nothing in the
  response saying so (`StructuredResult.attempts` is the only tell, and no
  caller reads it) → for a long single-shot call set `timeoutMs` to what the
  call actually needs and pass an explicit `maxRetries`; worst case is
  `timeoutMs × (maxRetries + 1)`. (ref: server/src/modules/conventions/constants.ts:48)

- 2026-09-23 — A second API server on `:3001` exits with `EADDRINUSE` while your
  `curl localhost:3001` keeps returning 200, served by the developer's already
  running `pnpm dev` — which tsx-watches, so it has your new module too. The
  error appears only in the log you redirected → check `lsof -ti:3001` before
  starting a server, and read that log rather than trusting the HTTP response.

- 2026-09-20 — A `defaultNow()` timestamp CANNOT be used to tell which rows were
  created together: Postgres evaluates `now()` once per transaction, so N
  separate INSERTs get N distinct instants. `ReviewService.runReview` queues one
  `agent_runs` row per agent in a sequential loop, so "group the runs of the last
  review by `ran_at`" returned three batches of one — it looks correct in the
  schema and silently does nothing → stamp ONE `new Date()` in the caller and
  pass it to every insert (keep the column default for single-row callers). Same
  trap in `eval_runs` / `ci_runs` / `multi_agent_runs`.
  (ref: server/src/modules/reviews/service.ts:127,
  server/src/modules/reviews/repository/run.repo.ts:118)

- 2026-09-19 — drizzle-kit names migrations randomly, so a column that vanished
  from `src/db/schema/` leaves no searchable trace: `0009_complex_runaways.sql`
  is what dropped `agent_runs.cost_usd`, and grepping `src/` for `cost_usd`
  returns only unrelated tables plus snapshot JSON → when a field is referenced
  by old code, contracts or a design but missing from the schema, run
  `git log -p --reverse -- src/db/migrations/*.sql` to find the commit and its
  stated reason before assuming it never existed.
  (ref: server/src/db/migrations/0009_complex_runaways.sql:1 / commit d45ab0d)

## Recurring Errors & Fixes

- 2026-09-19 / 2026-09-22 — Markdown heuristics mangle code-shaped text, twice
  here, and unit tests miss it every time because fixtures carry no code
  punctuation — put a code-shaped string in the fixture whenever markdown meets
  code:
  1. A global strip (``/[`*_>#]/g``) over a finding's rationale turned the seeded
     `` `sk_live_` `` into "sklive", and would equally eat `=>` and `#482` →
     strip LEADING block markers per line
     (`/^\s*(?:#{1,6}\s+|>\s*|[-+*]\s+)/gm`) plus `**` and backticks; never
     strip `_`, `>` or `#` globally.
     (ref: server/src/modules/pulls/status.ts:previewDescription)
  2. Skipping headings with `line.startsWith('#')` ate prose: a skill's derived
     description dropped `#482 is not a title` and returned `''`, because an ATX
     heading requires whitespace after the hashes and the name parser already
     used `/^#\s+\S/` while the description filter did not → test
     `/^#{1,6}\s+\S/`, never a bare `#` prefix.
     (ref: server/src/modules/skills/helpers.ts:parseMarkdownSkill)

## Session Notes

- 2026-09-24 — L03 intent layer: added `modules/intent/` (link resolution,
  code-computed confidence tiers, cached cheap-model classification) wired into
  `executeRuns` pre-work, migration 0013 (spec: server/specs/L03-intent-layer.md).
- 2026-09-23 — L02 conventions: added `modules/conventions/` (code sampling →
  one structured call → a code-only evidence gate), migration 0012 and the
  three-state triage (spec: server/specs/L02-conventions.md).
- 2026-09-22 — L02 skills: added `modules/skills/` (CRUD, body-only versioning,
  destructive restore, the `skill_types` catalogue, markdown import preview),
  per-link `agent_skills.enabled`, and the run-executor wiring that puts ordered
  skill bodies into the prompt (spec: server/specs/L02-skills.md).
- 2026-09-19 → 20 — L01 findings visibility: `PrMeta.latest_findings` counts +
  capped preview, later re-keyed to the latest RUN with a review fallback
  (spec: server/specs/L01-findings-visibility.md).

## Open Questions
