# Multi-Agent Review — Implementation Plan

## Source requirements

[`specs/13-multi-agent-review.md`](../specs/13-multi-agent-review.md) (SPEC-13,
Lesson L07). This plan covers **every** acceptance criterion in that spec:

| Area | AC-IDs |
|---|---|
| Configuring a run (Screens A/B) | AC-1 … AC-8 |
| Triggering a run | AC-9 … AC-15, AC-60, AC-61, AC-62 |
| Concurrent execution (scoped core exception) | AC-16 … AC-20 |
| Persistence and attribution | AC-21 … AC-24 |
| Results — common | AC-25 … AC-31 |
| Results — columns | AC-32 |
| Results — tabs (+ Learn) | AC-33, AC-34, AC-63, AC-64, AC-65 |
| Conflicts | AC-35 … AC-42 |
| Per-agent logs (reuse) | AC-43 … AC-46 |
| Partial results and failure | AC-47 … AC-50 |
| Empty states, resume, reachability | AC-51, AC-66, AC-67, AC-68, AC-52 |
| Contracts, security, accessibility | AC-53 … AC-58 |
| Copy honesty | AC-59 |

Decisions D1–D26 and non-goals N1–N15 are **settled**; nothing below reopens
them. Load-bearing throughout, restated because they constrain almost every
file this plan touches:

- **Merge order is normative.** This branch merges **before**
  `specs/14-export-to-ci.md`. Nothing here reads or writes
  `vendor/shared/contracts/eval-ci.ts` (N11).
- **The scoped core exception is exactly one thing:** the per-agent job loop in
  `server/src/modules/reviews/run-executor.ts:161-200` runs concurrently
  (D16). Layering, persistence, per-agent error handling, cancellation, the SSE
  bus, the trace and the shared diff/intent pre-work are untouched (N2).
- **Adopt the seven reserved surfaces in place**, do not build a parallel set
  (D1, G9). This plan found an **eighth**: see finding 1.
- **Conflicts are computed on read, never stored** (D6, N13, AC-35).
- **`reviewer-core` is consumer-only and must end this pass unchanged** —
  `git diff reviewer-core/` must be empty (D4).
- **Both `vendor/shared` copies, hand-reconciled, no new drift** (D12, AC-53).

## Clarifications & recommendations

The spec's `[NEEDS CLARIFICATION]` section was handed over as **planning
input**, not as open questions. Items 1 (Learn gating) and 3 (triage state vs
the disagreement view) are product judgments the spec author left as-is — this
plan implements the spec text as written and does not reopen them. Items 2 and
4 are decided below. Item 5 is answered by finding 0.

### Finding 0 — repo-state grounding tools were unavailable again

`mcp__devdigest__get_conventions` / `get_blast_radius` / `get_findings` need
the local API on `http://localhost:3001`. It is **down** (`curl` → connection
refused), and the Docker daemon is not running either
(`Cannot connect to the Docker daemon`), so the Postgres the API needs could
not be started cheaply. This plan is therefore grounded exactly as the spec
was: in direct reads of the schema, contracts, executor, repositories, routes,
components, copy and all three `LEARNINGS.md` files. **Consequence to carry:**
if accepted repo conventions or prior DevDigest findings exist against
`modules/reviews` or the app-shell navigation, neither the spec nor this plan
has checked against them. Worth a `get_findings` pass once the stack is up,
before `pr-self-review`.

### D-P1 — clarification 2 (full-file findings flooding conflict matching) — DECIDED

**Two match classes, never cross-matched.** A finding is **file-scoped** when
its `kind` is one of `secret_leak` / `lethal_trifecta` / `phantom` / `hook`, OR
its `[start_line, end_line]` span exceeds `CONFLICT_MAX_RANGE_LINES` (ship
`50`). Otherwise it is **line-scoped**.

- Two file-scoped findings address the same location when their **file** and
  their **kind class** are equal — line numbers are ignored.
- Two line-scoped findings address the same location when their file is equal
  and their ranges intersect (AC-36, unchanged).
- A file-scoped finding and a line-scoped finding **never** address the same
  location.

Why this over the spec's other two options: "exclude full-file kinds entirely"
throws away exactly the signal a reviewer wants ("the security agent found a
committed key in this file and nobody else did"); "accept it this slice" ships
the flooding the spec already predicted. This variant keeps the signal, kills
the flooding, is one pure function, and is fully unit-testable with no I/O.

**The cost, stated so it is not discovered in review:** the four full-file kind
names are duplicated from `reviewer-core/src/grounding.ts:16`, where they are a
module-private `const`. Exporting them would edit `reviewer-core`, which D4
forbids. Declare them in `server/src/modules/reviews/constants.ts` with a
comment citing `grounding.ts:16` as the source of truth, and add a unit test
that pins the list so a future divergence is at least loud on our side.

**RECOMMENDATION, not a requirement:** revisit after real usage, per the
spec's own "no data yet" note. If it turns out full-file findings are rare in
practice, collapsing to the simpler "exclude them" rule is a two-line change.

### D-P2 — clarification 4 (conflict anchor line for a range) — DECIDED

`Conflict.line` (`observability.ts:68`) is **the minimum `start_line` among the
findings that flagged that location**, tie-broken by the lexicographically
smallest finding id. For a file-scoped location that is still the minimum
`start_line` of its flagging findings (usually 1). The conflicts array is
sorted by `(file, line, title)`.

Rationale: deterministic (the spec's "Determinism of conflicts" is a hard
requirement — the same stored run must yield the same conflicts on every read),
matches the spec's own stated "obvious default", and never invents a line
number that no finding actually cited.

### D-P3 — location grouping is an interval merge, not pairwise — planner call

Within one file's line-scoped findings: sort by `(start_line, end_line, id)`,
sweep, and start a new location whenever the next finding's `start_line`
exceeds the running location's maximum `end_line`. This is the transitive
closure of "ranges intersect", it is deterministic regardless of row order, and
it is O(n log n). **Caveat worth knowing:** a chain of overlapping ranges
(10–20, 18–25, 24–30) becomes **one** location even though the first and last
do not intersect. `CONFLICT_MAX_RANGE_LINES` (D-P1) bounds how far a single
finding can extend a chain; unbounded chaining across a file remains
theoretically possible and is accepted this slice.

### D-P4 — where the multi-agent code lives — planner call

**Inside `modules/reviews/`, not a new `modules/multi-agent/`.**

The trigger has to reuse `ReviewService.runReview`
(`modules/reviews/service.ts:141-176`) and `ReviewRunExecutor`; the read has to
reach `agent_runs`, `reviews` and `findings`, all owned by
`ReviewRepository`. `no-cross-module` (`.dependency-cruiser.cjs:63-76`) fires on
**any** file in a module folder including `routes.ts` and including
`import type`, so a separate module would need a container getter plus three
structural ports for zero architectural gain. The repo's own precedent is
decisive: `smart-diff.ts` (compute-on-read) and `adhoc.ts` (a second execution
posture) both landed **inside** `modules/reviews/` for exactly this reason.

Expected `pnpm arch` outcome: **zero** new baseline entries. If `pnpm arch`
fires, an import slipped in — fix the import, do **not** run `arch:baseline`
(`server/LEARNINGS.md:706-720`).

### D-P5 — Learn lives on the existing finding-action route — planner call

`FINDING_ACTIONS` (`modules/reviews/routes.ts:43`) becomes
`['accept', 'dismiss', 'learn']`, and `actOnFinding`
(`modules/reviews/findings.ts:11-34`) gains a `'learn'` case. The memory INSERT
goes in a new `modules/reviews/repository/memory.repo.ts` (the `/repository/`
subfolder is explicitly exempt from `db-only-in-repositories`,
`.dependency-cruiser.cjs:58-61`).

Alternative considered and rejected: a real `modules/memory/`. It would need a
structural `FindingLookup` port plus a container getter, and would mount a
second handler family under `/findings/:id/*` while the existing loop already
mounts the first — confusing for a write path the spec deliberately scoped to
"one row, no embedding, no retrieval" (D24). Leave a comment on the repo
function stating that a future Memory module owns read/curation and that these
rows must stay plain `kind: 'learning'` entries.

### D-P6 — `reviews.agent_id` / `run_id` stay nullable — planner call

AC-23 is a **behavioural** requirement ("shall record ... as non-null"), and it
already holds: `insertReview` is called with both fields on the only path that
writes reviews (`run-executor.ts:398-408`). Adding `NOT NULL` constraints would
be a schema tightening that fails against any dev DB carrying legacy null rows,
for no new guarantee. **Recommendation: cover AC-23 with an integration test,
add no constraint.** Flagging it because a reviewer could read the absence of a
constraint as an oversight — D9 says the same thing.

### Planner findings — read before coding

1. **There is an EIGHTH reserved surface the spec did not list: the client's
   Learn response type already exists.** `useFindingAction`
   (`client/src/lib/hooks/reviews.ts:150-172`) already types its response as
   `{ finding: ...; memoryId?: string }` (`:164`) and already accepts
   `action: FindingActionKind`, which already admits `'learn'`
   (`contracts/findings.ts:81-82`). `messages/en/prReview.json:8` already
   carries `finding.learn: "Learn"`. So the Learn action needs **no new client
   hook and no new client contract** — only the button, the wiring in
   `FindingsPanel`, and honest result copy (AC-65). Return `memoryId` from the
   server so that reserved field becomes load-bearing rather than dropped.

2. **`observability.ts` and `platform.ts` are byte-identical between the two
   `vendor/shared` copies today.** Verified mechanically: of the eight contract
   files, only `eval-ci.ts`, `knowledge.ts`, `productionize.ts`,
   `review-api.ts` and `trace.ts` drift. Both files this feature touches are
   clean, which makes AC-53's check trivially strong — after this pass,
   `diff server/src/vendor/shared/contracts/observability.ts client/src/vendor/shared/contracts/observability.ts`
   must still print **nothing**, and likewise for `platform.ts`. Any output at
   all is an AC-53 failure and a HIGH `pr-self-review` Phase 4 finding.

3. **Concurrency is already structurally safe for AC-20 — do not "fix" the
   logger.** `RunLogger.forRun` returns a **new** `RunLogger`
   (`platform/run-logger.ts:45-47`), never mutating the parent, and `RunBus`
   keys its emitters, buffers, seq counters, completed and cancelled sets by
   `runId` (`platform/sse.ts:20-24`, `:52-59`). `runOneAgent` narrows to its own
   run at `run-executor.ts:226` and only ever publishes through that. The shared
   pre-work logger fans out **before** the loop (`:68-73`, `:101`, `:120`) and is
   never used inside it. So AC-20 holds by construction; the job is to **prove**
   it with a test, not to redesign anything.

4. **The reserved `AgentColumn` shape is short two things the ACs require.**
   `status: z.enum(['done','failed','running'])` (`observability.ts:41`) omits
   `'cancelled'`, which the spec's own edge-case list requires ("A run is
   cancelled part-way… its result shows the cancelled state") and which
   `RunSummary.status` already documents as a real value
   (`contracts/trace.ts:148`). And there is **no `error` field**, which AC-47
   and AC-49 both need ("marked failed with its recorded reason"). Both are
   additions to a zero-consumer contract — reshape in place (D1).

5. **AC-21 needs one nullable column on `agent_runs`, and `multi_agent_runs`
   needs no reshape at all.** The reserved table already carries `id`,
   `workspace_id`, `pr_id`, `ran_at` (`db/schema/runs.ts:83-92`) — exactly what
   `MultiAgentRun` needs. The missing piece is the grouping edge. Add
   `agent_runs.multi_agent_run_id` (nullable uuid, FK → `multi_agent_runs.id`,
   `ON DELETE set null`) plus an index. This keeps invariant 4 of §Shared
   contracts true ("a grouping over `agent_runs`, no third entity"), beats a
   jsonb `run_ids` array (which would be a second source of truth) and beats a
   join table (a third entity). It is **add-only on one table**, so
   `pnpm db:generate` needs exactly **one** pass with no rename ambiguity
   (`server/LEARNINGS.md:64-101` — the hang is triggered by add+drop on the
   *same* table, which this is not).

6. **AC-11 is already free, but assert it.** `createAgentRun` writes
   `source: 'local'` explicitly (`modules/reviews/repository/run.repo.ts:136`)
   and `status: 'running'` (`:135`). No code change; one test.

7. **`test/reviews.it.test.ts` has a documented, pre-existing flake.**
   `server/LEARNINGS.md:58-62`: its "runs a review" test makes a **real**
   OpenRouter network call through `intentService.resolve()` on a dev machine
   with real secrets, and `waitForPrRuns`'s 10s timeout loses that race under
   load. This test is a **primary AC-19 gate**, so an implementer will run it a
   lot. If it fails, re-run it in isolation before suspecting the concurrency
   change — and note that under D16 the *whole batch* now finishes faster, so a
   flake here after this change is more likely the known race than a regression.

8. **A new required `container.<x>` read in the executor breaks hand-rolled
   test mocks.** `server/LEARNINGS.md:722-756`: three test files build
   `{...} as unknown as Container`. This plan adds **no** new container
   dependency to `run-executor.ts` (the concurrency change reads nothing new),
   so no sweep is needed — but if that changes mid-implementation, run
   `grep -rl "as unknown as Container" server/test` first.

9. **`markReviewed` now runs N times concurrently against the same
   `pull_requests` row** (`run-executor.ts:414`). Postgres serialises the row
   lock and every writer writes the identical `pull.headSha`, so this is safe.
   Recorded because it is the one shared write the concurrent loop performs.

10. **Rate limiting is per-IP, not per-workspace, with the stock plugin.**
    Same nuance `plans/12-eval-pipeline.md` recorded: `@fastify/rate-limit` is
    registered globally and per-route `config.rateLimit` keys on IP. In this
    single-workspace local app the two coincide. Ship the per-route config,
    record the nuance in a code comment; do **not** build a custom
    `keyGenerator`. AC-15 satisfied.

11. **The estimate route must not sit under `/agents/`.** A
    `GET /agents/run-estimates` would race `GET /agents/:id` in find-my-way
    (static wins, so it would work — but it is a trap for the next person, and
    the agents module does not own `agent_runs`). Mount it as
    `GET /multi-agent/estimates` from `modules/reviews/routes.ts` instead: no
    collision, no cross-module reach, one home for the whole feature.

## Execution mode

**Planner recommendation: multi-agent, four phases.** This is materially larger
than SPEC-12: a regression-risk-concentrated edit to shared core execution, a
migration, a new compute-on-read algorithm, a new write path into a
previously-unwritten table, an additive change to a shared UI primitive used by
every dropdown in the product, two new route trees, and an edit to the
pull-request page.

**User's confirmed choice — multi-agent.** Run each phase as a separate
`/implement-plan` pass (`implementer` → `plan-verifier` gate →
`architecture-reviewer` fix loop), in this order. **Each phase's Verification
block must be green before the next starts.**

1. **Phase A1 — executor concurrency** (Approach §1). Deliberately isolated and
   first: it is the only change that can break behaviour this feature does not
   own, it touches ~15 lines, and its gate is the *existing* review test suite.
   A failure here is unambiguous.
2. **Phase A2 — multi-agent server surface** (Approach §2–§7).
3. **Phase B1 — client foundations** (Approach §8–§11): the shared `Dropdown`
   extension, `nav.ts`, hooks, i18n, the `FindingCard` Learn action.
4. **Phase B2 — the multi-agent surfaces** (Approach §12–§15).
5. **`test-writer`** once, after all four, for any row of the Verification test
   matrix the implementation passes did not produce.
6. **`/pr-self-review`** immediately before push (it re-runs the full suites).
7. **After the sibling `feat/export-to-ci` worktree merges** — a separate
   navigation re-verification, per §Shared contracts: all three of
   `multi-agent`, `ci-runs` and `agent-performance` present in `NAV`, none
   clobbered, each resolving to a live route. Neither branch can prove this
   alone.

## Modules affected

| Module | Why |
|---|---|
| **server** | The substance: the concurrency change to `modules/reviews/run-executor.ts`; new `modules/reviews/{multi-agent.ts, conflicts.ts}` and `repository/{multi-agent.repo.ts, memory.repo.ts}`; new methods on `ReviewRepository` / `ReviewService`; four new routes and one extended `FINDING_ACTIONS` loop in `modules/reviews/routes.ts`; one add-only migration on `agent_runs`. |
| **client** | `src/vendor/ui/kit/{types.ts, Dropdown.tsx}` (multi-select rows); `src/vendor/ui/nav.ts` (`NAV` + `SHORTCUTS`); `src/lib/hooks/multi-agent.ts`; two route trees under `src/app/repos/[repoId]/multi-agent/`; `FindingCard` + `FindingsPanel` (Learn); `RunReviewDropdown` + `PrDetailView` (AC-60 … AC-62, AC-68); `messages/en/runs.json` + `messages/en/prReview.json`. |
| **both `vendor/shared`** | `contracts/observability.ts` (the multi-agent group only) and `contracts/platform.ts` (`RunRequest`), hand-edited in **both** unsynced copies (root `CLAUDE.md` §Do-not-touch, D12). |
| **reviewer-core** | **Not affected** — D4. `git diff reviewer-core/` must be empty. |
| **mcp-server** | **Not affected** — N7. |
| **e2e** | **Not affected** — N8. No seed change, so flows 02/04/05 are untouched. |

## Architectural constraints

Cited, not paraphrased. Read the linked lines before writing the corresponding
code.

### Root

- `CLAUDE.md` §Do-not-touch / edit-with-care — `server/src/vendor/shared` and
  `client/src/vendor/shared` are **independent, already-drifted copies**. Every
  contract this feature touches lands in both, by hand (D12, AC-53). See
  finding 2 for what "no new drift" means concretely here.
- `CLAUDE.md` §Conventions — migrations are **not** applied on boot:
  `cd server && pnpm db:migrate` after generating.
- `CLAUDE.md` §Gotchas — e2e flows `02`/`04`/`05` assume a DB seeded with only
  the one demo repo. This plan changes no seed data, so that constraint is
  satisfied by not touching it.
- `CLAUDE.md` §Before you finish — append an `engineering-insights` entry to
  each touched module's `LEARNINGS.md`.

### server

- `server/CLAUDE.md:12-14` — routes are schema-first: zod `params`/`body` via
  `fastify-type-provider-zod`; handlers never hand-roll `Schema.parse`. Note
  the existing trigger route deliberately deviates
  (`modules/reviews/routes.ts:78` manually parses `RunRequest` with a tolerant
  empty-body fallback) — the **new** multi-agent trigger declares a real body
  schema; do not copy the deviation into new code, and do not "fix" the
  existing one (that would change an existing route's behaviour, N2).
- `server/CLAUDE.md:15-16` — a new module must be added to
  `src/modules/index.ts`. **Not applicable here** by D-P4: no new module.
- `server/CLAUDE.md:17-18` — adapters sit behind `platform/container.ts` DI;
  tests swap `src/adapters/mocks.ts`, never module-level mocks.
- `server/CLAUDE.md:31-32` — never hand-edit an applied migration.
- `server/CLAUDE.md:41-43` — prompt-injection defense is the one shared
  `INJECTION_GUARD`; **do not** add per-feature keyword scanning. AC-57 says
  the same, and this feature adds **zero** new provider-facing content.
- `server/CLAUDE.md:47-50` — `*.it.test.ts` = DB-backed (testcontainers,
  self-skipping without Docker); everything else hermetic.
- `.dependency-cruiser.cjs:63-76` `no-cross-module` (error) — fires on any file
  in a module folder, **including `routes.ts` and including `import type`**
  (`tsPreCompilationDeps: true`). `:41-49` `no-container-in-services` forbids
  `service.ts` importing `platform/container.ts`. `:51-62`
  `db-only-in-repositories` confines `src/db/**` to `repository.ts`, anything
  under a `/repository/` folder, `*.repo.ts`, and `routes.ts`.
- `server/LEARNINGS.md:38-54` — grep for the table/contract name and confirm
  "never written to" before redesigning in place. Done for `multi_agent_runs`
  (zero references outside `db/schema/runs.ts` and the barrel) and for `memory`
  (zero writers anywhere in `server/src`). Re-confirm with
  `select count(*) from multi_agent_runs;` before generating.
- `server/LEARNINGS.md:64-101` — the two-pass migration rule. **Not triggered
  here** (add-only on one table, finding 5) — but run
  `pnpm db:generate < /dev/null` anyway and read the generated SQL: it must
  contain only `ALTER TABLE ... ADD COLUMN` / `ADD CONSTRAINT` / `CREATE INDEX`.
- `server/LEARNINGS.md:103-127` — testing an in-flight guard with
  `Promise.all([a(), b()])` is **not** deterministic once the guarded method
  does real I/O before the check. AC-12's test must use the documented recipe:
  start A, widen its in-flight window artificially, wait ~10ms, then start B.
- `server/LEARNINGS.md:184-196` — list endpoints denormalize with an IN-query
  plus JS grouping, not per-row queries. This is the house pattern the
  multi-agent read must follow (the spec's "Performance of the read path" cites
  it by date). Also: **gate on `status === 'done'`** when picking a run's
  numbers — the newest row is frequently not done.
- `server/LEARNINGS.md:206-290` — a consumer declares a **narrow local port**;
  never import another module's type. Not needed under D-P4, but it is the rule
  that makes D-P4 the cheap option.
- `server/LEARNINGS.md:483-496` — `.nullable()` on a shared contract makes the
  key **required** (presence mandatory, value may be null). Deliberate for
  `AgentColumn.error` and every metric; wrong for genuinely optional fields,
  which take `.nullish()`.
- `server/LEARNINGS.md:643-654` — the "run-level, not per-item, and the UI must
  say so" precedent. Directly relevant to AC-26/N9: a per-agent score is a
  score of *this PR by this agent*, never a ranking of agents.
- `server/LEARNINGS.md:656-704` — the reserved-but-unwired pattern, and the
  "same name, two integration points" trap. Confirmed clean here:
  `observability.ts:5` names L07 and `:9-11` names this feature's two endpoints
  and its `Conflict` concept by name (D1).
- `server/LEARNINGS.md:706-720` — the dependency-cruiser baseline matches exact
  from→to edges. If `pnpm arch` fires, fix the import; do not re-baseline.
- `server/LEARNINGS.md:722-756` — hand-rolled `as unknown as Container` mocks
  (finding 8).
- `server/LEARNINGS.md:58-62` — the `reviews.it.test.ts` network flake
  (finding 7).
- `reviewer-core/CLAUDE.md` §Do-not-touch — `groundFindings` and
  `INJECTION_GUARD` are declared do-not-touch. This feature calls neither
  directly and changes neither.
- `reviewer-core/CLAUDE.md` §Gotchas — `@devdigest/shared` inside
  `reviewer-core` resolves to **server's** `vendor/shared`. So the
  `observability.ts` / `platform.ts` edits reach `reviewer-core`'s type-check
  immediately; run `pnpm --dir reviewer-core typecheck` after the contract edit
  even though no reviewer-core source changes.
- `reviewer-core/LEARNINGS.md:19-41` — before widening a shared shape, grep
  `server/test/**` and `server/src/**` too; "no producers yet" can be false one
  layer out.

### client

- `client/CLAUDE.md:13-15` — all data access goes through `src/lib/hooks/*` →
  `src/lib/api.ts`; never `fetch` in a component.
- `client/CLAUDE.md:16-17` — pages stay thin; feature logic lives in colocated
  `_components/<Name>/` folders, each with its own `*.test.tsx`.
- `client/CLAUDE.md:18-19` — new UI strings need a `messages/en/*.json` entry,
  not inline literals.
- `client/CLAUDE.md:22-28` — `src/vendor/shared` and `src/vendor/ui` are owned,
  drifted copies with no resync mechanism; `nav.ts` and `kit/Dropdown.tsx` are
  edited as owned source.
- `client/LEARNINGS.md:316-361` — importing a **runtime value** from the bare
  `@devdigest/shared` barrel breaks Next's webpack build with a misleading
  error; import from `@devdigest/shared/contracts/observability` instead. Also:
  passing `typecheck` + `vitest` is **not** evidence the page renders — hence
  the `pnpm build` step in Phase B2's verification.
- `client/LEARNINGS.md:362-402` — a new top-level route needs **four** wirings;
  `nav.ts`'s `NAV` array is the one that fails silently. This is D14/AC-52
  verbatim, and this is now the **third** confirmed instance in this repo.
  Update `SHORTCUTS` in the same file. Also: check the icon exists in
  `vendor/ui/icons.tsx` before using it in a `NavItemDef` (verified: `Users` and
  `Layers` are both already registered — no icon-registry change needed).
- `client/LEARNINGS.md:404-415` — a repo-scoped route
  (`/repos/:repoId/...`) has its own template: `useParams<{repoId}>()`,
  `useActiveRepo()`, `useRepoNotFound(repoId)` gating an early
  `<RepoNotFound />`. This feature is **repo-scoped** (it picks a PR), so this
  is the template — not `skills/page.tsx`.
- `client/LEARNINGS.md:417-438` — a mutation hook writing `setQueryData` in
  `onSuccess` needs `qc.cancelQueries` in `onMutate`.
- `client/LEARNINGS.md:440-452` — a component calling `useToast()` needs
  `vi.spyOn`, not a provider, in tests.
- `client/LEARNINGS.md:486-502` — `activeKeyFor`'s `pathname.includes(...)` is a
  substring-match bug class. `helpers.ts:35` already returns `"multi-agent"`
  and already sits **above** the `/pulls` check (`:43`), so a
  `/repos/:id/multi-agent` route resolves correctly with **no change**. Verify;
  do not duplicate. Prefer `hasSegment` if a new entry is ever added.
- `client/LEARNINGS.md:244-263` — `vendor/ui/primitives/Markdown.tsx` blocks raw
  HTML but constrains **no** link or image target. Governs AC-56: see
  Approach §14.
- `client/LEARNINGS.md:299-315` — count the `../` depth to `messages/en/*.json`
  in a test file; measure, don't guess.
- `client/LEARNINGS.md:578-592` — `api.post` discards the HTTP status;
  `api.postWithStatus` exists for idempotent-create routes. Relevant to AC-12
  if you choose to distinguish "started" from "already in flight" client-side.

## Approach

### Phase A1 — executor concurrency (the scoped core exception)

#### 1. `run-executor.ts:161-200` — `for…of` becomes concurrent

Replace the sequential loop body with `await Promise.allSettled(jobs.map(...))`
over the **identical** body. Everything inside the current iteration stays byte
-for-byte the same: the `agentStart` timestamp, the `runOneAgent(...)` call with
its exact argument list, the two `logger?.info` / `logger?.[cancelled ? …]`
calls, and the `try`/`catch` that already isolates a per-agent failure
(`:191-199`).

Why this is order-only, and nothing more (D16, verified by reading the code):

- Every value the loop body reads is computed **before** the loop and never
  mutated by it: `diff` (`:99-108`), `resolvedIntent` / `resolvedInScope` /
  `resolvedOutOfScope` (`:116-159`), `runLog` (`:68-73`), `pull`, `repo`,
  `workspaceId`.
- Nothing in one iteration reads another's outcome — `outcome` is consumed only
  by that iteration's own log line.
- `runOneAgent` narrows to a fresh per-run logger at `:226`; `RunLogger.forRun`
  constructs a **new** instance (`platform/run-logger.ts:45-47`) and `RunBus`
  is keyed by `runId` throughout (`platform/sse.ts:20-24`, `:52-59`). AC-20
  holds by construction — finding 3.
- Each iteration persists to **its own** `agent_runs` / `reviews` / `findings` /
  `run_traces` rows. The single shared write is `markReviewed`
  (`:414`) — finding 9.

`Promise.allSettled`, not `Promise.all`: the body already swallows its own
errors, so nothing should reject — but `allSettled` makes "one job cannot abort
the batch" (AC-17) structural rather than dependent on that.

**Explicitly do not:** add a concurrency limit / `p-queue` / any new dependency
(the spec's AC-59 calls out that copy naming `p-queue` is dishonest *because
nothing here uses it* — introducing it now would invert the problem); change
`failAll` (`:78-97`); change the pre-work (`:99-159`); change error handling,
cancellation, persistence, or the trace.

**Provider load (the spec's Non-functional note):** N simultaneous calls to one
provider can hit throttling that N sequential calls never reached. A throttled
agent fails in isolation (AC-17, AC-47). No cap is added this slice — record
this in `server/LEARNINGS.md` at the end of the phase so it is watched rather
than rediscovered.

### Phase A2 — multi-agent server surface

#### 2. Shared contracts — `observability.ts` + `platform.ts`, in BOTH copies

Both files are byte-identical across the two copies today (finding 2). Apply
every edit to `server/src/vendor/shared/contracts/*` **and**
`client/src/vendor/shared/contracts/*`, and keep them identical.

**`observability.ts` — the multi-agent group (`:18-86`) only.** `AgentStats`
and `CuratorResult` (`:88-141`) are other slices' and are not touched (N15).

| Symbol | Change |
|---|---|
| `AgentColumnFinding` (`:23-32`) | **unchanged.** Already the right compact subset for AC-32. |
| `AgentColumn` (`:35-48`) | `status` widens to `z.enum(['done','failed','running','cancelled'])` (finding 4). Add `error: z.string().nullable()` (AC-47, AC-49, AC-50). Everything else unchanged — `score` (`:43`) is already the reserved home for the deterministic 0–100 review score (D18). |
| `ConflictTake` (`:52-59`) | **unchanged.** `verdict: Severity | 'ignored'` is exactly AC-39's two cases; `note` is the flagging finding's one-line rationale, and **empty string** for an `'ignored'` take (the client renders `conflicts.didNotFlag`, so no sentence is synthesised from model text). |
| `Conflict` (`:66-72`) | **unchanged.** `line` is resolved by D-P2. |
| `MultiAgentRun` (`:75-86`) | **unchanged.** It is already the exact response of both endpoints, and `total_cost_usd` is already `.nullable()` — which is AC-24's "report as unavailable rather than as zero". |
| `AgentRunEstimate` | **new**, adjacent to the group with a comment tying it to D22/AC-5: `{ agent_id: z.string(), agent_name: z.string(), runs: z.number().int(), avg_duration_ms: z.number().int().nullable(), avg_cost_usd: z.number().nullable() }`. `null` means "no completed run to derive from" — the client must say so, never render `0` (AC-5). Deliberately **not** `AgentStats` (N15). |

**`platform.ts` — `RunRequest` (`:384-388`), additively (D3, AC-10):**

```
agentIds?: z.array(z.string().uuid()).min(1).optional()
```

`agentId` and `all` keep their meaning and their consumers
(`modules/reviews/routes.ts:78-82`, `client/src/lib/hooks/reviews.ts:135-147`).
This is the **only** new contract field the UI requires — no per-agent options
object, no ordering, no per-run overrides.

#### 3. Schema + one migration (finding 5)

`server/src/db/schema/runs.ts`. Confirm `select count(*) from multi_agent_runs;`
returns `0` before generating.

- `multiAgentRuns` (`:83-92`) — **no change.**
- `agentRuns` (`:19-43`) — add
  `multiAgentRunId: uuid('multi_agent_run_id').references(() => multiAgentRuns.id, { onDelete: 'set null' })`
  with a doc comment: *"Set only for runs started as part of a multi-agent
  review (specs/13). Null for single-agent and run-all triggers. `set null` so
  deleting a grouping never deletes the runs or their findings."* Add
  `index('agent_runs_multi_agent_idx').on(t.multiAgentRunId)`.

`pnpm db:generate < /dev/null` (one pass), read the generated SQL, then
`pnpm db:migrate`. One new file under `src/db/migrations/`; never edit an
existing one.

#### 4. `conflicts.ts` — pure, the whole of AC-35 … AC-42

New `server/src/modules/reviews/conflicts.ts`. Zero I/O, zero LLM, no `this`,
modelled on `smart-diff.ts`'s posture (pure classifier in its own file, called
from the service).

```
computeConflicts(columns: AgentColumn[]): Conflict[]
```

1. **Participants** = columns with `status === 'done'` (D8, AC-38). A failed,
   cancelled or still-running agent is never rendered as "did not flag" — this
   is the rule that stops a provider timeout manufacturing a conflict.
2. Fewer than two participants → return `[]` (AC-42). The *message* is the
   client's job; the client distinguishes AC-40 from AC-42 by counting
   `status === 'done'` columns, so no contract field is needed.
3. Classify every participating finding as file-scoped or line-scoped (D-P1),
   using `CONFLICT_MAX_RANGE_LINES` and `FULL_FILE_KINDS` from
   `modules/reviews/constants.ts`.
4. Group into locations per file: file-scoped by `(file, kindClass)`;
   line-scoped by the interval merge of D-P3.
5. For each location build `takes`: one per **participating** agent — the
   severity it assigned plus a one-line `note` (the first line of its finding's
   rationale, truncated to a constant), or `verdict: 'ignored'` with
   `note: ''`.
6. Emit a `Conflict` only when the location is contended (AC-37): at least one
   `ignored` take alongside at least one flagging take, **or** two flagging
   takes with different severities. Two agents at the same severity on the same
   lines is **agreement** and must not appear.
7. `line` per D-P2; `title` from the flagging finding that set `line`; sort by
   `(file, line, title)`.

Triage state is deliberately ignored (spec clarification 3 — the spec's current
behaviour stands): an accepted or dismissed finding still contributes exactly as
it did.

#### 5. Repository — `multi-agent.repo.ts` and `memory.repo.ts`

New files under `server/src/modules/reviews/repository/` (exempt from
`db-only-in-repositories`, `.dependency-cruiser.cjs:58-61`), composed onto
`ReviewRepository` (`modules/reviews/repository.ts:25-198`) exactly as
`review.repo` / `run.repo` / `pull.repo` already are (`:21-23`).

`multi-agent.repo.ts`:

| Function | Purpose |
|---|---|
| `createMultiAgentRun(db, { workspaceId, prId })` | Insert one row, return its id (AC-21). |
| `attachRunsToMultiAgentRun(db, multiAgentRunId, runIds)` | One `UPDATE ... WHERE id = ANY($runIds)` — never per-row (`server/LEARNINGS.md:184-196`). |
| `latestMultiAgentRunForPull(db, workspaceId, prId)` | The newest `multi_agent_runs` row for a PR, workspace-scoped in the `WHERE` (D11, AC-25, AC-55). |
| `inFlightMultiAgentRunForPull(db, workspaceId, prId)` | The newest multi-agent run for this PR that still has at least one grouped `agent_runs` row with `status = 'running'` (AC-12, DB-backed so it survives a restart). |
| `groupedRuns(db, multiAgentRunId)` | Every `agent_runs` row for a grouping, joined to `agents.name`. One query. |
| `agentRunEstimates(db, workspaceId)` | `select agent_id, count(*), avg(duration_ms), avg(cost_usd) ... where workspace_id = $1 and status = 'done' group by agent_id`, joined to `agents` so agents with **zero** completed runs still come back with `runs: 0` and nulls (AC-5, D22). Note the `status='done'` gate — `server/LEARNINGS.md:192-196`. |

`memory.repo.ts` (D24, D-P5):

| Function | Purpose |
|---|---|
| `findLearningForFinding(db, workspaceId, findingId)` | jsonb containment on `memory.sources` — the idempotency guard for the spec's "Learn activated twice" edge case. No new index this slice: the table is empty and the guard is a single-row lookup; recorded so a future Memory feature knows to add one. |
| `insertLearningFromFinding(db, {...})` | One `memory` row: `scope: 'repo'`, `kind: 'learning'`, `repoId`, `workspaceId`, `content` assembled in code, `sources: { finding_id, review_id, run_id, agent_id }` (AC-64), `embedding` **left unset**, `confidence` null. Comment: a future `modules/memory/` owns read/curation; these must stay ordinary `kind: 'learning'` entries with no multi-agent-specific shape. |

The read path for the results surface reuses what already exists —
`reviewsForPull` (`repository.ts:63-65`) for reviews + findings, and
`getPull` (`:30-32`) for workspace scoping. Assemble with an IN-query plus JS
grouping over the grouped run ids; **no per-row queries, no diff re-fetch, no
checkout, no provider call** (AC-31, and the spec's "Performance of the read
path").

#### 6. `multi-agent.ts` — the application service

New `server/src/modules/reviews/multi-agent.ts`, a `MultiAgentService` class in
the same posture as `AdhocReviewService` (`modules/reviews/adhoc.ts`): it
declares what it needs and never imports `Container`.

`trigger(workspaceId, prId, agentIds, logger)`:

1. Resolve the PR workspace-scoped → 404 (AC-55).
2. **In-flight guard first** (AC-12): `inFlightMultiAgentRunForPull` → if one
   exists, return **that** run's assembled `MultiAgentRun` and start nothing.
   "Surface the in-flight run rather than queueing or duplicating it" is the
   AC's own wording. Test it with `server/LEARNINGS.md:103-127`'s recipe, not
   `Promise.all`.
3. Resolve **every** `agentIds` entry via the existing
   `AgentLookup.getById(workspaceId, id)` (`modules/reviews/service.ts:9-12`).
   A single unresolvable or foreign id fails the **whole** request before any
   row is created (AC-14, and the spec's "silently dropping it would let a
   caller probe which ids exist"). A deleted-between-configure-and-run agent is
   the same class of failure and is covered by the same branch.
4. `createMultiAgentRun` → then delegate to the **existing**
   `ReviewService.runReview(workspaceId, prId, targets, logger)`
   (`service.ts:141-176`), which already creates one `agent_runs` row per
   target with `source: 'local'` (`run.repo.ts:136`, AC-11) and already
   fire-and-forgets `executeRuns` (`service.ts:171`) so the response returns
   immediately (AC-13).
5. `attachRunsToMultiAgentRun(id, runs.map(r => r.run_id))` (AC-21).
6. Return the assembled `MultiAgentRun`, every column at `status: 'running'`
   with null verdict/score/summary/error and `findings: []`,
   `conflicts: []`, `total_duration_ms: 0`, `total_cost_usd: null`. This
   satisfies both AC-13 and the reserved docstring at `observability.ts:74`
   ("Response of POST /pulls/:id/multi-agent-run **and** GET
   /pulls/:id/multi-agent") with one shape and one assembler.

`latest(workspaceId, prId)`:

1. Resolve the PR workspace-scoped → 404 (AC-55).
2. `latestMultiAgentRunForPull` → `null` when none (AC-51; the route 404s and
   the client renders the empty state).
3. `groupedRuns` + `reviewsForPull`, grouped in JS by `run_id`. One
   `AgentColumn` per grouped run — name, provider, model, status, verdict,
   score (`agent_runs.score`, the persisted `scoreFromFindings` value from
   `reviewer-core/src/review/reduce.ts:12-29` via `run.ts:231`), summary,
   `duration_ms`, `cost_usd`, `error`, and the compact findings. An agent
   deleted after the run leaves `agent_runs.agent_id` null
   (`db/schema/runs.ts:24`) — fall back to the trace's recorded agent name or a
   stated placeholder; never crash (the spec's edge case).
4. `total_duration_ms` = **max** of the grouped `duration_ms` (wall-clock under
   concurrency — AC-24, AC-59). `total_cost_usd` = **sum**, but `null` if any
   grouped run's cost is unknown (AC-24; the same "null means unknown, never
   $0" rule `server/LEARNINGS.md:34-36` states for `costUsd`).
5. `conflicts = computeConflicts(columns)` (AC-30, AC-35).
6. Parse the assembled object through `MultiAgentRun` before returning, so a
   shape violation is rejected at the boundary rather than partially rendered
   (AC-54).

`estimates(workspaceId)` → `AgentRunEstimate[]` from `agentRunEstimates`. Zero
LLM calls anywhere on this path (AC-8).

#### 7. Routes and the Learn action

Added to `server/src/modules/reviews/routes.ts` (its header comment block at
`:28-42` gets the new lines too):

```
POST /pulls/:id/multi-agent-run   body { agent_ids: string[] }  → MultiAgentRun   [rate-limited]
GET  /pulls/:id/multi-agent                                     → MultiAgentRun
GET  /multi-agent/estimates                                     → AgentRunEstimate[]
POST /findings/:id/learn          (via FINDING_ACTIONS)         → { finding, memoryId }
```

- `getContext(container, req)` first on every one (AC-55).
- The trigger declares a **real zod body schema** (`server/CLAUDE.md:12-14`) —
  do not copy `:78`'s tolerant manual parse. `RunRequest.agentIds` is the
  shared-contract field the client sends; the route's body schema is the
  boundary that rejects a non-uuid before the handler runs.
- Rate limit the trigger with `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }`,
  matching `:75`, plus finding 10's comment (AC-15).
- `MultiAgentService` is constructed at the composition point beside
  `ReviewService` (`:50-57`) and `AdhocReviewService` (`:63-68`).
- **Learn:** `FINDING_ACTIONS` (`:43`) becomes
  `['accept', 'dismiss', 'learn'] as const`, so the existing loop at `:233-239`
  mounts `POST /findings/:id/learn` with no new route code (D24's "nearly
  free"). `actOnFinding` (`modules/reviews/findings.ts:11-34`) gains a
  `'learn'` case that:
  1. reuses the existing `findingContext(findingId)` workspace check at
     `findings.ts:17-20` — unchanged, so AC-55 comes free;
  2. calls `findLearningForFinding` → if present, returns it (idempotent; the
     spec's "double-click writes two rows into a store with no cleanup" edge
     case);
  3. otherwise assembles `content` **deterministically in code** from the
     finding's own persisted `title`, `file`, `[start_line, end_line]` and
     `rationale` — no LLM call, no summarisation, no embedding (AC-63, AC-64);
  4. returns `{ finding, memoryId }`, filling the field the client hook already
     reserves (finding 1).
  The `'reply'` branch stays unimplemented and keeps falling through to the
  existing `default:` 400 at `findings.ts:31-32` (N5).

### Phase B1 — client foundations

#### 8. `Dropdown` / `DropdownItemDef` — multi-select rows, additively

`client/src/vendor/ui/kit/types.ts:5-15` gains two optional fields:

- `checked?: boolean` — when present, the row renders a checkbox indicator and
  carries `role="menuitemcheckbox"` + `aria-checked`.
- `keepOpen?: boolean` — activation does not dismiss the menu.

`client/src/vendor/ui/kit/Dropdown.tsx:12-15` currently always calls
`onClose()` after `onClick`. It becomes conditional on `keepOpen`. **Nothing
else changes.** A row with neither field behaves byte-for-byte as today — that
is the AC-62 / §Shared-contracts requirement, and `RepoSwitcher` and every
other dropdown in the product depend on it. Add a `Dropdown` test asserting
both: an existing single-select row still closes on activation, and a
`keepOpen` checked row does not.

#### 9. `nav.ts` — the required deliverable (D14, AC-52)

`client/src/vendor/ui/nav.ts`: add to the `WORKSPACE` group's `items`
(`:24-42`, beside `pulls` — this is a PR-oriented, repo-scoped surface, not a
Skills Lab one):

```
{ key: "multi-agent", label: "Multi-Agent Review", icon: "Users",
  href: "/repos/:repoId/multi-agent", gKey: "m" }
```

and a matching `SHORTCUTS` entry (`:85-98`): `g m` — free; taken today are
p, x, t, s, a, c, e and `,`. `Users` is already in
`vendor/ui/icons.tsx`'s registry, so no icon-registry change is needed
(unlike `BarChart3` in `client/LEARNINGS.md:398-401`).

The **label is not new**: `messages/en/shell.json:26` already carries
`nav["multi-agent"]: "Multi-Agent Review"` (D14). `activeKeyFor`
(`components/app-shell/helpers.ts:35`) already resolves this route and already
sits above the `/pulls` check (`:43`) — **verify, change nothing**.

#### 10. Hooks — `src/lib/hooks/multi-agent.ts`

New file, one line added to `src/lib/hooks/index.ts`. Import contract types
from `@devdigest/shared/contracts/observability`, **not** the bare barrel
(`client/LEARNINGS.md:316-361`).

- `useMultiAgentRun(prId)` — `GET /pulls/:id/multi-agent`. Conditional
  `refetchInterval`: poll (4000ms, matching `usePrRuns`,
  `hooks/reviews.ts:38-48`) **only** while some column has
  `status === "running"`; `false` otherwise. This is AC-48's per-agent progress
  and AC-45's "resume leads to the live run".
- `useAgentRunEstimates()` — `GET /multi-agent/estimates` (AC-5, AC-6).
- `useStartMultiAgentRun()` — `POST /pulls/:id/multi-agent-run`. `cancelQueries`
  in `onMutate` before any `setQueryData` (`client/LEARNINGS.md:417-438`).

Nothing here fetches in a component (`client/CLAUDE.md:13-15`).

#### 11. `FindingCard` Learn + i18n

- `FindingCard.tsx:117-152` gains a **fourth** action beside Accept / Dismiss /
  Turn-into-eval-case, threaded through the same `onAction` prop chain
  (`FindingCardAction` at `:35` already unions `FindingActionKind`, which
  already admits `'learn'`). Per the spec, Learn is **not** gated behind triage
  (that is clarification 1, left as-is) — unlike the eval action at `:141-151`.
  **D25 is intentional:** this makes Learn appear on the pull-request review
  page too. Additive; no existing action changes behaviour.
- `FindingsPanel.tsx:75-82`'s `handleAction` gains a `'learn'` branch calling
  the existing `useFindingAction` (finding 1) with a toast.
- `messages/en/prReview.json` — `finding.learn` already exists (`:8`). **Add**
  `finding.learnRecorded`, `finding.learnAlreadyRecorded`, `finding.learnError`.
  **AC-65 is a copy requirement:** the success message must say the finding was
  *recorded as a note for this repository*, never that an agent has learned from
  it or that future reviews will improve. No retrieval path consumes these rows
  (D24, spec clarification 1).
- `messages/en/runs.json` — rewrite the keys D20 names as written for the
  superseded "every enabled agent" design, and add what the configure step
  needs (AC-59):

  | Key | Action |
  |---|---|
  | `page.runAll` (`:131`) | → a selected-count label, e.g. `page.runSelected: "Run {count} agent(s)"` (AC-4). |
  | `page.subtitle` (`:124`) | drop "every enabled agent". |
  | `page.noAgents.body` (`:136`) | same (AC-7). |
  | `page.noRun.bodyReady` (`:141`), `page.noRun.cta` (`:143`) | same (AC-51). |
  | `page.meta` (`:133`) | **must lose "fan-out via p-queue"** — the system does not use it. Agent count · wall-clock duration · total cost only (AC-59). |
  | **new** | `page.selectAll`, `page.estimate.perAgent`, `page.estimate.aggregate`, `page.estimate.unavailable` (AC-5's "no estimate" state — never `0`), `page.pickPrFirst` (AC-1), `page.configureRun`, `page.selectedCount`, `page.scoreLegend` (AC-26's "higher is better"), `page.viewExistingResults` (AC-66), `page.startNewReview` (AC-67), `page.partial` (AC-47), `page.allFailed` (AC-49), `page.sharedFailure` (AC-50), `conflicts.needTwoAgents` (AC-42), `column.failed`, `column.cancelled`, `column.running`. |
  | keep as-is | `column.noFindings` (`:7`), `column.findingsCount` (`:8`), `conflicts.*` (`:10-15`), `tabs.noSummary` (`:17`), `page.view.columns` / `page.view.tabs` (`:127-130`), `page.title`, `page.crumb`, `page.selectPr`, `page.prItem`, `page.running`. |

### Phase B2 — the multi-agent surfaces

#### 12. Routes

Repo-scoped, per `client/LEARNINGS.md:404-415`'s template
(`useParams<{repoId}>`, `useActiveRepo()`, `useRepoNotFound(repoId)` gating an
early `<RepoNotFound />`). Both pages are thin
(`client/CLAUDE.md:16-17`); the eval routes (`src/app/eval/page.tsx`) are the
shape to copy.

```
src/app/repos/[repoId]/multi-agent/page.tsx            → configure  (Screens A/B)
src/app/repos/[repoId]/multi-agent/[prId]/page.tsx     → results    (Screens C/D)
```

The configure route reads `?pr=<prId>` so every entrance can deep-link with a
PR preselected. This URL layout is what makes D26's three entrances work
without an auto-redirect:

| AC | Where | Goes to |
|---|---|---|
| AC-66 | configure, `?pr=` set, that PR already has a run | a **prominent primary** affordance to `/repos/:repoId/multi-agent/<prId>`, rendered ahead of the "configure a new run" path. **Never navigates on its own** — that would be the browser-Back trap D26 rejects. |
| AC-67 | results | an explicit "start new review" action → `/repos/:repoId/multi-agent?pr=<prId>`, agent selection open for editing. |
| AC-68 | PR detail page | a direct affordance → `/repos/:repoId/multi-agent/<prId>`. Navigation only; **starts no run**. |
| AC-51 | results, no run exists | state it, and offer the route back to configure. |

A run that failed entirely still counts as "has a run" for all three (the
spec's edge case) — the resume target is `latestMultiAgentRunForPull`, which
does not filter on status.

#### 13. Configure surface — `_components/MultiAgentConfigureView/`

- PR picker over `usePulls(repoId)` (`lib/hooks/core.ts:102-112`). No PR
  selected → the pick-a-PR-first state, **no agent list at all**, run control
  disabled (AC-1).
- Agent list from `useAgents()` (`lib/hooks/agents.ts:18-23`): one row per
  agent, real `<input type="checkbox">` (the kit has `Checkbox.tsx`), name +
  derived visual identity (§14), plus that agent's estimate. Select-all
  affordance (AC-3). Selection is **client state only** — nothing is persisted
  and no agent's `enabled` flag is touched (AC-3's verify).
- Estimates from `useAgentRunEstimates()`. Per agent: duration and cost, or the
  explicit "no estimate available" copy when `avg_duration_ms` /
  `avg_cost_usd` are null (AC-5 — never `0`, never fabricated). Aggregate:
  **max** of durations, **sum** of costs, recomputed as the selection changes
  (AC-6). An agent with no estimate contributes nothing to the aggregate and
  the aggregate says so.
- Run button states the selected count and is disabled with no PR or no agents
  (AC-4). Zero agents in the workspace → the AC-7 state with a route to
  `/agents` and **no** run action.
- **N3 is a non-goal:** no per-agent "likely findings" preview. The estimate is
  what Screen A gets instead (D17).
- Zero LLM calls on this whole flow (AC-8) — every request here is a plain read.

#### 14. Results surface — `_components/MultiAgentResultsView/`

One `useMultiAgentRun(prId)` read feeds **both** layouts; the layout toggle is a
client-side value, issuing **no** additional request (AC-29) and making no LLM
call (AC-31).

- **Columns (Screen C)** — `ColumnsLayout.tsx`: one column per grouped agent
  with name + derived identity, provider, model, status, verdict, score,
  summary, duration, cost; compact finding rows (severity, title, file path);
  the per-column finding count; and a view-logs affordance (AC-25, AC-32).
- **Tabs (Screen D)** — `TabsLayout.tsx`: one tab per grouped agent showing name
  and score; the active tab shows that run's summary, duration, cost and a
  view-logs affordance (AC-33); its findings render through the **existing**
  `FindingCard` with its existing action set — Accept, Dismiss, Learn, Turn into
  eval case (AC-34, D19). No multi-agent-specific finding card. Triage from here
  writes through the same finding-action route, so a finding accepted here is
  accepted on the PR page too — correct, and the reason this surface is not
  read-only (the spec's edge case).
- **Conflicts** — `ConflictsSection.tsx`, rendered beneath the results in
  **both** layouts from the **same** `conflicts` array (AC-30). Three distinct
  states, which mean different things to a reviewer and must not be collapsed:
  conflicts present; zero conflicts with ≥2 participating agents → "the agents
  agree on every flagged location" (AC-40); fewer than 2 participating agents →
  "comparing stances needs at least two successful agent runs" (AC-42).
  A "show only conflicts" control restricts both layouts and releasing it
  restores the full results with **no** refetch (AC-41).
- **Score legend** — the surface states that a **higher score is better**
  (AC-26, D18), and presents no cross-agent ranking or "best agent" aggregate
  (N9).
- **Per-agent logs (AC-43 … AC-46)** — mount the **existing**
  `RunTraceDrawer` (`_components/RunTraceDrawer`, props at
  `RunTraceDrawer.tsx:19-29`) exactly as `PrDetailView.tsx:228-236` does:
  `runId` from the column, `prNumber`, `agentName`, `running` from the column's
  status, and `findings` sourced from `usePrReviews(prId)` — the same per-PR
  reviews data the PR page already feeds that prop (`PrDetailView.tsx:112`,
  `:232`). This is D13's resolved gap: `AgentColumnFinding` is a deliberate
  subset and cannot satisfy the drawer's `FindingRecord[]` prop. **No second
  drawer, no fork, no copy** (AC-46) — import the component, do not
  re-implement it.
- **Partial and failed (AC-47 … AC-50)** — every succeeded column renders in
  full; failed and cancelled columns render marked with their recorded `error`;
  the run itself is **never** presented as failed while one agent succeeded. All
  grouped runs failed → the AC-49 state naming each reason. When **every**
  column carries the *same* error string, render it **once** as one shared
  reason (AC-50 — this is exactly what `failAll`
  (`run-executor.ts:78-97`) produces on a diff-load failure).
- **AC-56 — untrusted output.** `client/LEARNINGS.md:244-263`:
  `vendor/ui/primitives/Markdown.tsx` blocks raw HTML but constrains **no**
  link or image target. So: every **new** surface in this feature — column
  summaries, verdicts, compact finding titles, conflict titles, conflict
  rationale notes, agent names, tab labels — renders as **plain JSX text nodes**
  (React-escaped). No `dangerouslySetInnerHTML`, no new `Markdown` call site, no
  `urlTransform` change to the shared primitive. The one place markdown is
  rendered is inside the **reused** `FindingCard` (`:106`, `:112`), which is
  pre-existing behaviour this feature inherits rather than introduces. Note the
  amplification the spec calls out: this page renders N agents' worth of
  model-authored text at once, and the tabs layout renders it expanded.
- **AC-58 — accessibility.** Status, severity, score and conflict stance carry a
  text or glyph marker in addition to colour (this matters more here than
  anywhere else, because D21's identity scheme leans on colour). PR selection,
  agent select/deselect, run, layout switch, conflicts-only filter and open-logs
  are all real `<button>` / `<a>` / `<input>` elements. The run-status region is
  `role="status" aria-live="polite"` bound to the polled per-agent statuses.
- **D21 — derived visual identity.** A pure helper (`helpers.ts` in the results
  folder, exported for the configure surface and the PR-page picker) mapping an
  agent id to `{ color, icon }` from a fixed palette via a stable hash. No
  schema field, no stored value, same agent looks the same on every surface and
  across reloads (N14).

#### 15. PR-page entry point and resume (D23, AC-60 … AC-62, AC-68)

`RunReviewDropdown.tsx` — its `items` array (`:63-84`) gains, between the
existing "Run all" row and the existing per-agent rows:

- a `"PICK AGENTS TO RUN"` header row and a Clear affordance;
- one **multi-select** row per agent (`checked` + `keepOpen`, §8) with a small
  duration estimate from `useAgentRunEstimates()`;
- a count-labelled run action calling `useStartMultiAgentRun()`.

Two caveats from D23, resolved here so they are not discovered mid-build:

1. The existing dropdown deliberately lists **every** agent, not just enabled
   ones (`:52-54`'s comment: "a specific agent can be run regardless of its
   enabled flag"). The **existing single-agent rows keep that behaviour
   unchanged** (AC-62); the **new multi-select rows follow the mockup** and
   offer only agents that can actually be selected for a run.
2. The existing `Run all` and per-agent rows, and the existing
   `runReview.configureAgents` row, must behave exactly as they do today
   (AC-62) — except that `configureAgents` now routes to
   `/repos/:repoId/multi-agent?pr=<prId>` instead of `/agents`, which is D23's
   stated intent ("a 'Configure agents…' row leading to the full configure
   surface").

A run triggered here submits the **same** request shape, creates the **same**
multi-agent run, and lands on the **same** results surface (AC-61) — there is no
second backend surface. The AC-12 in-flight guard is per pull request and
applies regardless of entry point, so the picker must surface the in-flight run
rather than appear to start a second one (the spec's edge case).

`PrDetailView.tsx` gains the AC-68 affordance — shown only when that PR has a
multi-agent run, navigating to the results and starting nothing.

### Explicitly not built

Any CI execution or CI-triggered run (N1); any executor change beyond D16's
concurrency (N2); the per-agent "likely findings" preview (N3); semantic or
embedding-based conflict detection (N4); the Reply-to-author action (N5); a
multi-agent run history browser (N6); an MCP tool (N7); an e2e flow (N8);
cross-agent ranking or a "best agent" aggregate (N9); any automatic run — on PR
open, push, page load or schedule (N10); any read or write of
`vendor/shared/contracts/eval-ci.ts` (N11); agent configuration editing from
these surfaces (N12); stored conflicts (N13); a per-agent colour/icon schema
column (N14); the `AgentStats` surface or `GET /agents/:id/stats` (N15). Also
**not** built: any edit to `reviewer-core`, to `groundFindings`, to
`INJECTION_GUARD`, to the seed, or to anything under `e2e/` or `mcp-server/`.

## Skills for implementer

Derived from `.claude/skills/pr-self-review/SKILL.md` Phase 3 (the routing
table at `:128-137`) and the catalog in `.claude/skills/README.md:9-24`. Load
the row matching the files you are currently editing, not all at once; respect
each skill's declared scope. Phase 3's "cap at 4" is a *review-pass* budget, not
an implementation one.

| Path glob in this plan | Skills to load | Why |
|---|---|---|
| `server/src/modules/reviews/run-executor.ts` (Phase A1) | `onion-architecture` | Phase 3's `server/src/modules/**` row. Loaded **specifically to confirm the change stays inside its ring** — the whole point of A1 is that persistence, error handling and the run bus are untouched. `fastify-best-practices` is *not* needed for A1: no route changes. |
| `server/src/modules/reviews/{multi-agent,conflicts,findings,constants}.ts`, `.../repository/*.repo.ts`, `.../repository.ts`, `.../service.ts`, `.../routes.ts` | `onion-architecture`, `fastify-best-practices` | Phase 3's `server/src/modules/**` row. The ring rules and D-P4's "one module, no cross-module port" decision are what keep `pnpm arch` at zero new baseline entries. `fastify-best-practices` for the schema-first zod body and the per-route `config.rateLimit`. |
| `server/src/db/schema/runs.ts`, `server/src/db/migrations/**` | `drizzle-orm-patterns`, `postgresql-table-design` | Phase 3's `server/src/db/**` row. One nullable FK column with `ON DELETE set null` plus an index, generated in a single add-only pass (finding 5). |
| `server/src/vendor/shared/contracts/{observability,platform}.ts`, `client/src/vendor/shared/contracts/{observability,platform}.ts`, the route body schemas | `zod` | Phase 3's `**/contracts/**` row. Also the `.nullable()`-makes-the-key-required trap (`server/LEARNINGS.md:483-496`) — deliberate for `AgentColumn.error`, wrong for genuinely optional fields. |
| `server/src/modules/reviews/{multi-agent,conflicts,findings}.ts`, `.../repository/memory.repo.ts` | `security` | Phase 3's "any `.ts`/`.tsx`" row, and sharpest here for three reasons: AC-14/AC-55 (a client-supplied agent id list is attacker-controllable and one foreign id must fail the whole request, never be dropped); AC-55 workspace scoping resolved **before** any row is read, noting that findings reach a workspace only transitively; and AC-63/AC-64 — Learn promotes model-authored text over attacker-influenceable input into a **durable** repository-scoped store that outlives the run, the PR and the review. |
| `client/src/app/repos/[repoId]/multi-agent/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/{FindingCard,FindingsPanel,RunReviewDropdown,PrDetailView}/**` | `frontend-ui-architecture`, `next-best-practices`, `react-best-practices` | Phase 3's `client/src/app/**` row. Colocated `_components/<Name>/` folders, thin route files, the `"use client"` boundary, the repo-scoped route template (`client/LEARNINGS.md:404-415`), and the selection/layout/filter state-ownership questions in §13–§15. |
| `client/src/lib/hooks/multi-agent.ts`, `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/kit/{types.ts,Dropdown.tsx}` | `frontend-ui-architecture`, `react-best-practices` | Phase 3's `client/src/lib/**` and `client/src/components/**` rows. The conditional-`refetchInterval` + `cancelQueries` pattern, and the four-wirings rule for `nav.ts`. |
| `client/**/*.test.tsx` | `react-testing-library` | Phase 3's row. |

**Routing gaps.** Phase 3 has no row for `client/src/vendor/**` — `nav.ts` and
`kit/Dropdown.tsx` both live there and are edited as **owned source**
(`client/CLAUDE.md:22-28`), so the `client/src/components/**` row is the closest
fit and is what this plan routes them to. Flagging it because a shared UI
primitive used by every dropdown in the product deserves an explicit row, not an
inferred one. (`plans/09` and `plans/10` both flagged a missing `mcp-server/**`
row; this plan touches no `mcp-server` file — N7 — so that gap does not bite
here.)

Root `CLAUDE.md` §"Before you finish": append an `engineering-insights` entry to
each touched module's `LEARNINGS.md` — at minimum `server/LEARNINGS.md`
(whether the concurrent loop held AC-19/AC-20 without touching `RunLogger`, the
new provider-load exposure from §1, and whether the add-only single-pass
migration behaved as finding 5 predicted) and `client/LEARNINGS.md` (a **third**
instance of the `:362-402` four-wirings entry — extend it, do not duplicate —
and the additive-extension pattern for a shared `vendor/ui` primitive).

## Verification

Scoped commands, per phase. `pr-self-review` re-runs the full suites before push
regardless, so nothing below is a blanket run.

### Phase A1 — executor concurrency (must be green before A2 starts)

```
cd server && pnpm typecheck
cd server && pnpm exec vitest run \
  test/prompt-skills.test.ts \
  test/prompt-project-context.test.ts \
  test/skills-preview.test.ts \
  test/reviews.it.test.ts \
  test/integration.it.test.ts \
  test/routes-smoke.test.ts \
  src/modules/reviews/run-executor.concurrency.test.ts
cd server && pnpm arch
```

- These are **the existing review tests**, and AC-19 makes them a **gate, not a
  formality**: "the existing single-agent and run-all review tests pass
  unchanged against the concurrent loop". Do not edit them to accommodate the
  change — an edit to any of them is an AC-19 failure.
- `test/reviews.it.test.ts` self-skips without Docker. **It is the primary AC-19
  gate and cannot be skipped for this phase** — start Docker. If it fails, read
  finding 7 before suspecting the diff.
- `pnpm arch` must report **zero new** violations.
- **Pass:** all green, and the new concurrency test shows a batch of N agents
  each taking ~T completing in ~T rather than ~N×T (AC-16), one diff-load step
  for N agents (AC-18), every other agent persisting its run/review/findings
  when one agent's provider throws (AC-17), and each run's event buffer
  containing only its own agent's events alongside the shared pre-work events
  (AC-20).

### Phase A2 — multi-agent server surface

```
cd server && psql "$DATABASE_URL" -c 'select count(*) from multi_agent_runs;'   # must be 0
cd server && pnpm db:generate < /dev/null                                       # ONE pass, add-only
cd server && pnpm db:migrate
cd server && pnpm typecheck
cd reviewer-core && pnpm typecheck
cd server && pnpm exec vitest run \
  src/modules/reviews/conflicts.test.ts \
  src/modules/reviews/multi-agent.test.ts \
  src/modules/reviews/findings.test.ts \
  test/contracts.test.ts \
  test/multi-agent.it.test.ts \
  test/reviews.it.test.ts
cd server && pnpm arch
```

- Read the generated `.sql` before `db:migrate`: it must contain **only**
  `ALTER TABLE "agent_runs" ADD COLUMN`, an `ADD CONSTRAINT` for the FK, and a
  `CREATE INDEX`. Anything else means the schema edit was wider than planned. If
  `db:generate` hangs, you introduced an add+drop on one table
  (`server/LEARNINGS.md:64-101`).
- `reviewer-core`'s typecheck is in scope because its `@devdigest/shared` alias
  resolves to **server's** `vendor/shared` (`reviewer-core/CLAUDE.md`
  §Gotchas) — the contract edit reaches it immediately.
- `test/contracts.test.ts` is included because widening `AgentColumn.status` and
  adding `AgentColumn.error` makes the key required
  (`server/LEARNINGS.md:483-496`); any fixture building one stops compiling.
- **Pass:** all green; `pnpm arch` reports **zero new** violations. A failure
  means a cross-module import slipped in — fix the import, do **not** run
  `pnpm arch:baseline` (`server/LEARNINGS.md:706-720`).
- **Also assert manually:** `git diff reviewer-core/` is empty (D4).

### Phase B1 — client foundations

```
cd client && pnpm typecheck
cd client && pnpm exec vitest run \
  "src/vendor/ui/kit/**" \
  "src/lib/hooks/**" \
  "src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/**" \
  "src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/**"
```

- The `kit`, `FindingCard` and `FindingsPanel` globs are **all** required: each
  is existing code with existing tests, and those tests are the regression check
  that the `Dropdown` extension and the new action changed nothing else.
- **Pass:** all green, and a `Dropdown` test proves a plain row still dismisses
  on activation while a `keepOpen` checked row does not.

### Phase B2 — the multi-agent surfaces

```
cd client && pnpm typecheck
cd client && pnpm exec vitest run \
  "src/app/repos/[repoId]/multi-agent/**" \
  "src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/**" \
  "src/app/repos/[repoId]/pulls/[number]/_components/PrDetailView/**" \
  "src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/**"
cd client && pnpm build
```

- The build step is **not optional** — typecheck + vitest do not prove the pages
  render, and this adds new `@devdigest/shared` consumers, the exact trap in
  `client/LEARNINGS.md:316-361`.
- **Pass:** "Multi-Agent Review" is reachable **from the sidebar**, not just by
  typing the URL (AC-52, `client/LEARNINGS.md:362-402`); the configure surface
  renders the pick-a-PR-first state with no agent list; the results surface
  renders both layouts from one read; and the PR page's Run Review control shows
  multi-select rows alongside its unchanged single-agent and run-all options.

### Cross-cutting

```
diff server/src/vendor/shared/contracts/observability.ts client/src/vendor/shared/contracts/observability.ts
diff server/src/vendor/shared/contracts/platform.ts       client/src/vendor/shared/contracts/platform.ts
git status --porcelain server/src/db/migrations
git diff reviewer-core/ mcp-server/ e2e/ evals/
git diff -- server/src/vendor/shared/contracts/eval-ci.ts client/src/vendor/shared/contracts/eval-ci.ts
```

- **Both diffs must be empty.** These two files are byte-identical today
  (finding 2), so AC-53 is an exact-equality check, not a drift-allowance one.
  Any output is an AC-53 failure and a HIGH `pr-self-review` Phase 4 finding.
- Exactly **one** new migration file, no edit to an existing one
  (`server/CLAUDE.md:31-32`).
- `git diff reviewer-core/ mcp-server/ e2e/ evals/` must be **empty** — D4, N7,
  N8.
- The `eval-ci.ts` diff must be **empty** — N11, Export-to-CI owns it.

### Test matrix the scoped files must cover

| Test scenario | ACs |
|---|---|
| With no PR chosen, the agent area shows the pick-a-PR-first state and the run control cannot be activated | AC-1 |
| Selecting a PR presents every workspace agent as an individually selectable entry with its name and derived identity | AC-2 |
| Selecting and deselecting agents leaves every agent's persisted `enabled` flag unchanged; select-all selects all | AC-3 |
| The run action states the selected count and is disabled with no PR or no agent | AC-4 |
| An agent with no completed run shows "no estimate available", never `0` or a fabricated figure | AC-5 |
| Two agents at 8.2s/$0.06 and 3.1s/$0.04 aggregate to 8.2s and $0.10, and update as the selection changes | AC-6 |
| A workspace with no agents states so, offers a route to the agents surface, and offers no run action | AC-7 |
| Exercising the whole configure flow against a stubbed provider produces zero provider calls | AC-8 |
| Selecting four of five agents produces four run ids under one multi-agent run id | AC-9 |
| The existing `{agentId}` and `{all:true}` request forms remain valid and behave as today | AC-10, AC-19 |
| Every `agent_runs` row a multi-agent run creates has `source = 'local'` | AC-11 |
| Two rapid activations produce exactly one multi-agent run and the second surfaces the in-flight one (use `server/LEARNINGS.md:103-127`'s recipe, **not** `Promise.all`) | AC-12 |
| The trigger responds with the multi-agent run id and its per-agent run ids before any review completes | AC-13 |
| A request mixing one valid and one foreign agent id starts **zero** runs and creates no multi-agent run record | AC-14, AC-55 |
| Repeated triggers hit the rate limit rather than fanning out unbounded LLM executions | AC-15 |
| A batch of N agents each taking ~T completes in ~T, not ~N×T | AC-16 |
| In a concurrent batch where one agent's provider throws, every other agent still persists its own run, review and findings | AC-17 |
| A batch of N agents produces **one** diff-load step, not N | AC-18 |
| The existing single-agent and run-all review tests pass **unchanged** against the concurrent loop | AC-19 |
| In a concurrent batch, each run's event stream contains only its own agent's events alongside the shared pre-work events | AC-20 |
| Reading a stored multi-agent run returns the same run ids the trigger returned, after a server restart | AC-21 |
| Every finding under a multi-agent run resolves to exactly one agent and one run through its review, with no second attribution path | AC-22 |
| Every review row a multi-agent run produces has both `agent_id` and `run_id` set | AC-23, D-P6 |
| A run reports agent count, wall-clock duration and summed cost; an unknown grouped cost makes the total **unavailable**, not `0` | AC-24 |
| Opening results renders one result per grouped agent with name, identity, provider, model, status, verdict, score, summary, duration, cost and findings | AC-25 |
| A run whose persisted score is 38 displays 38, with a legend stating higher is better, and no ranking is presented | AC-26, N9 |
| A participating agent with no findings states so rather than rendering an empty result | AC-27 |
| A grouped run with no summary states that no summary exists | AC-28 |
| Toggling the layout issues **no** additional request | AC-29 |
| The disagreement section renders beneath both layouts from the same computed conflicts | AC-30 |
| Opening results and switching layouts against a stubbed provider produce zero provider calls | AC-31 |
| The column layout shows compact findings (severity, title, file path), a per-column count and a view-logs affordance | AC-32 |
| The tab layout shows one tab per agent with name and score, and the active tab's duration, cost and view-logs affordance | AC-33 |
| The tab layout's findings expose the same four triage actions, with the same behaviour, as the PR review page's findings | AC-34, D19 |
| Conflicts are computed at read time and nothing is stored | AC-35 |
| Two findings on one file at 10–20 and 18–25 group as one location; the same two on different files do not | AC-36 |
| Two agents at the same severity on the same lines is agreement, not a conflict, and is hidden by the conflicts-only filter | AC-37, AC-41 |
| A run where one agent failed and one flagged a line produces **no** conflict at that line | AC-38 |
| A conflict presents file, line, a title from a flagging finding, and per agent either a severity + one-line rationale or an explicit did-not-flag stance | AC-39 |
| Zero conflicts with ≥2 participants states that the agents agree, rather than showing an empty list | AC-40 |
| The conflicts-only control restricts both layouts; releasing it restores full results with no refetch | AC-41 |
| A one-agent run states that comparing stances needs at least two successful runs — a different message from "no conflicts" | AC-42 |
| A full-file-kind finding never matches a line-ranged finding, and does not flood the section; a range wider than the cap is treated as file-scoped | D-P1 |
| A conflict over two overlapping ranges anchors on the minimum flagging `start_line`, and the same stored run yields byte-identical conflicts on repeated reads | D-P2, determinism |
| A chain of ranges 10–20 / 18–25 / 24–30 merges into one location, deterministically regardless of row order | D-P3 |
| The view-logs affordance resolves to the **same** `RunTraceDrawer` component the PR detail page mounts, not a copy | AC-43, AC-46 |
| The opened drawer shows configuration, stats, prompt assembly, tool calls, raw output, findings and copy-raw-output, unchanged from the PR page | AC-44 |
| An in-flight grouped run streams live progress; a completed one shows its persisted trace | AC-45 |
| Four agents, one provider error → three full results, one failed result with its reason, run still readable, run not marked failed | AC-47 |
| An in-flight run shows per-agent progress and per-agent completion, not one undifferentiated pending state | AC-48 |
| All grouped runs failed → the run states it produced no results and names each reason | AC-49 |
| A diff-load failure presents **one** shared reason, not N identical per-agent errors | AC-50 |
| A PR with no multi-agent run states so and offers a route to configure | AC-51 |
| The `NAV` array contains an item whose key is what `activeKeyFor` already returns for this route, and following it lands on the surface | AC-52 |
| Both `vendor/shared` copies of `observability.ts` and `platform.ts` are byte-identical after the change | AC-53 |
| A response that does not conform to `MultiAgentRun` is rejected at the boundary, not partially rendered | AC-54 |
| Another workspace's PR, agent, agent run, multi-agent run or finding is neither disclosed nor acted on, over every surface | AC-55 |
| A finding title containing a `<script>` tag renders as visible text | AC-56 |
| A multi-agent run sends strictly no additional repository content to any provider beyond a single-agent review of the same PR, under the existing shared guard, with no per-feature keyword scanning added | AC-57 |
| Status, severity, score and conflict stance are distinguishable without colour; PR select, agent select/deselect, run, layout switch, conflicts filter and open-logs are keyboard-operable; a status change is announced via `aria-live` | AC-58 |
| The run-summary line reports agent count, duration and cost, and contains no reference to worktrees or a named queueing library | AC-59 |
| The PR page's Run Review control offers multi-agent selection alongside its existing single-agent and run-all options | AC-60 |
| Runs started from either entry point are indistinguishable once created and land on the same results surface | AC-61 |
| The PR-page picker routes to the full configure surface for that PR, and its existing single-agent and run-all options behave as today | AC-62 |
| Activating Learn produces exactly **one** stored memory entry scoped to that repository, containing the finding's file and line range | AC-63 |
| Learn records which finding it came from, generates no embedding, and makes zero provider calls | AC-64 |
| The Learn copy claims the finding was **recorded**, not that the agent has learned from it or that future reviews will change | AC-65 |
| Selecting a PR that already has a run keeps the user on the configure surface with a visible route into the existing results; browser Back still leaves the section | AC-66, D26 |
| From results, one action returns the user to the agent picker for the same PR with the selection editable | AC-67 |
| The PR page's affordance navigates to the existing results and creates **no** new run record | AC-68 |
| Activating Learn twice on one finding does not write a second near-identical memory row | edge case, D24 |
| A PR whose only multi-agent run failed entirely is still resumable and readable, not offered a fresh picker | edge case |
| A run still in flight when the user returns resumes to the live run with per-agent progress, not a "no run yet" state and not a second trigger | edge case, AC-48 |
| A run cancelled part-way is not a participating agent and renders as cancelled | edge case, AC-38 |
| An agent renamed or deleted after a run still renders its stored result legibly (`agent_runs.agent_id` is `set null`) | edge case |
| A second multi-agent run on the same PR shows the latest; earlier runs' `agent_runs` and findings stay intact and reachable from the PR run history | edge case, D11 |
| An existing single-select `Dropdown` row still dismisses on activation; a `keepOpen` checked row does not | D23, §8 |

`*.it.test.ts` for anything DB-backed (the migration, multi-agent run
persistence and grouping, workspace scoping, the memory write, AC-23's non-null
invariant); everything else hermetic against a stubbed provider and fixture rows
(`server/CLAUDE.md:47-50`).

### After the sibling branch merges — a separate check

Per §Shared contracts, `client/src/vendor/ui/nav.ts`'s `NAV` array and
`SHORTCUTS` are touched by **both** this feature (`multi-agent`) and
Export-to-CI (`ci-runs`, `agent-performance` — `helpers.ts:48-49` and
`shell.json` already reserve both keys). This branch merges first and **must not
delete, rename or reorder anything resembling the sibling's entries**. Once
`feat/export-to-ci` merges, re-verify that all three items coexist, that none
was clobbered, and that each resolves to a live route. Neither branch can prove
this alone, and nothing errors if one clobbers the other.
