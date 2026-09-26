# server — insights

Traps found while working here. Newest first, one entry per trap.
Format: date · symptom · cause · rule.

Appended by the `engineering-insights` skill: append-only, never rewritten.

## What Works

Approaches and solutions that held up here.

- **2026-09-22 — The codebase's first `db.transaction()` now exists: `AgentsRepository.setSkills`.**
  Supersedes the 2026-09-21 "ZERO `db.transaction()` calls" entry below — that
  trap still applies to every OTHER delete-then-reinsert (`pulls/routes.ts:264-301`
  is still untouched), but a working template now exists to copy: `await
  this.db.transaction(async (tx) => { await tx.delete(...).where(...); if
  (items.length) await tx.insert(...).values(...); })`, with every statement
  inside using `tx`, never `this.db`. No special Drizzle setup was needed beyond
  that — `postgres-js`'s `db.transaction` "just works" with the existing schema.
  Rule: when converting a delete-then-reinsert to a transaction, copy this shape
  rather than re-deriving it.
  `server/src/modules/agents/repository.ts` (`setSkills`)

- **2026-09-19 — Test fire-and-forget review behaviour by INSERTING runs, not by running one.**
  `runReview` returns before any agent finishes, so an integration test that
  drives it can only assert on what is written at CREATION time (ids,
  `round_id`) without a flaky wait. Everything derived from finished runs —
  cost rollups, status derivation — is better tested by inserting `agent_runs`
  rows directly and calling the route: `pulls-cost.it.test.ts` covers six
  branches in ~3s with exact arithmetic and no LLM.
  Rule: split these — creation-time facts in the run-the-review test, derived
  behaviour in a direct-insert `.it.test.ts`.
  `server/test/pulls-cost.it.test.ts`, `server/test/reviews.it.test.ts`

## What Doesn't Work

Dead ends and antipatterns. The most frequently skipped section and the most
valuable one.

- **2026-09-26 — A new enrichment step in `executeRuns` silently makes REAL network and LLM calls in `reviews.it.test.ts`, and blows its 10s budget.**
  `appWith` builds the app with the real `LocalSecretsProvider`, so on a machine
  with `~/.devdigest/secrets.json` any container-resolved client that a run now
  touches is the real one. Wiring `container.intent` into the executor made the
  seeded PR body ("Closes #471") trigger a real GitHub issue fetch plus a real
  OpenRouter `completeStructured` call: the "Deriving intent" step took ~17s, past
  `waitForPrRuns`'s 10s default, and 2-3 of 208 tests failed (map-reduce +
  grounding, dual-provider, accept/dismiss) with `reviews` empty. Typecheck and
  `arch:check` stayed green, and the failures moved between runs (2, then 3).
  Rule: when a step is added to `executeRuns`, extend `appWith` in the same change
  with an override for every client it can reach (`llm.<provider>`, `github`,
  `webFetch`, or `intent` itself); an unmocked one is a timeout in the test and
  spent tokens on a developer machine.
  `server/test/reviews.it.test.ts` (`appWith`), `server/test/helpers/runs.ts:19-31`

- **2026-09-23 — Deleting a PR's runs does NOT put it back to "Needs review".**
  The PR-list status comes from `pull_requests.last_reviewed_sha`, which a review
  sets (`reviews/repository/pull.repo.ts:43`) and nothing clears: `DELETE /runs/:id`
  removes the run and its findings, yet the PR stays `reviewed` while its head is
  unchanged (`deriveReviewStatus`, `pulls/status.ts:88`). The client's default
  `?status=needs_review` filter then hides it — PR #7 "vanished" mid demo take
  with `GET /pulls/:id/runs` → `[]`.
  Rule: to reach a once-reviewed PR from a script, test or demo, open the list with
  `?status=all`; never rely on `DELETE /runs` to reset review state.
  `server/src/modules/pulls/status.ts:88`, `server/src/modules/reviews/repository/pull.repo.ts:43`

- **2026-09-22 — A single `pnpm db:generate` that both DROPS a column and ADDS
  several new ones on the same table triggers an interactive "is this a
  rename?" prompt drizzle-kit cannot resolve in a non-interactive shell.**
  Replacing `conventions.accepted` (boolean) with a new `status` text column
  in the same schema edit made drizzle-kit ask "Is `scan_id` created or
  renamed from `accepted`?" — the CLI prints the TUI select and returns
  without writing a migration; there is no flag to answer it non-interactively.
  Rule: split the change into two `db:generate` passes — first ADD every new
  column while leaving the old one in place (unambiguous, no prompt), run
  `pnpm db:generate`, THEN remove the old column alone in a second pass and
  generate again. Never try to answer the prompt; restructure the schema
  edit instead.
  `server/src/db/migrations/0013_shallow_sir_ram.sql`, `0014_giant_warbird.sql`

- **2026-09-22 — A NEW module that needs another module's SERVICE (not just
  its repository) trips `arch:check`'s `no-circular` the moment `container.ts`
  is taught to construct it.**
  Adding a `container.skills` getter (`new SkillsService(this)`) so
  `conventions/service.ts` could reuse skill-creation logic failed with
  `no-circular: skills/service.ts → container.ts → skills/service.ts` —
  `SkillsService`'s constructor takes `Container`, so `container.ts`
  constructing it is a real cycle, not a false positive. The identical shape
  already exists for `RepoIntelService`/`container.repoIntel`, but only
  because it is grandfathered in `.dependency-cruiser-known-violations.json`
  — a NEW instance of the same pattern is not, and the rule forbids
  re-baselining to make it pass.
  Rule: don't add a container facade for another module's service. Instead
  (a) if the other module already exposes its repository via the container
  (e.g. `container.skillsRepo`), call the repository directly and write your
  own small DTO-mapping helper locally — importing the other module's
  `service.ts` OR `helpers.ts` is `no-cross-module-imports`, a separate
  violation from the circular one; (b) for a plain cross-cutting function
  like `resolveFeatureModel` that only needs `container.db`, retype its
  parameter from `Container` to a minimal structural interface (`{db: Db}`)
  so the function never imports `Container` at all — the real `Container`
  still satisfies it structurally, and the cycle disappears at the type level.
  `server/src/modules/settings/feature-models.ts` (`FeatureModelContainer`),
  `server/src/modules/conventions/service.ts` (uses `container.skillsRepo` +
  a local `toSkillDto`, not a `container.skills` facade)

- **2026-09-21 — The server has ZERO `db.transaction()` calls; multi-step writes are not atomic.**
  `GET /pulls/:id` refreshes from GitHub by deleting `pr_files`, inserting new rows,
  deleting `pr_commits`, inserting again, then updating `pull_requests` as five
  separate statements inside one `try`. Its `catch` assumes "offline, serve
  persisted detail" — but if a later statement throws, the earlier delete has
  already committed, so it serves a PR with no files or commits.
  Rule: any write that deletes-then-reinserts or touches more than one table goes
  in `container.db.transaction(async (tx) => …)`, and every statement in it uses `tx`.
  `server/src/modules/pulls/routes.ts:264-301` (`grep -rn "\.transaction(" server/src` → empty)
  Confidence: low

- **2026-09-20 — Grepping `pgTable('name'` silently UNDERCOUNTS the schema.**
  The schema files mix two formattings: `pgTable('agents', {` on one line, and
  `pgTable(` with the name on the NEXT line (`pulls.ts`, `repos.ts`, and others).
  `grep -oE "pgTable\(\s*'[a-z_]+'"` therefore returned a table list that was
  missing `pull_requests` and `repos` entirely — with no error, just a shorter
  answer that looked complete. An inventory built on it is wrong in the one way
  nobody double-checks.
  Rule: to enumerate tables, match BOTH shapes (same-line and the line after
  `pgTable(`), or read the barrel `src/db/schema.ts` and each file's exports —
  never trust a single-line grep over this schema.
  `server/src/db/schema/pulls.ts`, `server/src/db/schema/repos.ts`

- **2026-09-19 — The seeded review was invisible to anything that joins reviews to runs.**
  `seed.ts` wrote the demo review with no `run_id` and no `agent_id` (it is
  inserted before any agent exists), while `seedAgentRuns` wrote five unrelated
  `agent_runs`. A timeline feature that matches `RunSummary.run_id` to
  `ReviewRecord.run_id` therefore rendered its fallback branch on every row of a
  freshly seeded DB and looked broken. Fixed by having one seeded run claim the
  review (`ownsSeedReview` → `UPDATE reviews SET run_id, agent_id`).
  Second half of the trap: `seed()` skips the whole PR block once PR #482 exists,
  so editing seeded rows changes NOTHING on an existing dev DB — verify seed
  edits against a fresh database (testcontainers or the hermetic e2e stack).
  Rule: when seeding two tables that a feature joins, seed the link too, and
  never conclude a seed edit works because the dev DB still looks right.
  `server/src/db/seed.ts` (`seedAgentRuns`, `ownsSeedReview`)

- **2026-09-19 — `waitForPrRuns` returns on TIMEOUT, it does not throw.**
  Its doc says it "polls until every row reaches a terminal status", but after
  `timeoutMs` (default 10s) it returns whatever rows exist. A `POST
  /pulls/:id/review` with `{ all: true }` does NOT settle inside that window, so
  assertions silently ran against rows still in `status: 'running'` — the
  failure surfaced far downstream as `expected 1 to be greater than or equal to
  2`, not as a timeout.
  Rule: after `waitForPrRuns`, ASSERT the statuses are terminal before asserting
  on anything the executor writes — or don't depend on completion at all (see
  the paired entry in What Works).
  `server/test/helpers/runs.ts:19-31`

## Codebase Patterns

Conventions and structural decisions a newcomer would otherwise re-derive.

- **2026-09-25 — `truncateSampleFile`'s byte cap is NOT strict, despite its comment.**
  The comment says "Byte-cap without splitting a multi-byte codepoint", but
  `Buffer.from(out).subarray(0, MAX_SAMPLE_FILE_BYTES).toString('utf8')` cuts
  mid-codepoint and decodes the tail as U+FFFD. 6000 × `日` (18000 bytes) comes
  back as 16386 bytes, ending in `�` — 2 bytes over the 16384 cap, with a
  character the source file never had. `capSamplesForPrompt` sums the real
  post-cut size, so the 60 KB total stays honest; only the per-file cap and the
  "no split" claim are wrong.
  Rule: do not document, test or rely on C1's per-file cap as an exact bound or
  on the "no split" claim; a strict test of either fails today. Fixing it means
  backing off to a codepoint boundary before `toString`.
  `server/src/modules/conventions/helpers.ts:64-67` ·
  `node -e 'const s="日".repeat(6000);const o=Buffer.from(s).subarray(0,16384).toString();console.log(Buffer.byteLength(o),o.endsWith("�"))'` → `16386 true`

- **2026-09-22 — Copying `agents/helpers.ts`'s `import type {XRow} from './repository.js'` shape into a NEW module trips `arch:check`'s `no-circular` rule.**
  `agents/helpers.ts` ↔ `agents/repository.ts` IS circular (helpers imports
  `AgentRow`/`AgentVersionRow` types from repository; repository imports
  `isConfigChange` from helpers) — but it's pre-existing debt already recorded in
  `.dependency-cruiser-known-violations.json`, so `arch:check` stays green for it.
  The identical shape in a brand-new module (`skills/helpers.ts` importing
  `SkillRow`/`SkillVersionRow` from `skills/repository.ts`, which imports
  `isSkillConfigChange` from helpers) is NOT grandfathered and fails
  `pnpm run arch:check` with `error no-circular: skills/helpers.ts →
  skills/repository.ts → skills/helpers.ts`.
  Rule: in a new module, declare the row shape `helpers.ts` needs as a local
  structural interface (e.g. `SkillRowLike`) instead of importing the
  repository's exported row type — the repository's real row satisfies it
  structurally, so the back-edge (and the cycle) never forms.
  `server/src/modules/skills/helpers.ts`, `server/src/modules/skills/repository.ts`

- **2026-09-22 — A Drizzle `text(col, {enum:[...]})` hint is NOT a DB constraint — the column can hold values outside the listed enum.**
  `skills.source`'s Drizzle enum still lists only `['manual','imported_url',
  'extracted','community']` while the `SkillSource` contract
  (`vendor/shared/contracts/knowledge.ts`) also has `imported_file` (S6 import).
  The migration creates the column as plain `text NOT NULL` with no Postgres
  CHECK constraint (`0000_init.sql:316-328`), so writing `'imported_file'` is
  safe at runtime — only Drizzle's TS-inferred union objects, via a cast at the
  write site (`values.source as typeof t.skills.$inferInsert.source`).
  Rule: when a contract enum gains a value a `text(col,{enum:[...]})` schema
  column's TS hint hasn't caught up to, don't wait for a migration to unblock
  you — confirm the CREATE TABLE has no CHECK constraint, then cast with a
  comment explaining why, rather than mis-widening the schema's enum list.
  `server/src/db/schema/skills.ts:13-15`, `server/src/db/migrations/0000_init.sql:316-328`,
  `server/src/modules/skills/repository.ts` (`insert`)

- **2026-09-21 — Half the modules do NOT follow the documented routes → service → repository anatomy.**
  `docs/architecture.md` presents the three-file module as the norm, but only
  `agents`, `repos`, `reviews` and `repo-intel` have it. `pulls` (18
  `container.db` calls), `exports` (4), `polling` (3), `settings` (3) and
  `workspace` (1) query Drizzle straight from `routes.ts` with no service or
  repository — `pulls/routes.ts` is the largest route file at 407 lines.
  Rule: do NOT copy a neighbouring module's shape as "the convention" — new code
  follows the documented anatomy, and edits to those five modules extract into a
  service/repository instead of adding more inline queries.
  `grep -c "container.db" server/src/modules/*/routes.ts`

- **2026-09-19 — `findings` is the ONE domain table with no `workspace_id`.**
  Root `CLAUDE.md` says every domain table carries `workspace_id` and every query
  scopes by it — `findings` does not, and it has no indexes either (not even on
  `review_id`). Tenancy reaches a finding only through its review, so any
  aggregate over findings must `innerJoin(t.reviews, eq(t.reviews.id,
  t.findings.reviewId))` and scope on `t.reviews.workspaceId`. The join is not an
  optimisation, it IS the tenancy boundary.
  Rule: NEVER filter findings by PR id alone — join reviews and assert the
  workspace there, the way the PR-list FINDINGS rollup does.
  `server/src/db/schema/reviews.ts:29-47`, `server/src/modules/pulls/routes.ts` (FINDINGS rollup)

- **2026-09-19 — A run's cost is `null` for "unknown", `0` for "free" — never conflate them.**
  `estimateCost` returns `null` for a model missing from the price table, while
  `z-ai/glm-4.7-flash` is priced at exactly 0. The run-executor failure path sets
  `tokensIn: 0, tokensOut: 0` — copying that symmetry for cost would report a
  failed run as free. Rule: the failure path writes `costUsd: null`, and every
  cost column/field stays nullable so the UI can render an em dash.
  `server/src/modules/reviews/run-executor.ts` (catch block), `server/src/adapters/llm/pricing.ts:37`

- **2026-09-19 — `completeAgentRun`'s value type is declared TWICE.**
  The inline `values` type exists in `repository/run.repo.ts` AND is re-declared
  on the `repository.ts` facade method. Adding a field to only one gives
  `TS2353: 'costUsd' does not exist in type …` at the call site, not at the repo.
  Rule: when extending any repository facade method, patch BOTH declarations.
  `server/src/modules/reviews/repository.ts:151`, `server/src/modules/reviews/repository/run.repo.ts:141`

## Tool & Library Notes

Quirks of the dependencies this package pins.

- **2026-09-22 — `pnpm exec vitest run .it.test` is flaky in a sandboxed shell: testcontainers' Reaper handshake and its Postgres connection both time out non-deterministically.**
  Running a single `*.it.test.ts` file (or the whole `.it.test` glob) here
  intermittently throws `Error: Failed to connect to Reaper`
  (`testcontainers/src/reaper/reaper.ts`) or `write CONNECT_TIMEOUT
  localhost:<port>` (`postgres/src/connection.js`) — even against an UNRELATED,
  previously-green test file run moments earlier. It's the sandbox's outbound
  TCP to a freshly-published, per-run Docker port that's unreliable, not the
  test's own code. A run that hits vitest's 120s hook timeout also leaks an
  orphaned `pgvector/pgvector:pg16` testcontainer (`docker ps -a` shows a
  randomly-named one alongside `devdigest-postgres`) because `afterAll` never
  runs to call `pg.stop()`.
  Rule: set `TESTCONTAINERS_RYUK_DISABLED=true` for the run (skips the Reaper
  handshake entirely — `testcontainers/build/reaper/reaper.js` reads it as a
  plain env var, not from `~/.testcontainers.properties`), `docker rm -f` any
  container leaked by a prior timed-out attempt, and just retry on
  `CONNECT_TIMEOUT` / `Failed to connect to Reaper` — both are transient. Don't
  conclude an `.it.test.ts` file is broken from one failed run in this
  environment.
  Confidence: low

- **2026-09-21 — `arch:check`'s baseline pins the pnpm store path, so a drizzle bump "creates" violations.**
  `.dependency-cruiser-known-violations.json` records targets as
  `node_modules/.pnpm/drizzle-orm@0.38.4_postgres@3.4.9/node_modules/drizzle-orm/index.d.ts`
  (4 entries). Bumping drizzle-orm or postgres changes that path, so the old
  `routes → drizzle` debt no longer matches and `pnpm run arch:check` fails on a PR
  that touched no import.
  Rule: after a dependency bump, run the full report
  (`pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type err`),
  confirm every "new" violation is a renamed store path of a known one, THEN
  `pnpm run arch:baseline`. Never baseline anything else.
  `server/.dependency-cruiser-known-violations.json`
  Confidence: low

- **2026-09-19 — Drizzle's `count()` is NOT the same hazard as `sum()`: it maps to a number.**
  `sum()` is typed `string | null` and has to go through `parseAggregateCost`
  (see the entry below). `count()` is declared with `.mapWith(Number)` and, over
  a `GROUP BY` whose group exists, is never NULL — Postgres returns 0 rows for an
  empty group rather than a row containing NULL.
  Rule: do NOT wrap `count()` in `parseAggregateCost` "for symmetry" — the null
  it guards against cannot occur, and the wrapper only hides that fact. Decide
  "absent vs zero" in the caller instead (the PR-list rollup gates on whether the
  PR has a review at all).
  `server/src/modules/pulls/routes.ts` (FINDINGS rollup), `server/src/modules/pulls/status.ts`

- **2026-09-19 — Drizzle types `sum()` as `string | null`, even over `doublePrecision`.**
  `aggregate.d.ts` declares `sum(expression): SQL<string | null>` regardless of
  the column type, while postgres.js hands back a real number for
  `double precision` — so an aggregate's value must be coerced accepting BOTH.
  The trap is the null: `Number(null)` is 0, which turns "no price data" into
  "this was free" (the read-path twin of the write-path rule in Codebase
  Patterns). Postgres `sum()` already skips NULLs and yields NULL when none
  remain, so the partial-sum rule needs no JS branches — only the coercion.
  Rule: put every SQL aggregate over a nullable numeric column through
  `parseAggregateCost`, and NEVER shorten it to a bare `Number(...)`.
  `server/src/modules/pulls/status.ts`, `server/src/modules/pulls/routes.ts` (PR-list COST)

## Recurring Errors & Fixes

An error seen twice, plus the fix that actually worked.

## Session Notes

Dated summary, only when a session changed how this package is worked on.

## Open Questions

What was left unresolved, so the next session does not re-investigate blind.

- **2026-09-26 — `undici` 8 declares `engines.node >=22.19.0`, above the repo's ">=22".**
  `pnpm add undici` for `HttpWebFetchClient` resolved 8.11.2, whose lockfile entry
  requires Node 22.19+; root `CLAUDE.md` promises only ">=22" and `server/package.json`
  has no `engines`. It ran on the local Node 26.9 only, so nothing here proves it
  works on Node 22.0-22.18. Unresolved: raise the documented floor, or pin `undici`
  to `^7`.
  Rule: until decided, do not assume the web-fetch adapter loads on an older Node 22.
  `server/pnpm-lock.yaml` (`undici@8.11.2` › `engines`), `server/src/adapters/http/web-fetch.ts`
