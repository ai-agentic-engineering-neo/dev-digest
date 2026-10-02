# Eval Pipeline — Implementation Plan

## Source requirements

[`specs/12-eval-pipeline.md`](../specs/12-eval-pipeline.md) (SPEC-12, status
**approved**, no open `[NEEDS CLARIFICATION]` — all ten were resolved
post-draft). This plan covers **every** acceptance criterion in that spec:

| Area | AC-IDs |
|---|---|
| Case creation from a triaged finding | AC-1 … AC-7 |
| Running a suite | AC-8 … AC-15 |
| Scoring (zero LLM calls) | AC-16 … AC-23 |
| Cost and spend control | AC-24 … AC-28 |
| The demonstration | AC-29, AC-30, AC-31 |
| Compare | AC-32, AC-33, AC-34 (**AC-35 deferred — N12**) |
| Client — agent Evals tab | AC-36 … AC-39 |
| Client — Eval Dashboard | AC-40 … AC-45 |
| Empty / degraded / failure states | AC-46 … AC-49 |
| Contracts, security, access | AC-50 … AC-54 |
| Accessibility | AC-55, AC-56 |
| `verify:l06` | AC-57 |

Decisions D1–D22, non-goals N1–N13 and the ten resolved clarifications are
**settled**; nothing below reopens them. Load-bearing throughout:

- The spec's disambiguation block is normative: the root `evals/` directory
  (harness self-check, `pnpm eval:quality`) and this feature share the word
  "eval" and **nothing else**. No file under `evals/` is read, written or
  imported by anything in this plan, and nothing in `evals/` learns about it.
- `eval_cases` / `eval_runs` and the `Eval*` contracts are **adopted and
  reshaped in place** (D1) — both tables are empty, unread and unwritten.
- Scoring is code-only (N1, G4, AC-16): file equality + line-range
  intersection. No judge model, ever.
- `citation_accuracy` is a **read** of the existing grounding gate's result
  (D6, G5). `reviewer-core` is not edited — `git diff reviewer-core/` must be
  empty at the end of this pass.
- An eval run's prompt gets the agent's versioned identity + the case's frozen
  input and nothing else (D9, AC-9).
- Every run is an explicit user action (D11/N5); opening a surface spends
  nothing (AC-28).
- Both `vendor/shared` copies, hand-reconciled, no new drift (D10, AC-50).

## Clarifications & recommendations

### Q1 — `eval_runs` reshape (DECIDED by the user)

**Widen `eval_runs` in place into the *suite* run row; per-case outcomes live
as a jsonb array on that row; no third table.** This is the "widened existing
row" half of D2's fork. Consequences the implementer must carry:

- `eval_runs.case_id` (`server/src/db/schema/eval.ts:24-26`, `NOT NULL` FK) is
  **dropped** — a suite run belongs to an *owner*, not a case.
- `EvalRunRecord.case_id` (`vendor/shared/contracts/eval-ci.ts:35`) is dropped
  from the contract for the same reason.
- The reserved set-level shape on `EvalRun` (`knowledge.ts:202-212`) is exactly
  right and is kept — including `per_trace`, which becomes the per-case outcome
  array.

### Q2 — execution path (DECIDED by the user)

**A new thin `server/src/modules/eval/executor.ts` calling `reviewPullRequest`
directly, structured like `modules/reviews/adhoc.ts`.** No flag, parameter or
branch is added to `ReviewRunExecutor` (`modules/reviews/run-executor.ts`).
`adhoc.ts:120-129`'s docstring already frames the exact posture this needs
("the SAME engine `run-executor.ts` uses, minus the slots that need a
persisted PR") — the eval executor is a second instance of that posture with a
*narrower* slot set (see Approach §4).

### Q3 — background vs SSE (DECIDED by the user)

**Background run + client polling. No `runBus`, no SSE, no `agent_runs` row.**
The run row's own `status` column is the poll target. AC-56's status
announcement is an `aria-live` region on the polled value.

Consequence worth stating: because the in-flight guard (AC-15) is the DB
`status` column and not an in-memory `Set`, it survives a process restart —
which is also what makes D19's staleness reconciliation the *only* way a stuck
run is cleared, and why it must exist.

### Q4 — seed agent + demo PR data (DECIDED by the user, with one planner amendment)

**Seed the seven fixture cases against the `Security Reviewer` agent**
(`server/src/db/seed.ts:196-207` — matches the reference mockups). The eighth
case is created live, on camera, from a real accepted/dismissed finding
(D22).

**The live 8th case needs a PR whose `pr_files.patch` is real text.** The
seeded `acme/payments-api` PR #482 has `patch: null` on every row
(`server/LEARNINGS.md:148-163`) — a case created from one of its findings would
be **refused by AC-6**, because a null patch yields zero hunks and no
expectation can intersect them. So a fixture PR with genuine diff content is a
hard prerequisite for the demo, not a nicety.

**Planner amendment (RECOMMENDATION — please confirm or override):** attach the
fixture PR to the **existing `acme/payments-api` repo** (e.g. PR #491) rather
than seeding a **second repo**. Reason, verified on disk:

- Root `CLAUDE.md` §Gotchas: "e2e flows `02`/`04`/`05` assume a DB seeded with
  only the one demo repo".
- `e2e/specs/02-repo-pulls-detail.flow.json:3` and
  `e2e/specs/04-pr-findings.flow.json:3` both state the assumption explicitly:
  "acme/payments-api (PR #482) is the **first** repo".
- `RepoRepository.list` (`server/src/modules/repos/repository.ts:33`) has **no
  `ORDER BY`** — "first repo" is Postgres physical order, i.e. unspecified. A
  second seeded repo is a coin-flip against three e2e flows.
- A second *PR in the same repo* is safe: all three flows navigate by clicking
  the PR **title** text, not by row index.

If you prefer the "import a small real repo through the repo-import path"
option, that works too and needs **no code** — it is a demo-prep action with a
GitHub token, and `GET /pulls/:id` (`modules/pulls/routes.ts:240-250`) already
persists real `patch` text on import. Treat it as the manual alternative to the
seeded fixture PR, not a substitute for it: `verify:l06` must pass on a freshly
seeded DB with no token, so the **seeded** fixture PR is what the automated
check leans on.

### Planner findings (not in the spec — read before coding)

1. **`test/contracts.test.ts:141-152` parses an `EvalRun` fixture.** The Q1
   reshape breaks it (`per_trace: [{ name, pass, expected, actual }]`). It is
   the *only* consumer of any `Eval*` contract in either package — confirmed by
   `grep -rn "EvalRun\|EvalCase\|EvalDashboard" client/src server/src`, which
   otherwise returns only the two `vendor/shared` copies and the barrel comment.
   Update that fixture in the same pass; do not add a compatibility shim.
2. **The client's reserved surface is larger than the spec's list.** Already
   present and entirely unwired: `client/messages/en/eval.json` (a full
   namespace, ~60 keys, `grep -rn '"eval"' client/src` finds **zero**
   `useTranslations("eval")`), `client/messages/en/shell.json:24`
   (`nav.eval: "Eval Dashboard"`), `client/src/components/app-shell/helpers.ts:46`
   (`if (pathname.startsWith("/eval")) return "eval";`), and
   `client/messages/en/agents.json:50` (`editor.tabs.evals: "Evals"`). Per
   `client/LEARNINGS.md:362-386`, three of the four wirings a route needs are
   therefore already in place and the **missing** one is the `NAV` entry in
   `client/src/vendor/ui/nav.ts` — the one nothing errors on if you skip it.
   Reuse the reserved i18n keys; add only what they don't cover.
3. **`AgentVersion` / `AgentVersionConfig` exist ONLY in the server copy** of
   `vendor/shared/contracts/knowledge.ts:473-497` — the client copy ends at
   `:466`. **Recommendation: do not port them.** AC-34's prompt diff is
   computed **server-side** and returned as structured diff lines on the
   compare contract, so the client never needs `AgentVersion` and the existing
   drift (which also includes the `openrouter` provider id, `knowledge.ts:422`)
   is neither widened nor forced open. This also makes AC-34 deterministic and
   testable server-side.
4. **This migration must be split into two `db:generate` passes.**
   `server/LEARNINGS.md:64-82`: dropping a column while adding others to the
   same table makes `drizzle-kit generate` ask an interactive rename question
   that hangs forever on non-TTY stdin. `eval_runs` both drops (`case_id`,
   `actual_output`, `pass`) and adds (twelve columns). Pass 1 adds only; pass 2
   drops only. Run each as `pnpm db:generate < /dev/null`.
5. **The eval module needs no cross-module port for its DB reads.**
   `no-cross-module` (`server/.dependency-cruiser.cjs:63-73`) forbids
   `modules/eval/**` importing `modules/reviews/**` — but it says nothing about
   `src/db/**`, and `db-only-in-repositories` (`:51-62`) explicitly *permits*
   `repository.ts`. So `modules/eval/repository.ts` reads `findings`,
   `reviews`, `pull_requests`, `pr_files`, `agents` and `agent_versions`
   directly. Ports are needed only for the agent's **skill bodies** and the
   **LLM resolver** — the `AgentLookup` / `SkillLookup` / `LlmResolver` trio
   `adhoc.ts:38-58` already declares, satisfied structurally by
   `container.agentsRepo` and `container.llm` and wired in `eval/routes.ts`
   (`server/LEARNINGS.md:187-200`). Expect **zero** new `pnpm arch` baseline
   entries.
6. **Citation accuracy needs no reviewer-core change.**
   `ReviewOutcome.review.findings` is the **kept** set and `ReviewOutcome.dropped`
   is the dropped set (`reviewer-core/src/review/run.ts:219-232`), so
   `kept / (kept + dropped)` is available per case. Do **not** parse the
   `outcome.grounding` string ("3/4 passed") — use the arrays.
7. **AC-6's check should call `groundFindings` itself, not reimplement it.**
   Build a synthetic `Finding` from the expectation with `kind: 'finding'`, run
   it through `groundFindings([f], parsedFrozenDiff)`, and refuse when
   `kept.length === 0`. That is literally G5/D6 ("a reuse, never a second
   definition"), needs no new reviewer-core export (`buildLineIndex` is exported
   from `grounding.ts:24` but **not** re-exported by
   `reviewer-core/src/index.ts:24`), and correctly catches the spec's
   full-file-kind edge case — a `secret_leak` finding is exempt from line
   intersection at review time but its case's expectation still requires it, so
   forcing `kind: 'finding'` in the check is what makes AC-6 the guard the spec
   says it is.
8. **A `pr_files.patch` is not a parseable unified diff on its own.** GitHub's
   per-file patch is hunks only — no `diff --git` / `---` / `+++` header — and
   `parseUnifiedDiff` (`server/src/adapters/git/diff-parser.ts`) keys files off
   the `+++ b/<path>` line (`server/LEARNINGS.md:112-129`). The frozen input
   must therefore be a **synthesized** self-contained diff:
   `diff --git a/<path> b/<path>` + `--- a/<path>` + `+++ b/<path>` + the stored
   patch. Unit-test that the frozen diff round-trips through `parseUnifiedDiff`
   to exactly one file with the expected path.
9. **`ConfigError` responds HTTP 500** (`server/LEARNINGS.md:131-147`), which is
   wrong for AC-49's "no provider key configured" branch. Resolve the LLM
   **before** creating the run row and translate a `ConfigError` into an
   `AppError(..., 422)` naming the missing key, so AC-49 gets a stated reason
   and no orphan run record.
10. **`productionize.ts`'s `PluginEvalCase`** (`vendor/shared/contracts/productionize.ts:47-57`)
    is a *different* reserved eval shape, for plugin bundles. Do not wire this
    feature into it — this is the same "two integration points under one name"
    trap `server/LEARNINGS.md:615-660` records.
11. **AC-27's rate limit is per-IP, not per-workspace, with the stock plugin.**
    `@fastify/rate-limit` is registered globally at `server/src/app.ts:101` and
    per-route configs (`modules/reviews/routes.ts:75`) key on IP. In this
    single-workspace local app the two coincide. **Planner judgment:** ship the
    per-route `config: { rateLimit: { max, timeWindow } }` and record the
    per-IP-vs-per-workspace nuance in a code comment rather than building a
    custom `keyGenerator` that would have to resolve the workspace before the
    hook runs. Flagging it so a reviewer doesn't read it as an oversight.

## Execution mode

**Planner recommendation: multi-agent, split server-then-client**, because this
is materially larger than SPEC-11: two reshaped tables across two migration
passes, two hand-reconciled `vendor/shared` copies, a new server module with a
real execution path, an additive edit to another module's service (D18), a seed
change, a new `verify:l06`, plus two new client route trees and a new editor tab.

**User's confirmed choice — multi-agent, in this order:**

1. **Phase A (server) — `/implement-plan`** (`implementer` → `plan-verifier`
   gate → `architecture-reviewer` fix loop) over Approach §1–§7.
   **Phase A's Verification block must be green before Phase B starts.**
2. **Phase B (client) — `/implement-plan`** again, over Approach §8–§10.
3. **`test-writer`** once, after both phases, for any row of the Verification
   test matrix the implementation passes did not produce.
4. **`/pr-self-review`** immediately before push (it re-runs the full suites).

## Modules affected

| Module | Why |
|---|---|
| **server** | The substance: a new `modules/eval/` (repository, scoring, executor, service, routes, ports, constants, prompt-diff, callout), the `eval_cases` / `eval_runs` reshape + two migrations, two `container` getters, one `modules/index.ts` entry, an additive `AgentsService.delete` cascade (D18), a boot-time stale-run reconcile (D19), the seed fixtures (D22) and `verify:l06` (D21). |
| **client** | The `EvalsTab` tree inside `AgentEditor`, the `/eval` dashboard and `/eval/agents/[agentId]` detail routes, `src/lib/hooks/eval.ts`, the `FindingCard` action, the `nav.ts` NAV + SHORTCUTS entries, and the `messages/en/eval.json` fill-in. |
| **both `vendor/shared`** | `contracts/knowledge.ts` (the `// ---- Eval ----` block) and `contracts/eval-ci.ts`, hand-edited in **both** unsynced copies (root `CLAUDE.md` §Do-not-touch, D10). |
| **reviewer-core** | **Not affected** — D6. `git diff reviewer-core/` must be empty. |
| **mcp-server** | **Not affected** — N9. |
| **e2e** | **Not affected** — N10. See Q4 for why the seed change must not disturb flows 02/04/05. |

## Architectural constraints

Cited, not paraphrased. Read the linked lines before writing the corresponding
code.

### Root

- `CLAUDE.md` §Do-not-touch / edit-with-care — `server/src/vendor/shared` and
  `client/src/vendor/shared` are **independent, already-drifted copies**. Every
  contract this feature touches lands in both, by hand (D10, AC-50).
  `pr-self-review` Phase 4 rates a one-sided change HIGH.
- `CLAUDE.md` §Conventions — migrations are **not** applied on boot:
  `cd server && pnpm db:migrate` after generating.
- `CLAUDE.md` §Gotchas — e2e flows `02`/`04`/`05` assume a DB seeded with only
  the one demo repo (Q4).
- `CLAUDE.md` §Eval Self-Check — the `evals/` scripts are the *harness*
  self-check, not this feature. This plan changes no file under `evals/`, so no
  `eval:*` script is part of its verification.

### server

- `server/CLAUDE.md:12-14` — routes are schema-first: zod `params`/`body` via
  `fastify-type-provider-zod`; handlers never hand-roll `Schema.parse`. Every
  new POST/PATCH body here needs a zod body schema (AC-13's field-level
  rejection comes free from this).
- `server/CLAUDE.md:15-16` — a new module must be added to
  `src/modules/index.ts` (one import + one entry) or it is dead code.
- `server/CLAUDE.md:17-18` — adapters sit behind `platform/container.ts` DI;
  tests swap `src/adapters/mocks.ts`, never module-level mocks.
- `server/CLAUDE.md:31-32` — never hand-edit an applied migration.
- `server/CLAUDE.md:38-40` — "if findings seem to vanish, check
  `groundFindings`". For this feature that is expected behaviour, not a bug:
  grounding-dropped findings are exactly what `citation_accuracy` measures.
- `server/CLAUDE.md:41-43` — prompt-injection defense is the one shared
  `INJECTION_GUARD`; **do not** add per-feature keyword scanning (AC-51 says
  the same).
- `server/CLAUDE.md:47-50` — `*.it.test.ts` = DB-backed (testcontainers,
  self-skipping without Docker); everything else hermetic. D21 depends on this.
- `server/.dependency-cruiser.cjs:63-73` `no-cross-module` (error) forbids
  `modules/eval/**` importing `modules/reviews/**` or `modules/agents/**`,
  **including `import type`** (`tsPreCompilationDeps: true`); `_shared` is the
  only exempt folder. `:41-49` `no-container-in-services` forbids `service.ts`
  importing `platform/container.ts`. `:51-62` `db-only-in-repositories` confines
  `src/db/**` to `repository.ts` and `routes.ts`. Importing `adapters/**` from a
  module is fine — `adhoc.ts:4` already does.
- `server/LEARNINGS.md:38-54` — grep for the table/contract name and confirm
  "never written to" before redesigning in place. (Done — `eval_cases` /
  `eval_runs` appear only in `db/schema/eval.ts` and the `db/schema.ts` barrel.
  Re-confirm with `select count(*) from eval_cases;` / `eval_runs` before adding
  `NOT NULL` columns without defaults.)
- `server/LEARNINGS.md:64-82` — the two-pass migration rule (finding 4).
- `server/LEARNINGS.md:84-109` — the in-flight-guard test recipe. Read it before
  writing AC-15's test even though this guard is DB-backed: the same
  "`Promise.all` is not deterministic" trap applies.
- `server/LEARNINGS.md:112-129` — `parseUnifiedDiff` drops binary files, pure
  renames and deletions (finding 8).
- `server/LEARNINGS.md:131-147` — `ConfigError` responds 500 (finding 9).
- `server/LEARNINGS.md:148-163` — PR #482 has `patch: null` (Q4).
- `server/LEARNINGS.md:187-200` + the addendum at `:252-271` — a new module
  needing another module's repo declares a **narrow local port**, composed at
  `routes.ts`.
- `server/LEARNINGS.md:442-456` — `.nullable()` on a shared contract makes the
  key **required**; decide per field. For the three metrics that is exactly what
  we want (AC-20 must be stated, never absent).
- `server/LEARNINGS.md:571-601` — "restore an old version needs no new
  persistence logic". Relevant only if AC-35 ever ships (N12); do not build it.
- `server/LEARNINGS.md:615-660` — the reserved-but-unwired pattern, and the
  "same name, two integration points" trap (finding 10).
- `server/LEARNINGS.md:665-680` — the dependency-cruiser baseline matches exact
  from→to edges. If `pnpm arch` fires, fix the import; do not re-baseline.
- `server/LEARNINGS.md:681-716` — tests build partial `as unknown as Container`
  mocks; a new `container.<x>` read in shared code must tolerate a mock lacking it.
- `server/src/modules/reviews/adhoc.ts:24-58`, `:120-200` — the executor
  precedent (Q2): local `AgentRecord` / `AgentLookup` / `SkillLookup` /
  `LlmResolver` shapes, `renderSkillBlock` from `_shared/skill-render.ts`, the
  `reviewPullRequest` call shape, `countBlockers` for nothing here (eval does
  not gate — N8).
- `server/src/modules/reviews/service.ts:152-176` — the fire-and-forget
  background-run precedent (Q3): create the row first so the id returns
  immediately, `void ...catch(log)` the slow part.
- `server/src/platform/container.ts:206-229` — the lazy `briefRepo` /
  `briefService` getter shape to copy.
- `server/src/modules/brief/routes.ts:1-60` — the routes-as-adapters shape:
  `getContext` first, one service call, zod body schema, no `src/db` import.
- `server/src/modules/agents/routes.ts:86`, `:134-137` — where `AgentsService`
  is constructed (ports passed at the composition point) and where D18's
  cascade hooks in.
- `reviewer-core/CLAUDE.md` §Do-not-touch — `groundFindings` is the declared
  do-not-touch surface. This feature calls it; it never changes it.

### client

- `client/CLAUDE.md:13-15` — all data access goes through `src/lib/hooks/*` →
  `src/lib/api.ts`; never `fetch` in a component.
- `client/CLAUDE.md:16-17` — pages stay thin; feature logic lives in colocated
  `_components/<Name>/` folders, each with its own `*.test.tsx`.
- `client/CLAUDE.md:18-19` — new UI strings need a `messages/en/*.json` entry,
  not inline literals.
- `client/CLAUDE.md:22-28` — `src/vendor/shared` and `src/vendor/ui` are owned,
  drifted copies with no resync mechanism. `nav.ts` lives in `vendor/ui` and is
  edited as owned source (its own comment at `:47-48` reserves the slot).
- `client/LEARNINGS.md:316-361` — importing a **runtime value** from the bare
  `@devdigest/shared` barrel breaks Next's webpack build with a misleading
  error; import from `@devdigest/shared/contracts/eval-ci` (or
  `.../knowledge`). Also: passing `typecheck` + `vitest` is **not** evidence the
  page renders.
- `client/LEARNINGS.md:362-386` — a new top-level route needs **four** wirings;
  `nav.ts`'s `NAV` array is the one that fails silently (finding 2). Update
  `SHORTCUTS` in the same file.
- `client/LEARNINGS.md:401-423` — a mutation hook writing `setQueryData` in
  `onSuccess` needs `qc.cancelQueries` in `onMutate`.
- `client/LEARNINGS.md:424-437` — a component calling `useToast()` needs
  `vi.spyOn`, not a provider, in tests.
- `client/LEARNINGS.md:454-471` — `activeKeyFor`'s `pathname.includes(...)`
  substring-match bug class; `/eval` already has a `startsWith` entry
  (`helpers.ts:46`) — verify it doesn't shadow anything new.
- `client/LEARNINGS.md:244-263` — `Markdown.tsx` constrains no link/image
  target and has no `rehype-raw`. AC-52 is satisfied by rendering
  case/finding/prompt text as **plain JSX text nodes** (React-escaped); do not
  reach for `dangerouslySetInnerHTML`, and do not add a plugin to the shared
  primitive.
- `client/LEARNINGS.md:299-315` — count the `../` depth to `messages/en/*.json`
  in a test file; measure, don't guess.
- `client/src/lib/hooks/onboarding.ts` and `.../brief.ts` — the polling-hook
  precedent Q3 needs: conditional `refetchInterval` only while the status says
  in-flight, `cancelQueries` in `onMutate`.
- `client/src/app/skills/page.tsx` — the thin workspace-scoped route template
  for `/eval` (this feature is **not** repo-scoped — AC-40).

## Approach

### Phase A — server

#### 1. Shared contracts — `knowledge.ts` + `eval-ci.ts`, reshaped in place, in BOTH copies

Apply every edit to `server/src/vendor/shared/contracts/*` **and**
`client/src/vendor/shared/contracts/*`. The two `eval-ci.ts` copies differ today
only by the `AgentManifest` block and `ConformanceInput.provider`'s third enum
value; the two `knowledge.ts` copies differ by the `openrouter` comment, a
`CiFailOn` comment and the `AgentVersion*` block. **Preserve those differences
exactly; add no new ones** (AC-50, finding 3).

**`knowledge.ts` — the `// ---- Eval ----` block (`:193-228`):**

| Symbol | Change |
|---|---|
| `EvalOwnerKind` (`:214`) | unchanged (`['skill','agent']`). Only `'agent'` is ever written this slice (N3). |
| `EvalExpectationType` | **new** enum: `['must_find','must_not_flag']` (D3). |
| `EvalExpectation` | **new**: `{ type: EvalExpectationType, file: z.string().min(1), start_line: int, end_line: int, severity: z.string().nullish(), category: z.string().nullish(), title: z.string().nullish() }`. `severity`/`category` are the AC-38 tags, carried from the source finding. Closed vocabulary + integer lines are what AC-13/AC-53 reject against. |
| `EvalCase` (`:217-228`) | **reshaped**: `expected_output: z.unknown()` → `expectation: EvalExpectation`; `input_files: z.unknown()` → `z.array(z.string())`; `input_meta: z.unknown()` → `EvalCaseMeta`; add `source_finding_id: z.string().nullable()`, `created_at: z.string()`, `updated_at: z.string()`. `input_diff` stays `z.string()` (now non-empty by construction). |
| `EvalCaseMeta` | **new**: `{ pr_number: z.number().int().nullable(), title: z.string(), body: z.string().nullable() }` — D16's trimmed, frozen PR metadata. Never a repo id, never a live pointer. |
| `EvalActualFinding` | **new**: `{ file, start_line, end_line, severity, category, title, matched: z.boolean() }`. Declared here (not imported from `findings.ts`) so `knowledge.ts` gains no new import edge; it is a display slice, not a `Finding`. |
| `EvalPerTrace` (`:194-200`) | **renamed + reshaped** to `EvalCaseOutcome`: `{ case_id, name, expectation_type: EvalExpectationType, status: z.enum(['scored','errored']), pass: z.boolean().nullable(), error_reason: z.string().nullable(), findings_total: int, findings_matched: int, grounding_kept: int, grounding_total: int, duration_ms: int, cost_usd: z.number().nullable(), actual: z.array(EvalActualFinding) }`. `pass` is `null` exactly when `status === 'errored'` (AC-11). |
| `EvalRun` (`:202-212`) | **kept as the set-level metrics object**, with the three ratios made `.nullable()` for AC-20's "not applicable", and `per_trace` → `per_case: z.array(EvalCaseOutcome)`, plus `cases_errored: int`. Final: `{ recall: nullable, precision: nullable, citation_accuracy: nullable, traces_passed: int, traces_total: int, cases_errored: int, duration_ms: int, cost_usd: nullable, per_case: EvalCaseOutcome[] }`. |

**`eval-ci.ts` — the Eval section (`:15-88`):**

| Symbol | Change |
|---|---|
| `EvalCaseInput` (`:20-30`) | **reshaped** to the edit payload (AC-12/13): `{ name: z.string().min(1), notes: z.string().nullish(), input_diff: z.string().min(1), input_files: z.array(z.string()), input_meta: EvalCaseMeta, expectation: EvalExpectation }`. `owner_kind`/`owner_id` leave the body — the route resolves the owner (and AC-54 depends on it doing so). |
| `EvalCaseFromFindingInput` | **new**: `{ finding_id: z.string().uuid() }`. |
| `EvalRunRecord` (`:33-46`) | **reshaped** into the **suite** run (D2/Q1): `{ id, owner_kind, owner_id, agent_name: z.string().nullish(), status: EvalRunStatus, started_at, finished_at: nullable, agent_version: z.number().int().nullable(), case_ids: z.array(z.string()), metrics: EvalRun.nullable(), duration_ms: nullable, cost_usd: nullable, error_reason: nullable }`. `case_id`, `actual_output`, `pass` are gone. `metrics` is `null` while `status === 'running'`. |
| `EvalRunStatus` | **new** enum: `['running','completed','errored']`. |
| `EvalRunEstimate` | **new** (AC-24/AC-25): `{ agents_total: int, cases_total: int, executions_total: int }`. |
| `EvalRunResult` (`:49-53`) | **reshaped** to the start response: `{ run_id, status: EvalRunStatus, estimate: EvalRunEstimate }`. |
| `EvalRunAllResult` | **new** (AC-25/AC-42): `{ estimate: EvalRunEstimate, started: z.array(z.object({ agent_id, agent_name, run_id: nullable, refused_reason: nullable })) }` — per-agent success/failure, never one combined verdict. |
| `EvalTrendPoint` (`:56-63`) | ratios → `.nullable()`; add `run_id`, `agent_version: nullable`; keep `pass_rate`, `cost_usd`. |
| `EvalCallout` | **new** (D12/AC-45): `{ metric: z.enum(['recall','precision','citation_accuracy']), direction: z.enum(['up','down']), magnitude: z.number(), agent_version: nullable, case_transitions: z.array(z.object({ case_id, name, from: z.boolean(), to: z.boolean() })) }`. **Structured, not a sentence** — the client renders it from `messages/en/eval.json`, which keeps it non-model-authored (N1) and i18n-able, and makes "no causal clause when `case_transitions` is empty" a rendering invariant rather than a string-building one. |
| `EvalAgentSummary` | **new** (AC-40): `{ agent_id, agent_name, cases_total: int, latest: EvalRunRecord.nullable(), trend: z.array(EvalTrendPoint) }`. |
| `EvalDashboard` (`:66-88`) | **reshaped** to workspace-level: `{ agents: z.array(EvalAgentSummary), recent_runs: z.array(EvalRunRecord) }`. `alert` is dropped in favour of `EvalCallout` on the per-agent detail. |
| `EvalAgentDetail` | **new** (AC-44/AC-45/AC-48): `{ agent_id, agent_name, cases_total, runs: z.array(EvalRunRecord), current: EvalRun.nullable(), delta: z.object({ recall, precision, citation_accuracy }).nullable(), trend: z.array(EvalTrendPoint), callout: EvalCallout.nullable() }`. `delta`/`callout` are `null` when fewer than two completed runs exist — that is AC-48's "no deltas, no comparison affordance" expressed in the contract. |
| `EvalCompare` | **new** (AC-32/33/34): `{ old: EvalRunRecord, new: EvalRunRecord, common_case_ids: string[], only_in_old: string[], only_in_new: string[], deltas: { recall: nullable, precision: nullable, citation_accuracy: nullable }, prompt_diff: z.array(z.object({ kind: z.enum(['added','removed','context']), text: z.string() })) }`. |

#### 2. Schema + two migrations (finding 4)

`server/src/db/schema/eval.ts`. Confirm `select count(*) from eval_cases;` and
`from eval_runs;` both return `0` **before** generating.

**`eval_cases` — additive + tightening only (one pass, no rename ambiguity):**

- keep the reserved column name `expected_output`, typed
  `jsonb('expected_output').$type<EvalExpectation>().notNull()`. **Deliberate:**
  renaming it to `expectation` would be a drop+add on a table that also gains
  columns, i.e. exactly finding 4's hang. The DTO field is `expectation`; a doc
  comment on the column records the mapping.
- `inputDiff` / `inputFiles` / `inputMeta` → `.notNull()` (G2: a case with no
  frozen input is not a case).
- add `sourceFindingId: uuid('source_finding_id')` — **no FK**: D8 says a case
  outlives its finding, review, PR and repo.
- add `createdAt` / `updatedAt` (`timestamp(..., { withTimezone: true })`,
  `defaultNow().notNull()`).
- add `uniqueIndex('eval_cases_source_finding_uq').on(sourceFindingId)` — this
  is D17/AC-1's idempotency enforced in the database (Postgres allows many
  NULLs in a unique index, so hand-authored cases are unaffected).
- add `index('eval_cases_owner_idx').on(workspaceId, ownerKind, ownerId)`.

**`eval_runs` — pass 1 adds, pass 2 drops:**

*Pass 1 (add only):* `workspaceId` (uuid, NOT NULL, FK → `workspaces` cascade —
AC-54 becomes a column, not a join), `ownerKind` (text enum `['skill','agent']`,
NOT NULL), `ownerId` (uuid, NOT NULL), `status` (text enum
`['running','completed','errored']`, NOT NULL, default `'running'`),
`agentVersion` (integer, nullable — D4), `caseIds`
(`jsonb().$type<string[]>().notNull().default(sql\`'[]'::jsonb\`)` — D5),
`perCase` (`jsonb().$type<EvalCaseOutcome[]>().notNull().default('[]')` — Q1),
`casesErrored` (integer NOT NULL default 0), `tracesPassed` / `tracesTotal`
(integer, nullable), `finishedAt` (timestamptz, nullable), `errorReason` (text,
nullable). Plus
`index('eval_runs_owner_idx').on(workspaceId, ownerKind, ownerId, desc(ranAt))`.

*Pass 2 (drop only):* `caseId`, `actualOutput`, `pass`.

`ranAt` (`:27`) is reused as the run's start time; `durationMs`, `costUsd`,
`recall`, `precision`, `citationAccuracy` are reused as-is (already nullable —
AC-20 lands for free).

Both passes: `pnpm db:generate < /dev/null`, then `pnpm db:migrate`. Two new
files under `server/src/db/migrations/`; never edit an existing one.

#### 3. `modules/eval/` — files and responsibilities

New folder, one import + one entry in `src/modules/index.ts`.

| File | Contents |
|---|---|
| `constants.ts` | `EVAL_TASK_LINE` (the eval analogue of `ADHOC_TASK_LINE`, `adhoc.ts:16-22` — "review the diff fragment below", no PR framing), `STALE_RUN_TIMEOUT_MS = 15 * 60_000` (D19), `RUN_RATE_LIMIT = { max: 5, timeWindow: '1 minute' }` (AC-27 + finding 11's comment), `MAX_FROZEN_DIFF_BYTES` (the spec's "very large frozen diff" edge case — refuse at creation with a stated reason rather than taxing every future run). Each value carries its rationale in a comment. |
| `ports.ts` | `AgentRecord`, `AgentLookup`, `SkillLookup`, `LlmResolver` — copied in shape from `adhoc.ts:24-58`, satisfied structurally by `container.agentsRepo` / `container.llm`, wired in `routes.ts`. **No import from any other module.** |
| `repository.ts` | The **only** file importing `src/db/**` (finding 5). Owns `eval_cases` / `eval_runs` CRUD, plus the read-only lookups case creation needs: `findingForCase(workspaceId, findingId)` (joins `findings` → `reviews` → `pull_requests`, returning file/lines/severity/category/title/accepted_at/dismissed_at/agent_id/pr_id/pr number/title/body, **workspace-scoped in the WHERE clause** — AC-54), `filePatch(prId, path)` (one `pr_files` row), `agentVersionPrompt(agentId, version)` (`agent_versions.config_json ->> 'system_prompt'` — AC-34), `agentsWithCases(workspaceId)`, `staleRunningRuns(workspaceId, cutoff)`, `deleteForOwner(workspaceId, ownerKind, ownerId)` (D18). |
| `frozen-input.ts` | Pure. `synthesizeFrozenDiff(path, patch)` (finding 8) and `assertExpectationGrounded(frozenDiff, expectation)` (finding 7 — builds the synthetic `kind: 'finding'` Finding and calls `groundFindings`). Both used at creation and at edit (AC-13 re-validates a changed expectation the same way). |
| `scoring.ts` | Pure, zero I/O, zero LLM (AC-16). `matches(finding, expectation)` = same file **and** `[start,end]` intersects; `scoreCase(expectation, keptFindings, grounding)` → `EvalCaseOutcome` (AC-17); `scoreRun(outcomes)` → `EvalRun` metrics (AC-18–AC-22, with `null` for every zero denominator per AC-20). Precision is **the spec's literal formula** — `1 − FP/total`, where FP = findings on `must_not_flag` cases matching that case's expectation and `total` = all **kept** findings across the run (AC-19, AC-22; resolved clarification 8 — do **not** "fix" it to `TP/(TP+FP)`). Errored cases contribute to neither numerator nor denominator anywhere (AC-11). |
| `executor.ts` | Q2. `EvalExecutor.runCase(agent, skillBlocks, llm, evalCase)` → `{ findings, groundingKept, groundingTotal, tokensIn, tokensOut, costUsd, durationMs, assembly }`, or throws. See §4. |
| `prompt-diff.ts` | Pure, dependency-free LCS line diff → `{ kind, text }[]` (AC-34). No new package. |
| `callout.ts` | Pure. `buildCallout(latest, previous)` → `EvalCallout | null` (D12/AC-45): the largest absolute metric delta, plus the `must_not_flag`/`must_find` cases whose pass state flipped between the two runs — and an **empty** `case_transitions` when none did. |
| `service.ts` | Application service. No `Container` import. Owns case creation/edit/delete, run lifecycle, dashboard/detail/compare assembly, stale-run reconciliation. |
| `routes.ts` | The composition point: `getContext` first, zod `params`/`body`, per-route rate limits on the two run-start routes. |

#### 4. The executor (AC-8, AC-9, AC-10)

Modelled line-for-line on `adhoc.ts:138-200`, with a **narrower** input set:

```
reviewPullRequest({
  systemPrompt: agent.systemPrompt,
  model: agent.model,
  diff: parseUnifiedDiff(evalCase.inputDiff),
  llm,
  strategy: agent.strategy ?? REVIEW_STRATEGY,
  ...(skillBlocks.length > 0 ? { skills: skillBlocks } : {}),
  ...(meta.body ? { prDescription: meta.body } : {}),
  task: EVAL_TASK_LINE + the frozen PR title,
})
```

**Deliberately absent, and each one is an AC-9 assertion:** `specs` (no
project-context resolution — the eval path never calls
`projectContextService`), `callers`, `repoMap`, `intent`, `intentInScope`,
`intentOutOfScope`, `memory`, `sessionId`. Nothing in this module touches
`container.repoIntel`, a checkout, or the `pull_requests` intent columns.

`prDescription` and the task-line title come from the case's **frozen**
`input_meta` (D16), not a live PR — that is what keeps AC-10 byte-identical
across runs. `ReviewOutcome.assembly` is the artifact AC-10's test compares.

Skill bodies come from `SkillLookup.enabledSkills(agent.id)` rendered through
`renderSkillBlock` (`_shared/skill-render.ts`) — the same one renderer
`adhoc.ts:8` and `run-executor.ts` use; never re-implemented here.

Grounding numbers per case: `kept = outcome.review.findings.length`,
`total = kept + outcome.dropped.length` (finding 6).

#### 5. Case creation, edit and delete (AC-1 … AC-7, AC-12 … AC-14)

`POST /findings/:id/eval-case`:

1. `getContext` → `repository.findingForCase(workspaceId, findingId)`; missing
   or other-workspace → 404 **before any `eval_cases` row is read** (AC-54).
2. Neither `accepted_at` nor `dismissed_at` → 422 with a stated reason (AC-2's
   server half; the client hides the action too).
3. Existing case with this `source_finding_id` → **return it, 200** (D17/AC-1).
4. Expectation type from the timestamps: accepted → `must_find`, dismissed →
   `must_not_flag` (AC-3/AC-4). If both are set, the **later** timestamp wins;
   record that tie-break in a comment. The type is frozen from here on (AC-7) —
   nothing re-reads the finding afterwards.
5. Frozen input (D8/D16): the finding's file only. `repository.filePatch` →
   `synthesizeFrozenDiff` (finding 8). A null/empty patch → 422 naming the
   reason (this is the PR #482 case, Q4). Over `MAX_FROZEN_DIFF_BYTES` → 422.
   `input_files = [file]`; `input_meta = { pr_number, title, body }`.
6. `assertExpectationGrounded` → refuse with the stated reason if it fails
   (AC-6, finding 7).
7. Insert. Name defaults to a slug of the finding title; `notes` null.

`PATCH /eval/cases/:id` re-runs steps 5–6's validation on whatever changed
(AC-12, AC-13) and never touches stored runs (AC-14 — no recomputation
anywhere; past runs keep their `per_case` array verbatim). `DELETE` removes the
case row only; `eval_runs` rows are **not** cascaded from it (that FK is gone in
pass 2, which is precisely what makes AC-14 hold).

#### 6. Run lifecycle (AC-8, AC-11, AC-15, AC-23 … AC-28, AC-49)

`EvalService.startRun(workspaceId, agentId)`:

1. Resolve the agent workspace-scoped → 404 (AC-54).
2. **Reconcile stale runs first** (D19): every `running` row for this owner
   older than `STALE_RUN_TIMEOUT_MS` → `status = 'errored'`,
   `error_reason = 'interrupted'`. Then the AC-15 guard.
3. Guard: any remaining `running` row for this owner → refuse with the in-flight
   state; **no second row is created**, nothing is queued (AC-15).
4. Cases empty → refuse, no run row (AC-49).
5. Resolve the LLM **now**, translating `ConfigError` → 422 with a stated reason
   (AC-49, finding 9). Still no run row on failure.
6. Insert the run row: `status='running'`, `case_ids` = the exact set (D5),
   `agent_version` = the agent's current `version` (D4), `ran_at = now()`.
   Return `{ run_id, status, estimate }` immediately (AC-24).
7. **Fire-and-forget** the execution (`reviews/service.ts:171` precedent):
   sequentially per case → `executor.runCase` → `scoring.scoreCase`. A per-case
   throw becomes `status:'errored'` on that outcome with its reason, and the run
   continues (AC-11).
8. On completion: `scoring.scoreRun` → persist metrics, `per_case`,
   `cases_errored`, `traces_passed/total`, `duration_ms`, summed `cost_usd`,
   `finished_at`, `status='completed'` (AC-23, AC-26). A crash of the whole loop
   → `status='errored'` + `error_reason`; the run is never left `running`.
9. One structured log line per run: case ids, counts, metrics, model, tokens,
   cost. **Never diff content, expectation content or finding prose** (the
   spec's "Privacy of logs").

`POST /eval/runs/all` (AC-25/AC-42) takes `{ confirm: z.literal(true) }` in its
body — the confirmation is a contract requirement, not a client convention —
and returns per-agent `run_id` **or** `refused_reason`, never one combined
result.

Every read route (`GET` dashboard, detail, cases, runs, compare) renders from
stored rows and makes **zero** provider calls (AC-28). Nothing on any read path
constructs an LLM provider.

Boot-time reconcile (D19's second half): one best-effort
`evalService.reconcileStaleRuns()` call from `server/src/server.ts` after the
app is built, wrapped in `try/catch` so a DB hiccup never blocks boot.

#### 7. Routes, container, agents cascade, seed, `verify:l06`

**Routes** (`modules/eval/routes.ts`, zod params via `IdParams` from
`_shared/schemas.ts`, `getContext` first on every one):

```
POST   /findings/:id/eval-case      → EvalCase            (AC-1 … AC-7)
GET    /agents/:id/eval/cases       → EvalCase[]          (AC-37, AC-46)
GET    /eval/cases/:id              → EvalCase            (AC-39)
PATCH  /eval/cases/:id              → EvalCase            (AC-12, AC-13)
DELETE /eval/cases/:id              → 204                 (AC-12, AC-14)
GET    /agents/:id/eval/estimate    → EvalRunEstimate     (AC-24)
POST   /agents/:id/eval/runs        → EvalRunResult       (AC-15, AC-49)  [rate-limited]
GET    /agents/:id/eval/runs        → EvalRunRecord[]     (AC-37, AC-44)
GET    /eval/runs/:id               → EvalRunRecord       (the poll target — Q3)
GET    /eval/compare                → EvalCompare         (AC-32 … AC-34)  querystring: a, b
GET    /eval/dashboard              → EvalDashboard       (AC-40, AC-41, AC-43)
GET    /eval/agents/:id             → EvalAgentDetail     (AC-44, AC-45, AC-48)
POST   /eval/runs/all               → EvalRunAllResult    (AC-25, AC-42)   [rate-limited]
```

`GET /eval/compare` validates "exactly two" by requiring both `a` and `b` as
uuids and rejecting `a === b` (AC-32).

**Container** (`platform/container.ts`, copying `briefRepo`/`briefService`'s
shape at `:206-229`): `get evalRepo(): EvalRepository` and
`get evalService(): EvalService`, the latter constructed with the repo, the
agents-repo-backed lookups, `(id) => this.llm(id)`, the price/cost estimator and
`console` as the logger.

**D18 cascade.** `AgentsService` (`modules/agents/service.ts:56`) gains an
**optional third constructor port**
`evalCleanup?: { deleteForOwner(workspaceId, ownerKind, ownerId): Promise<void> }`,
awaited inside `delete()` (`:69-71`) **before** `repo.deleteById`. Wired at
`modules/agents/routes.ts:86` from `app.container.evalRepo`. Optional so the
existing two-argument constructions in tests keep compiling
(`server/LEARNINGS.md:681-716`). No cross-module import — the port is declared
in `agents/service.ts` and satisfied structurally.

**Seed** (`server/src/db/seed.ts`, D22 + Q4):

- A fixture PR on the existing `acme/payments-api` repo (recommended: #491,
  "Fix session token handling in the auth middleware") with **real** `patch`
  text on its `pr_files` rows — two or three small files, at least one carrying
  an obvious defect a Security Reviewer will flag and one clean file worth a
  `must_not_flag`. Guarded by the same `if (!existing)` idempotency every other
  seed block uses.
- **Seven** `eval_cases` for the `Security Reviewer` agent, each with its own
  synthesized frozen diff, `input_files`, `input_meta` and `expectation`, with
  **both** expectation types represented (D22). `source_finding_id` null — these
  are fixtures, not derived from a triaged finding, which is also what leaves
  the live 8th case free to be created on camera.
- Every seeded case must satisfy `assertExpectationGrounded` — assert this in
  the `verify:l06` suite so a hand-edited fixture can't silently rot.
- **No `eval_runs` are seeded.** Consistent with `seed.ts:255-259`'s stated
  posture ("No run history is fabricated here") and with AC-47's empty state.

**`verify:l06`** (`server/package.json`, beside `verify:l03` at `:12` — D21):

```
"verify:l06": "vitest run src/modules/eval/scoring.test.ts src/modules/eval/frozen-input.test.ts test/eval-contract-parity.test.ts test/contracts.test.ts test/eval.it.test.ts"
```

- `test/eval-contract-parity.test.ts` is AC-50's mechanical check: read both
  `contracts/eval-ci.ts` copies and both `contracts/knowledge.ts` copies from
  disk and assert the eval regions are byte-identical, allowing **only** the
  three pre-existing drift blocks named in §1. It fails loudly if this feature
  adds a fourth.
- `test/eval.it.test.ts` is the DB-backed half (migrations apply, routes
  respond, workspace scoping refuses) and **self-skips without Docker**, which
  is D21's stated allowance.
- `test/contracts.test.ts` is included because its `EvalRun` fixture
  (`:141-152`) must be updated by this pass (finding 1).

### Phase B — client

#### 8. Hooks and the Evals tab (AC-36 … AC-39, AC-46 … AC-48)

- `client/src/lib/hooks/eval.ts` (+ one line in `hooks/index.ts`): `useEvalCases`,
  `useEvalCase`, `useCreateEvalCaseFromFinding`, `useUpdateEvalCase`,
  `useDeleteEvalCase`, `useEvalRuns`, `useEvalRun(runId)`, `useStartEvalRun`,
  `useRunAllEvals`, `useEvalDashboard`, `useEvalAgentDetail`, `useEvalCompare`.
  `useEvalRun`'s `refetchInterval` returns a poll interval **only** while
  `data.status === 'running'` and `false` otherwise (Q3) — copy
  `hooks/onboarding.ts`; `cancelQueries` in `onMutate` before any
  `setQueryData` (`client/LEARNINGS.md:401-423`). No `fetch` in a component.
- `AgentEditor/constants.ts` — add
  `{ key: "evals", labelKey: "editor.tabs.evals", icon: "ListChecks" }` to
  `TABS` and drop the "later lessons add Evals" half of the comment. The i18n
  key already exists (`agents.json:50`). `AgentEditor.tsx:24-31` gains one
  branch; the existing tabs are untouched (AC-36).
- `AgentEditor/_components/EvalsTab/` — `EvalsTab.tsx`, `MetricTiles.tsx`
  (recall / precision / citation accuracy / cases-passed — D13's fourth tile is
  a **count**, not a ratio), `CaseList.tsx` + `CaseRow.tsx` (AC-38: name,
  expectation type, severity + category tags, expected vs actual counts,
  pass/fail, run/edit/delete), `CaseEditorPanel.tsx` (AC-39: name, frozen input
  split into diff / files / PR metadata, editable expectation, latest outcome),
  `RunHistory.tsx` (the two-run selection AC-32 needs), `constants.ts`,
  `styles.ts`, `index.ts`, `EvalsTab.test.tsx`.
- **Recommendation:** the case editor is a **panel inside the Evals tab**, not a
  route. AC-39 says "WHEN a user opens a case", never "navigates to"; a panel is
  materially less work than two more route trees, and the reserved
  `eval.page.crumbEvalCase` breadcrumb key can stay unused (it costs nothing).
  Overturn this if you want the breadcrumb trail from the mockups.
- Empty states are explicit, never zeros: no cases → AC-46's message + how to
  create one, no metric values at all; cases but no run → AC-47; exactly one run
  → AC-48 (metrics, no deltas, no compare affordance, and a statement that a
  second run is needed). The contract makes these branchable
  (`latest === null`, `delta === null`).

#### 9. Dashboard routes (AC-40 … AC-45)

- `client/src/app/eval/page.tsx` — thin, `skills/page.tsx`'s template
  (workspace-scoped, **not** repo-scoped). `_components/EvalDashboardView/`:
  per-agent rows with latest metrics + trend (AC-40), the combined recent-runs
  table across agents (AC-41), the "each agent's metrics are computed over its
  own case set" statement, rendered as visible copy and not a tooltip (AC-43),
  and the run-all action with its confirmation dialog stating the total
  execution count (AC-25) and per-agent progress/failure (AC-42).
- `client/src/app/eval/agents/[agentId]/page.tsx` +
  `_components/EvalAgentDetailView/`: metric tiles with deltas (AC-44), the
  three-metric trend, the run-history table with two-run selection, the compare
  modal (metric deltas old→new, the case-set difference when
  `only_in_old`/`only_in_new` are non-empty — AC-33, and the `prompt_diff` lines
  rendered as `<pre>` text with added/removed distinguished by a prefix glyph
  **and** colour — AC-34 + AC-55), and the callout rendered from `EvalCallout`
  with the causal clause emitted **only** when `case_transitions` is non-empty
  (AC-45).
- `nav.ts` — add
  `{ key: "eval", label: "Eval Dashboard", icon: "BarChart3", href: "/eval", gKey: "e" }`
  to the `SKILLS LAB` group (its `:47-48` comment reserves the slot) and a
  matching `SHORTCUTS` entry (`g e` — free; taken today are p, x, t, s, a, c,
  `,`). This is finding 2's silent-failure wiring. `helpers.ts:46` and
  `shell.json:24` already exist; verify, don't duplicate.

#### 10. Finding action, i18n, rendering, accessibility

- `FindingCard` (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:107-126`)
  — a third action beside Accept/Dismiss, rendered **only** when
  `accepted || dismissed` (AC-2), threaded through the same `onAction` prop
  chain the two existing actions use rather than a new bespoke callback. On
  success show the toast; on the idempotent path (AC-1) the copy must say the
  case already exists, not that a new one was created.
- `messages/en/eval.json` — reuse the reserved keys (`dashboard.*`,
  `caseEditor.*`, `evalsTab.*`, `page.*`) and **add** what they don't cover:
  `expectation.mustFind` / `expectation.mustNotFlag`, `notApplicable` (AC-20's
  "n/a" — never render `0`), `compare.*`, `callout.*` (one message with and one
  without the causal clause), `empty.noCases` / `empty.neverRun` /
  `empty.oneRun` (AC-46/47/48), `run.confirmAll`, `run.refused.*`,
  `status.running` / `status.completed` / `status.errored`, `cost.*`. Add the
  `finding.turnIntoEvalCase` string under the existing `prReview` namespace,
  where the accept/dismiss labels already live.
- **AC-52** — case names, notes, expectation contents, finding titles,
  rationales and prompt-diff lines all render as plain JSX text nodes (React
  escapes them). No `dangerouslySetInnerHTML`, no new `Markdown` plugin,
  no `urlTransform` change (`client/LEARNINGS.md:244-263`).
- **AC-55** — pass/fail, deltas and diff lines carry a text or glyph marker in
  addition to colour; the trend chart is accompanied by a
  visually-hidden-but-readable table of the same values.
- **AC-56** — every action is a real `<button>`/`<a>`; the run-status region is
  `role="status" aria-live="polite"` bound to the polled `status` (Q3), and the
  two-run selection is checkbox-based so it is keyboard-operable by default.

### Explicitly not built

Skill-owned cases (N3), any LLM-based grading or model-authored sentence (N1),
synthetic case authoring as a primary flow (N2), verdict/summary/score in
scoring (N4), any automatic run — on review completion, prompt save, page open,
schedule or CI (N5), a cross-agent ranking (N6), any change to reviews,
findings, accept/dismiss, grounding or agent versioning behaviour (N7), a metric
gate (N8), an MCP tool (N9), an e2e flow (N10), case-set export/import (N11),
the promote action (N12 — AC-35 stays deferred and unnumbered-over), and eval
cost in the product's existing cost/observability surfaces (N13). Also **not**
built: any edit to `reviewer-core`, to `run-executor.ts`, to `groundFindings`,
to `INJECTION_GUARD`, or to anything under `evals/`.

## Skills for implementer

Derived from `.claude/skills/pr-self-review/SKILL.md` Phase 3 (the routing table
at `:128-137`) and the catalog in `.claude/skills/README.md:9-24`. Load the row
matching the files you are currently editing, not all at once; respect each
skill's declared scope. Phase 3's "cap at 4" is a *review-pass* budget, not an
implementation one.

| Path glob in this plan | Skills to load | Why |
|---|---|---|
| `server/src/modules/eval/**`, `server/src/modules/agents/{service,routes}.ts`, `server/src/platform/container.ts`, `server/src/modules/index.ts`, `server/src/server.ts` | `onion-architecture`, `fastify-best-practices` | Phase 3 row for `server/src/modules/**`, `platform/**`. The ring rules and the local-port/DI pattern are the difference between this module passing `pnpm arch` with zero new baseline entries and eating one (finding 5). `fastify-best-practices` for the schema-first zod bodies and the per-route `config.rateLimit`. |
| `server/src/db/schema/eval.ts`, `server/src/db/migrations/**`, `server/src/db/seed.ts` | `drizzle-orm-patterns`, `postgresql-table-design` | Phase 3 row for `server/src/db/**`. Two-pass migration (finding 4), a partial-unique index for D17's idempotency, jsonb `$type<>()` columns, and `NOT NULL` without a default on a table confirmed at zero rows. |
| `server/src/vendor/shared/contracts/{knowledge,eval-ci}.ts`, `client/src/vendor/shared/contracts/{knowledge,eval-ci}.ts`, `eval/routes.ts` schemas | `zod` | Phase 3 row for `**/contracts/**` and zod schemas. Also the `.nullable()`-makes-it-required trap (`server/LEARNINGS.md:442-456`) — deliberate for the three metrics (AC-20), wrong for the optional expectation tags. |
| `server/src/modules/eval/{executor,frozen-input,service}.ts`, `server/src/db/seed.ts` | `security` | Phase 3's "any `.ts`/`.tsx`" row, and the sharpest need here: a stored case's diff, file paths and PR metadata are attacker-influenceable and are **replayed to the model on every run, indefinitely** (AC-51 + the spec's amplification note). Also AC-53 (a stored expectation is data, never a program) and AC-54 (workspace scoping resolved before any row is read). |
| `client/src/app/eval/**`, `client/src/app/agents/[id]/_components/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/**` | `frontend-ui-architecture`, `next-best-practices`, `react-best-practices` | Phase 3 row for `client/src/app/**`. Colocated `_components/<Name>/` folders, thin route files, the `"use client"` boundary, and the polling-hook/state-ownership questions in §8–§9. |
| `client/src/lib/hooks/eval.ts`, `client/src/vendor/ui/nav.ts` | `frontend-ui-architecture`, `react-best-practices` | Phase 3 row for `client/src/lib/**` and `client/src/components/**`. The conditional-`refetchInterval` + `cancelQueries` pattern, and the four-wirings rule for `nav.ts` (finding 2). |
| `client/**/*.test.tsx` | `react-testing-library` | Phase 3 row. |

**Routing gaps:** none for the paths this plan touches. (`plans/09` and `plans/10`
both flagged a missing `mcp-server/**` row; this plan touches no `mcp-server`
file — N9 — so the gap does not bite here. It is still worth adding.) One
observation rather than a gap: Phase 3 has no row for
`server/src/db/seed.ts` specifically; it falls under `server/src/db/**`, which
routes correctly.

Root `CLAUDE.md` §"Before you finish": append an `engineering-insights` entry to
each touched module's `LEARNINGS.md` — at minimum `server/LEARNINGS.md` (the
reshape-in-place outcome for the *second* reserved surface in a row, whether the
two-pass migration rule held for a two-table pass, and the frozen-diff
synthesis of finding 8) and `client/LEARNINGS.md` (that a reserved i18n
namespace + active-key + tab label existed with only the `nav.ts` entry missing —
a fresh instance of the `:362-386` four-wirings entry, worth extending rather
than duplicating).

## Verification

Scoped commands, per phase. `pr-self-review` re-runs the full suites before push
regardless, so nothing below is a blanket run.

### Phase A — server (must be green before Phase B starts)

```
cd server && select count(*) from eval_cases;   # must be 0 — see below
cd server && pnpm db:generate < /dev/null       # pass 1 (adds only)
cd server && pnpm db:generate < /dev/null       # pass 2 (drops only)
cd server && pnpm db:migrate
cd server && pnpm typecheck
cd server && pnpm exec vitest run \
  src/modules/eval/scoring.test.ts \
  src/modules/eval/frozen-input.test.ts \
  src/modules/eval/prompt-diff.test.ts \
  src/modules/eval/callout.test.ts \
  src/modules/eval/executor.test.ts \
  src/modules/eval/service.test.ts \
  test/eval.it.test.ts \
  test/eval-contract-parity.test.ts \
  test/contracts.test.ts \
  test/agents-versions.it.test.ts
cd server && pnpm verify:l06
cd server && pnpm arch
cd server && pnpm db:seed
```

- `select count(*)` on **both** `eval_cases` and `eval_runs` must return `0`
  before generating; otherwise the `NOT NULL`-without-default columns need
  defaults (`server/LEARNINGS.md:38-54`).
- If `pnpm db:generate` hangs, you merged the two passes — kill it, split them
  (`server/LEARNINGS.md:64-82`).
- `test/agents-versions.it.test.ts` is in scope because `AgentsService`'s
  constructor and `delete()` change (D18); it is the regression check that the
  optional port broke nothing.
- **Pass:** all green; `pnpm arch` reports **zero new** violations. A failure
  means a cross-module import slipped in — replace it with a local port, do
  **not** run `pnpm arch:baseline` (`server/LEARNINGS.md:665-680`).
- After `db:seed`: `select count(*) from eval_cases;` is `7`, all owned by the
  `Security Reviewer` agent, with both expectation types present (D22).

### Phase B — client

```
cd client && pnpm typecheck
cd client && pnpm exec vitest run \
  "src/app/eval/**" \
  "src/app/agents/[id]/_components/**" \
  "src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/**" \
  "src/lib/hooks/**"
cd client && pnpm build
```

- The `FindingCard` and `AgentEditor` globs are **both** required: each is an
  existing component with existing tests, and those tests are the regression
  check that the new tab and the new action changed nothing else.
- The build step is **not optional** — typecheck + vitest do not prove the pages
  render, and this adds new `@devdigest/shared` consumers, the exact trap in
  `client/LEARNINGS.md:316-361`.
- **Pass:** `/eval` is reachable from the sidebar (not just by typing the URL —
  finding 2), the Evals tab renders inside the agent editor beside Config /
  Skills / Context, and a seeded case list renders with no metric values and the
  AC-47 "never run" message.

### Cross-cutting

```
diff <(sed -n '/---- Eval ----/,/---- Memory ----/p' server/src/vendor/shared/contracts/knowledge.ts) \
     <(sed -n '/---- Eval ----/,/---- Memory ----/p' client/src/vendor/shared/contracts/knowledge.ts)
diff server/src/vendor/shared/contracts/eval-ci.ts client/src/vendor/shared/contracts/eval-ci.ts
git status --porcelain server/src/db/migrations
git diff reviewer-core/ mcp-server/ e2e/ evals/
```

- The `knowledge.ts` eval-region diff must be **empty**. The `eval-ci.ts` diff
  must show **only** the three pre-existing drift hunks (the `EvalRun` import
  line, the `AgentManifest` block, `ConformanceInput.provider`) — one new hunk
  is an AC-50 failure and a HIGH finding in `pr-self-review` Phase 4.
- Exactly **two** new migration files, no edit to an existing one
  (`server/CLAUDE.md:31-32`).
- `git diff reviewer-core/ mcp-server/ e2e/ evals/` must be **empty** — D6, N9,
  N10, and the spec's disambiguation block.

### Test matrix the scoped files must cover

| Test scenario | ACs |
|---|---|
| Activating the action on an accepted finding creates exactly one case; activating it again yields the same case id, not a second row | AC-1, D17 |
| A finding with neither timestamp is refused server-side; the client action is absent | AC-2 |
| Accepted → `must_find` with the finding's file and line range; dismissed → `must_not_flag` likewise | AC-3, AC-4 |
| A case still runs unchanged after its source finding, review, PR and repo rows are deleted | AC-5, D8 |
| An expectation whose lines fall outside every hunk of the frozen diff is refused with a stated reason and creates no case | AC-6 |
| A `pr_files.patch` of `null` (the PR #482 shape) is refused with a stated reason | AC-6, Q4 |
| A synthesized frozen diff round-trips through `parseUnifiedDiff` to exactly one file with the expected path | finding 8 |
| Dismissing a previously accepted source finding leaves its case's expectation `must_find` | AC-7 |
| A run executes one review execution per case using the frozen diff as the diff | AC-8 |
| The assembled eval prompt contains no repo map, callers digest, project-context document, live PR description or intent — asserted against a case whose repo has since gained a repo map | AC-9 |
| Assembling the input for one case twice with no config change is byte-identical (`ReviewOutcome.assembly`) | AC-10 |
| A run where one of several cases throws completes, marks that case errored with a reason, excludes it from every numerator and denominator, and records `cases_errored: 1` | AC-11 |
| Name, notes, frozen input and expectation are editable; a case is deletable | AC-12 |
| An expectation with an unknown type or a non-integer line is rejected, the failing field is named, and the stored case is unchanged | AC-13, AC-53 |
| Editing or deleting a case leaves stored runs and their `per_case` arrays byte-identical; no past metric is recomputed | AC-14 |
| Two rapid run actions on one agent produce exactly one run; the second observes the in-flight state (use `server/LEARNINGS.md:84-109`'s recipe, **not** `Promise.all`) | AC-15 |
| Scoring a run from stored execution outputs against a stubbed provider makes zero provider calls | AC-16 |
| `must_find` passes on ≥1 matching finding; `must_not_flag` passes on zero matching findings | AC-17 |
| Recall = matched `must_find` / covered `must_find` | AC-18 |
| One `must_not_flag` case, four findings, one overlapping the forbidden range → precision `0.75` | AC-19 |
| A run over only `must_not_flag` cases reports recall as **not applicable**, not `0`; likewise precision and citation accuracy with no findings | AC-20 |
| Four findings produced, three kept by grounding → citation accuracy `0.75`, read from `outcome.dropped`, not the summary string | AC-21, finding 6 |
| A grounding-dropped finding is counted as a citation failure and **never** as a false positive or in precision's denominator | AC-22 |
| A completed run stores metrics, per-case outcomes, agent version, covered case ids, duration, errored count and cost | AC-23, D4, D5 |
| The estimate states case count and agent count before any execution starts | AC-24 |
| Run-all without `confirm: true` starts nothing and states the total execution count | AC-25 |
| A completed run displays total cost and duration alongside metrics | AC-26 |
| Repeated run triggers hit the rate limit rather than starting unbounded executions | AC-27 |
| Repeated loads of every eval surface against a stubbed provider produce zero provider calls | AC-28 |
| A seeded agent with 8 cases (7 fixture + 1 created) runs and scores as one suite run, with both expectation types present | AC-29, D22 |
| Two runs over the same case set with a changed prompt are attributed to distinct `agent_version`s and their metric difference is presented | AC-30 |
| Adding a prompt instruction that provokes a finding on a known must-not-flag range lowers the later run's precision over the same set | AC-31 |
| Compare rejects a request that is not exactly two distinct runs of one agent | AC-32 |
| Comparing a run taken before a case was added with one taken after states the case-set difference, names it, and computes deltas over the intersection | AC-33, D20 |
| Compare returns line-oriented prompt-diff entries distinguishing added from removed | AC-34 |
| Evals tab renders alongside the existing tabs without altering their behaviour | AC-36 |
| Evals tab shows four tiles, the case list and the run history | AC-37, D13 |
| A case row shows name, expectation type, severity/category tags, expected vs actual counts, pass/fail and its three actions | AC-38 |
| Opening a case shows name, frozen diff / files / PR metadata separately, the editable expectation, and its latest outcome | AC-39 |
| The dashboard lists every agent with latest metrics and a trend, reachable from the sidebar, not repo-scoped | AC-40, finding 2 |
| The dashboard renders a combined recent-runs table naming each row's agent, time, metrics and cost | AC-41 |
| Run-all reports per-agent progress and per-agent failure, not one combined result | AC-42 |
| The dashboard states that metrics are per-agent case sets and presents no ranking | AC-43 |
| An agent detail shows deltas against the previous run, a three-metric trend and a run table supporting two-run selection | AC-44 |
| A metric move with **no** case pass/fail transition yields a statement naming metric, direction, magnitude and version, with **no** causal clause; with transitions, the cases are named | AC-45, D12 |
| An agent with no cases: every surface states it and shows no metric values | AC-46 |
| Cases but no completed run: "never run", no metrics, no trend | AC-47 |
| Exactly one completed run: metrics without deltas, no comparison affordance, and a statement that a second run is needed | AC-48 |
| A run refused for no cases / no provider key / already in flight names which applies and creates no run record (`ConfigError` surfaces as a 422, not a 500) | AC-49, finding 9 |
| A mechanical comparison of the two `vendor/shared` copies reports no new divergence in the touched files | AC-50 |
| A frozen diff containing instruction-shaped text reaches the model as delimiter-wrapped data under the shared guard, with no per-feature keyword scanning added | AC-51 |
| A case whose name contains a `<script>` tag renders it as visible text | AC-52 |
| A request for another workspace's case, run, edit, delete or comparison is refused before any eval row is read | AC-54 |
| Pass/fail, deltas and diff lines are distinguishable without colour; the trend has a non-graphical equivalent | AC-55 |
| Create-a-case, run-a-set, select-two-runs, open-a-case and compare are keyboard-operable; a run-status change is announced via `aria-live` | AC-56 |
| `pnpm verify:l06` passes: migrations apply, both contract copies agree, the eval routes respond, and the scoring suite (AC-17 … AC-22, including AC-20's zero denominators) is green | AC-57 |
| A stale `running` run older than 15 minutes is marked errored on the next start request and on boot, and does not deadlock the agent | D19 |
| Deleting an agent deletes its cases and their runs; no orphan rows remain | D18 |
| The seeded fixture cases all satisfy `assertExpectationGrounded` | D22 |
| e2e flows 02/04/05 still pass against a freshly seeded DB after the seed change | Q4 |

`*.it.test.ts` for anything DB-backed (case/run persistence, workspace scoping,
the agent-delete cascade, migrations); everything else hermetic against a stubbed
provider and fixture rows (`server/CLAUDE.md:47-50`).

### Manual acceptance beyond an automated run

The AC-29/AC-30/AC-31 demonstration is a human step after this plan lands:
run the Security Reviewer against its 8-case set with a real provider key, read
the three numbers and the cost; edit the system prompt to provoke a finding on a
known `must_not_flag` range; re-run the same set; open the compare view and read
the precision drop plus the prompt diff. Do this on the **fixture PR**, not on
PR #482 (`patch: null`, Q4).
