# Insights — server

Non-obvious findings a future session needs. **Read this before working here.**

- Entry: `- YYYY-MM-DD — <what surprised us> → <what to do instead>. (ref: file:line / PR)`
- Append only. Never rewrite an entry — correct it with a dated line beneath it.
- Never trim this file yourself — past 100 lines, propose a consolidation pass.
  It is `@import`ed into every session for this package, so length has a real cost.
- Settled knowledge moves to [docs/](docs/); this file is the draft, not the doc.
- Captured by the `engineering-insights` skill.

> **Consolidated 2026-09-23 and 2026-09-26** with the user's approval: merged
> parent+correction pairs, condensed entries, pointed settled knowledge at
> `TESTING.md` and `server/specs/`, folded spent session notes. No finding was
> dropped. Prior text: `git show 79836e0:server/INSIGHTS.md`.

## What Works

- 2026-09-22 — A "new" lesson feature here is usually mostly PRE-BUILT (tables,
  contracts, routes, i18n, even mock call shapes — L02 skills' runtime gap was
  three lines) → before estimating, grep its nouns in `db/schema.ts`,
  `vendor/shared/contracts/`, `reviewer-core/src/prompt.ts`,
  `src/adapters/mocks.ts`, `client/messages/en/*.json` and
  `client/src/components/app-shell/helpers.ts`. A mock's comment is the
  strongest signal: it describes the call shape the feature was designed to
  make. (ref: src/adapters/mocks.ts:49)

## What Doesn't Work

- 2026-09-24 — `waitForPrRuns` proves only that `agent_runs.status` is terminal,
  and that row is written INSIDE `runOneAgent`, before `executeRuns` logs
  `review: agent … done` — asserting that log right after it is flaky under the
  parallel `.it.test` suite → poll for the log call itself (a local `waitForCall`
  loop). (ref: server/test/helpers/runs.ts:14, server/test/prompt-log.it.test.ts)

- 2026-09-24 — A green CI does not prove the `.it.test` suite is hermetic → run
  server tests through `scripts/hermetic.sh` (`TESTING.md` § Running locally), and
  treat a new LLM call on a shared path as LIVE in every existing test that does
  not override `secrets`. (ref: server/src/adapters/secrets/local.ts:36)
- 2026-09-26 — Correction to the line above: until today `hermetic.sh` was not
  hermetic when `server/.env` holds a key — `env -u KEY` makes it ABSENT, and
  `import 'dotenv/config'` refills absent vars from `.env` → the script now sets
  each key to `''` (dotenv leaves present vars alone; consumers test truthiness).
  Distrust `.it` "hermetic" results from before this date. (ref: scripts/hermetic.sh:56)

- 2026-09-22 — A foreign key proves EXISTENCE, not tenancy: `agent_skills.skill_id`
  has no workspace predicate, so `setSkills` linked another workspace's skill →
  when a write takes an id from the request BODY, check ownership before the
  insert: `SkillsRepository.existingIds(workspaceId, ids)` + `ValidationError` on
  the difference (asserted by a 422). (ref: server/src/modules/agents/service.ts:202)

- 2026-09-20 — `seed.ts` inserts NO `agent_runs` and its review has
  `run_id = NULL`, so a read path keyed on runs shows `—` on every fresh DB → give
  a run-keyed column an explicit fallback to the review-keyed source, and treat
  "a run exists but produced no review" as unknown, never as `0`.
  (ref: server/src/db/seed.ts:136, server/src/modules/pulls/routes.ts:242)

## Codebase Patterns

## Tool & Library Notes

- 2026-09-26 — (moved from root INSIGHTS.md 2026-09-23, consolidation) A
  structured LLM response's FIELD ORDER is its generation order: the course
  author's conventions scan put `category` first and a live scan collapsed to one
  category with a flat 0.90 confidence → in a structured-output schema put the
  evidence/reasoning fields before the verdict fields they should inform.
  (ref: `git log --all --grep conventions` → `641b637`)

- 2026-09-23 — `StructuredRequest.timeoutMs` is PER ATTEMPT and `maxRetries`
  defaults to 2, so a tight bound silently reprompts and pays for the whole
  prompt again (`StructuredResult.attempts` is the only tell) → set `timeoutMs`
  to what the call needs and pass an explicit `maxRetries`; worst case is
  `timeoutMs × (maxRetries + 1)`. (ref: adapters/llm/openai.ts:90,108)

- 2026-09-23 — A second API server on `:3001` exits with `EADDRINUSE` while your
  `curl localhost:3001` keeps returning 200, served by the developer's already
  running `pnpm dev` — which tsx-watches, so it has your new module too. The
  error appears only in the log you redirected → check `lsof -ti:3001` before
  starting a server, and read that log rather than trusting the HTTP response.

- 2026-09-20 — `defaultNow()` cannot tell which rows were created together:
  Postgres evaluates `now()` once per TRANSACTION, so separate INSERTs in a loop
  get distinct instants → stamp ONE `new Date()` in the caller and pass it to
  every insert. Same trap in `eval_runs` / `ci_runs` / `multi_agent_runs`.
  (ref: server/src/modules/reviews/service.ts:127)

- 2026-09-19 — drizzle-kit names migrations randomly, so a dropped column leaves
  no searchable trace (`0009_complex_runaways.sql` dropped `agent_runs.cost_usd`,
  commit `d45ab0d`) → before assuming a field never existed, run
  `git log -p --reverse -- src/db/migrations/*.sql`.

## Recurring Errors & Fixes

- 2026-09-19 / 2026-09-22 — Markdown heuristics mangle code-shaped text, twice,
  and unit tests miss it because fixtures carry no code punctuation → put a
  code-shaped string (`` `sk_live_` ``, `=>`, `#482`) in the fixture whenever
  markdown meets code:
  1. never strip `_`, `>` or `#` globally — strip LEADING block markers per line
     (`/^\s*(?:#{1,6}\s+|>\s*|[-+*]\s+)/gm`) plus `**` and backticks.
     (ref: server/src/modules/pulls/status.ts:previewDescription)
  2. detect an ATX heading with `/^#{1,6}\s+\S/`, never a bare `#` prefix.
     (ref: server/src/modules/skills/helpers.ts:parseMarkdownSkill)

## Session Notes

- 2026-09-24 — L03 intent layer: added `modules/intent/` (link resolution,
  code-computed confidence tiers, cached cheap-model classification) wired into
  `executeRuns` pre-work, migration 0013 (spec: server/specs/L03-intent-layer.md).
- 2026-09-19 → 23 — L01 findings visibility, L02 skills (`modules/skills/`) and
  L02 conventions (`modules/conventions/`) — specs: `server/specs/L0{1,2}-*.md`.

## Open Questions
