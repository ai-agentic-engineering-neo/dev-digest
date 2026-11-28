# Implementation plan — improvement plan, steps 1–3

**Spec:** `docs/improvement-plan.md` (the 2026-11-27 audit). Each task names the
audit items it implements by ID (BE-1, RX-2, …). The audit row for an ID —
its evidence, `path:line` and fix — is part of the task's requirements; read
it. Line numbers are as of commit `4b95acc` and may have moved.

**Branch:** `feat/improvement-plan` in the worktree
`/Users/zhul/Neoversity/dev-digest/.claude/worktrees/improvement-plan`.

## Global Constraints

- Work only inside the worktree above. Never `cd` to
  `/Users/zhul/Neoversity/dev-digest` (the main checkout runs the user's dev
  servers with hot reload).
- **Never touch the dev database.** Do not run `pnpm db:migrate`, `db:seed` or
  `psql` against `localhost:5432`. Run the server unit lane only as
  `DATABASE_URL=postgres://nobody:nobody@127.0.0.1:1/none pnpm exec vitest run --exclude '**/*.it.test.ts'`
  (from `server/`) until Task 9 lands, and keep doing so afterwards.
  Integration tests (`pnpm exec vitest run .it.test`) start their own
  testcontainers Postgres and may be run.
- Follow the package's `AGENTS.md` and the skill it names for the area:
  `onion-architecture` (server, reviewer-core), `frontend-architecture` (client),
  `drizzle-orm-patterns` / `postgresql-table-design` (schema), `zod`,
  `react-best-practices`, `react-testing-library`, `next-best-practices`.
- Code you add to a `client/src` `.tsx` follows `frontend-architecture`: new
  constants in `constants.ts`, pure rules in `helpers.ts` with
  `helpers.test.ts`, styles in `styles.ts`, user-facing text in
  `messages/en/*.json`. Move an existing inline declaration only if your change
  edits it.
- Never edit an applied migration (`server/src/db/migrations/**`). Schema
  changes go in `server/src/db/schema/` followed by `pnpm db:generate`; a data
  fix-up may be added to the top of the newly generated SQL file only.
- Do not edit `server/src/modules/repo-intel/pipeline/**`.
- A contract change goes into both `server/src/vendor/shared` and
  `client/src/vendor/shared`, identically.
- `client/src/vendor/ui/**` may be changed only in the tasks that say so.
- PR content stays fenced with `wrapUntrusted`; no keyword denylists. The
  grounding gate and score recomputation are never bypassed.
- Tests are typological: one happy path plus the edge that matters. Mock LLM,
  GitHub and git. No real provider calls.
- No new npm dependency unless the task names it.
- Before reporting done, run for every package you changed: typecheck, its
  unit tests, and in `server/` also `pnpm deps:validate`.
- One commit per task (more are fine), conventional message
  (`fix(server): …`), ending with the line
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do not push, open PRs, or change GitHub settings.

## Rulings on the audit's open decisions

- DB-1: the stopgap only; no change under `pipeline/`.
- DB-3: cascade (no recorded reason for `SET NULL`; orphaned runs are
  unreachable anyway).
- XC-2: keep two contract copies; sync them and gate the diff in CI.
- BE-3: write the spec in `reviewer-core/specs/` first, inside the task.
- RX-3 / RX-4: the vendor `Modal`, `Drawer` and `FormField` changes are made
  deliberately in Tasks 32–33.
- XC-15 (Zod 4), XC-1 (GitHub settings), DB-6 trace retention, Step 4 sweeps:
  out of scope.

---

## Task 1: A failed background job must not crash the API (BE-1)

In `server/src/platform/jobs.ts`, make the promise returned as `done` never
reject: the failure is already recorded in the `jobs` row, so log it and
resolve. Keep a way for a caller that wants the outcome to learn it (for
example resolve with `{ ok: false, error }`), but none of the five existing
callers may be able to produce an unhandled rejection. Add a process-level
`unhandledRejection` handler in `server/src/server.ts` that logs through the
app logger and does not exit. Add `server/test/jobs.test.ts`: a handler that
throws leaves `done` resolved and records the failure, using a fake database
port or stub.

## Task 2: Cancel actually cancels; a review outcome is saved atomically (BE-2, DB-4)

- `ReviewService.cancelRun` must not clear the cancellation flag it just set
  (`platform/sse.ts` `complete()` deletes it). The flag is cleared when the run
  executor exits.
- The run executor checks cancellation again after the LLM returns and before
  persisting; a cancelled run persists no review and no findings and stays
  `cancelled`.
- `completeAgentRun` updates only rows still `status = 'running'`.
- Replace the separate `insertReview` / `insertFindings` / `completeAgentRun` /
  `saveRunTrace` writes on the success path with one repository method
  (`saveReviewOutcome`, named in `ports.ts`) that runs them in one
  `db.transaction`. `markReviewed` stays after the commit.
- Unit test with in-memory ports: cancel during a slow fake LLM leaves the run
  `cancelled` with zero reviews. Integration test (`*.it.test.ts`): a failure
  inside `saveReviewOutcome` leaves no review row.

## Task 3: PR title and author inside the untrusted fence (BE-4, part of XC)

- `server/src/modules/reviews/domain.ts` `taskLine` keeps only the PR number.
- `reviewer-core/src/prompt.ts` `assemblePrompt` gets a slot for PR metadata
  (title, author) rendered through `wrapUntrusted('pr-meta', …)`; the server
  passes it.
- `wrapUntrusted` escapes any closing tag variant: case-insensitive, optional
  whitespace (`/<\s*\/\s*untrusted\s*>/gi`).
- Tests in `reviewer-core/test`: a title containing an instruction lands inside
  a fence; `</UNTRUSTED >` is escaped. Update any server test asserting the old
  task line.

## Task 4: The grounding gate checks every model-produced finding (BE-3)

First write `reviewer-core/specs/grounding-model-findings.md` from the package's
spec template, stating: findings produced by the LLM are always line-grounded
whatever their `kind`; the full-file exemption applies only to findings a
caller marks as coming from a server-side scanner; a range must satisfy
`start <= end` and is checked by iterating the diff's lines, not the integer
range; a span is capped. Then implement in `reviewer-core/src/grounding.ts`
(an explicit option, defaulting to no exemption) and have the LLM path in
`reviewer-core/src/review/run.ts` use it. Keep `server/test/grounding.test.ts`'s
full-file case passing through the explicit option. Tests: a `secret_leak`
finding on a line outside the diff is dropped on the LLM path; an
`end_line` of 1e9 returns promptly.

## Task 5: An interrupted re-index cannot leave a "full" empty index (DB-1 stopgap)

In `server/src/modules/repo-intel/repository.ts` only:
`deleteAllForRepo` runs in one transaction that also deletes the repo's
`repo_index_state` row, so the next refresh sees no state and runs a full index.
Wrap each `replace*`, `patch*` and `deleteForFiles` method's delete-then-insert
in its own transaction. Integration test: after `deleteAllForRepo` the index
state row is gone.

## Task 6: Findings shortcuts cannot fire by accident (RX-1)

`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/`:
ignore the keydown when `metaKey`, `ctrlKey` or `altKey` is held, on
`e.repeat`, when the target is a text input (reuse `isTextInput` from
`components/app-shell/helpers.ts`), when a `[role="dialog"]` is open, and
while the action is pending. Only one panel may react to a key: scope the
shortcuts to the panel that holds focus or was last interacted with (your
choice; state it in the report). Depend on `action.mutate`, not the whole
mutation object. Tests: Cmd/Ctrl+A does not accept; with two panels mounted
one `a` press triggers one mutation.

## Task 7: The agent form cannot overwrite newer data (RX-2)

`ConfigTab` is keyed by `agent.id` in `AgentEditor.tsx` and its re-sync effect
is deleted. The nine field states become one draft object; Save sends only
changed fields; Save is disabled when nothing changed; the "Saved" note
belongs to the current agent. Tests: toggling `enabled` elsewhere (new `agent`
prop with the same id) then saving another field does not send `enabled`;
switching agents resets the draft.

## Task 8: Diff viewer correctness (RX-11, bug part)

- `InlineComposer`: a repeated Cmd/Ctrl+Enter while posting does not submit
  again.
- `components/diff-viewer/helpers.ts` patch parser: `\ No newline at end of
  file` and the empty string after the final newline are not context lines and
  do not advance line numbers.
- `DiffViewer`: `FileCard` keyed by `file.path`.
- Add `components/diff-viewer/helpers.test.ts` covering the parser edge and a
  normal hunk. Memoisation is not part of this task.

## Task 9: The server unit lane never touches a real database (BE-5)

Move the stale-run reaper out of `buildApp` into `server/src/server.ts`,
before `listen` (or behind a `BuildAppOptions` flag that only `server.ts`
sets). The three test files that call `buildApp` without a database override
must pass with no reachable database and must not issue any query. Fix the
stale "connects lazily" comment in `test/routes-smoke.test.ts`. Prove it: the
unit lane passes with `DATABASE_URL` pointing at an unreachable port and logs
no reaper attempt.

## Task 10: Tests are type-checked (XC-4)

Add a `tsconfig.test.json` to `server/` and `reviewer-core/` that includes
`test/**`, make each package's `typecheck` script check both configs, and fix
the existing errors in test files (about 17 in server, 2 in reviewer-core)
without weakening assertions. Add the step to the server and reviewer-core
CI workflows if they do not already run the script.

## Task 11: e2e is hermetic and its flows wait (XC-6, XC-7, XC-11)

- `server/src/platform/config.ts`: a `DEVDIGEST_SECRETS_PATH` env var
  overrides the secrets file path (default unchanged); document it in
  `server/README.md`.
- `scripts/e2e.sh`: point `DEVDIGEST_SECRETS_PATH` at an empty temp file,
  export empty provider and GitHub keys, and exit 1 (not warn) when
  `agent-browser` or `e2e/node_modules` is missing.
- `e2e/specs/04-pr-findings.flow.json` and `05-pr-diff.flow.json`: wait for the
  PR row text before clicking it, as flow 02 does.
- `.github/workflows/server-integration.yml` and `e2e-web.yml`: add
  `reviewer-core/**` (and `docker-compose.yml` for e2e) to `paths:`; add
  `timeout-minutes` to every job in all workflows; make the integration lane
  fail when `CI=true` and Docker is unavailable instead of skipping.
- Do not run the e2e suite (it starts servers on the user's machine).

## Task 12: Contract copies agree and stay agreed (XC-2)

Make `client/src/vendor/shared` identical to `server/src/vendor/shared` (the
server copy is the superset). In both copies replace the inline provider enums
in `contracts/eval-ci.ts` and `contracts/productionize.ts` with the shared
`Provider` schema. Add a CI step (in `client.yml` and `server-unit.yml`, with
both vendor paths in their `paths:`) that runs
`diff -r server/src/vendor/shared client/src/vendor/shared` and fails on a
difference. Client and server typecheck and tests must still pass.

## Task 13: The client builds in CI; free strictness flags on (NX-4, NX-6, XC-14)

- `client/next.config.mjs`: add webpack `resolve.extensionAlias`
  (`".js": [".ts", ".tsx", ".js"]`) so value imports from `@devdigest/shared`
  build; then delete the hand-mirrored registry in
  `client/src/lib/feature-models.ts` in favour of the shared one, if
  `pnpm build` passes. Run `pnpm build` in the worktree's `client/` only.
- `.github/workflows/client.yml`: add `pnpm build` with
  `NEXT_TELEMETRY_DISABLED=1`.
- Enable `verbatimModuleSyntax`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `noImplicitReturns` in the tsconfig of
  `server`, `client`, `reviewer-core` and `e2e`; add `noUncheckedIndexedAccess`
  to `e2e`. Fix what they raise. Remove `declaration`, `sourceMap`,
  `composite`, `allowJs` from `client/tsconfig.json` if unused under `noEmit`.

## Task 14: ESLint for the client (NX-1)

New dev dependencies allowed: `eslint` 9, `typescript-eslint`,
`eslint-plugin-react-hooks`, `@next/eslint-plugin-next`,
`eslint-plugin-jsx-a11y`. Flat config `client/eslint.config.mjs`, a `lint`
script (`eslint .`, not `next lint`), ignoring `src/vendor/**`, `.next/**`.
Rules: `react-hooks/rules-of-hooks` error, `react-hooks/exhaustive-deps` warn,
Next core-web-vitals, `typescript-eslint` recommended with
`consistent-type-imports` and `no-explicit-any` as errors, `jsx-a11y`
recommended as warn, and `no-restricted-imports` banning `../../../` climbs
into `lib`/`components` and deep `@devdigest/ui/*` imports (warn). `pnpm lint`
must exit 0 (errors fixed, warnings allowed). Add a lint step to `client.yml`.
Replace the three `eslint-disable` comments only if the rule now passes.

## Task 15: Import rules for the client are checked (FE-11, FE-3)

New dev dependency allowed: `dependency-cruiser` (same major as `server/`).
`client/.dependency-cruiser.cjs` with rules, no baseline: `src/lib` and
`src/components` never import `src/app`; `src/lib` never imports
`src/components`; a route never imports an unrelated top-level route;
nothing imports another component folder's `constants`/`helpers`/`styles`
(only its `index`); `helpers.ts` and `constants.ts` never import `react`,
`next/*`, `@tanstack/*`, `next-intl`. A `deps:validate` script and a
`client.yml` step. First fix the existing violations: move
`SEVERITY_ORDER` / `SEVERITY_FILTERS` and the `RunCostBadge` formatters to
the `pulls` route folder, make `RunCostBadge/index.ts` export only the
component. Update the "Check before you finish" section of
`.claude/skills/frontend-architecture/SKILL.md` to name the new command.

## Task 16: Indexes for the growing tables (DB-2, DB-11 part, DB-16)

Schema change plus one generated migration:
`findings(review_id)`, `reviews(pr_id, created_at desc)`,
`agent_runs(pr_id, ran_at desc)`, partial `agent_runs(status) where status =
'running'`, `pr_files(pr_id)`, `pr_commits(pr_id)`; drop `repos_ws_idx` and
`symbols_repo_path_idx` (prefixes of unique indexes). Put
`CREATE EXTENSION IF NOT EXISTS vector;` at the top of the new SQL file and fix
`server/README.md` and `drizzle.config.ts` comments accordingly. Delete
`server/src/db/rows.ts` (no importer). Fix the table count in
`test/integration.it.test.ts` if stale. Run the integration tests.

## Task 17: Runs and reviews are deleted with their PR (DB-3)

Schema plus one generated migration: `agent_runs.pr_id` `ON DELETE CASCADE`;
FK `reviews.run_id → agent_runs(id) ON DELETE CASCADE`; FK
`reviews.agent_id → agents(id) ON DELETE SET NULL`. At the top of the new SQL
file, before the constraints: delete `agent_runs` with `pr_id IS NULL`, null
out `reviews.agent_id` values with no agent, delete reviews whose `run_id`
has no run. Simplify `deleteAgentRun` to one statement. Integration test:
removing a repo removes its runs and reviews.

## Task 18: One statement per PR-list sync (DB-5)

`pulls/repository.ts` `upsertFromGitHub`: one multi-row insert with
`onConflictDoUpdate` using `excluded.*`, including `base`, and
`opened_at = coalesce(pull_requests.opened_at, excluded.opened_at)`.
`saveDetail` skips rewriting files and commits when the stored `head_sha`
equals the incoming one. Same multi-row treatment for the loop in
`settings/repository.ts`. Integration tests for both.

## Task 19: Agent writes are atomic (DB-7)

`agents/repository.ts`: `insert` (agent + v1 snapshot), `update` (row +
snapshot) and `setSkills` (delete + insert) each in one transaction; the
version bump is `version = version + 1` in SQL with the snapshot taken from
the returned row; remove the `onConflictDoNothing` that hides collisions.
Integration test: two concurrent updates produce versions N+1 and N+2 with
matching snapshots.

## Task 20: One error envelope for every failure (BE-7, XC 11)

`server/src/app.ts`: `setNotFoundHandler` returning the envelope; framework
errors with a 4xx `statusCode` (malformed JSON, 413, 429) get their own
stable codes and are logged at warn; 5xx responses carry a generic message
(the detail stays in the log) unless `NODE_ENV === 'development'`; log with
`req.log` so the request id is kept. A missing GitHub token becomes a 4xx
named error. Inject tests for each case.

## Task 21: The SSE endpoint ends and cleans up (BE-8)

`modules/reviews/routes.ts` run-events route: resolve the run through the
service first (404 if unknown; for a finished run replay the stored events
and end); unsubscribe when the request closes; send a comment heartbeat every
15 s. `platform/sse.ts`: delete `buffers`, `seq`, `completed` for a run a fixed
time after completion. Unit tests for the bus cleanup and the unknown-run 404.

## Task 22: Runs are bounded and not duplicated (XC-5, BE-12 runs part)

- The server passes a default `maxTokens` to every review call (a named
  constant; choose a value that covers the largest legitimate review and say
  why).
- `ReviewService` returns the existing run instead of starting a second one
  when a run for the same `(prId, agentId)` is `running`.
- The diff sent to the model is capped by a named character limit; when it is
  cut, the run log says so and the review is marked partial (do not mark the
  head reviewed).
- Unit tests with in-memory ports for dedupe and the cap.

## Task 23: LLM calls can be aborted and keep their usage on failure (BE-9)

Add an optional `signal` to `StructuredRequest` (both contract copies); the
providers pass it to the SDK and use the SDK's own `timeout` and `maxRetries`
instead of wrapping it in `withRetry`; cancel aborts the in-flight call. A
schema-validation failure throws a typed error carrying accumulated token
usage, cost and raw output, and the executor stores that usage on the failed
run. Tests with a fake client.

## Task 24: The Anthropic repair turn is valid (BE-10)

`server/src/adapters/llm/anthropic.ts`: after a `tool_use`, the re-prompt is a
user turn containing a `tool_result` block (`is_error: true`) with the
repair text. Test with a fake client asserting the message sequence.

## Task 25: The review diff is complete or says it is not (BE-11, XC-12)

- `diff-loader.ts`: log the fallback to stored files as a run event.
- `adapters/github/octokit.ts`: paginate `listFiles`; record files skipped for
  lack of a patch in the run log.
- An empty diff fails the run with a clear error instead of scoring 100, and
  does not mark the head reviewed.
- `adapters/git/simple-git.ts`: reject ref names starting with `-` and add
  `--end-of-options` to `diff` and `fetch`.
- Unit tests for each.

## Task 26: Jobs survive restarts and repo removal cleans up (BE-12 jobs, DB-6 part)

At boot (in `server.ts`, beside the run reaper), mark `jobs` left `queued` or
`running` as `failed` with an error text. Record the real attempt count.
`RepoService.remove` deletes the repo's clone directory through the git port,
with the existing containment check. Unit tests with in-memory ports.

## Task 27: Routes declare response schemas (BE-6, XC-3)

Add `response: { 200: <Contract> }` (or the right status) to every route
whose body is an existing shared contract. Add contracts for the workspace
overview and the repo-intel index state to both copies and use them.
Replace `ReviewDto` / `ReviewDtoFinding` with `ReviewRecord` / `FindingRecord`.
Fix the client hook that types `POST /repos/:id/refresh` as `Repo`. Fix any
response that fails its schema rather than loosening the schema. Server unit
and integration tests must pass.

## Task 28: Live trace drawer; valid active repo (RX-5, RX-9)

- The PR page passes `running` to `RunTraceDrawer` for a live run, keys the
  drawer by run id, and invalidates `["run-trace", runId]` when the run ends.
- `lib/repo-context.tsx`: a stored repo id not in the loaded repo list is
  ignored; deleting the active repo clears it.
- Tests for both.

## Task 29: Query keys and error policy in one place (RX-6, RX-7)

A `queryKeys` factory in `client/src/lib/hooks/` used by every hook and by
the PR page. Run start, cancel, delete and finding actions invalidate the
right keys in the hooks' `onSuccess` (remove the page's `onRunsStarted`
callback chain); `prId` is required where invalidation depends on it; Retry
on the PR page refetches the pulls list when `prId` is unknown. Mutation
errors are shown once: a mutation that shows its error inline sets
`meta: { errorUi: "inline" }` and the global toast skips it; identical toasts
are de-duplicated; the two `mutateAsync` calls without `catch` are fixed.
Tests for the invalidation of run start and for the toast policy.

## Task 30: Effects and loading states (RX-8, RX-10)

- `RunStatus` calls `onDone` once per running→done transition.
- `FindingsPanel` resets focus in the filter change handlers instead of an
  effect; `ReviewRunAccordion`'s open state is lifted into `FindingsTab` and
  the Timeline click scrolls in its handler; fix the `useMemo` with wrong
  dependencies on the PR page.
- Loading and error are distinct from empty on: home page, findings tab, diff
  tab comments, `SettingsModels` (pickers disabled until settings load),
  `RunReviewDropdown`, agent list.
- Tests for `RunStatus` and `SettingsModels`.

## Task 31: Error and not-found pages (NX-2)

Add `client/src/app/error.tsx`, `global-error.tsx`, `not-found.tsx` using the
`@devdigest/ui` error and empty states with text from `messages/en`, and a
`/settings` → `/settings/api-keys` redirect. Check `e2e/specs/` still
matches.

## Task 32: Dialogs are accessible; no `window.confirm` (RX-3)

Vendor change allowed in `client/src/vendor/ui/kit/Modal.tsx` and
`Drawer.tsx`: initial focus, focus trap, focus restore on close, Escape closes,
`aria-labelledby` to the title. Add a `ConfirmDialog` (in `src/components/`)
and replace the four `window.confirm` calls. Tests: Escape closes; confirm
calls back; cancel does not.

## Task 33: Keyboard-reachable controls and labelled fields (RX-4, NX-8)

Vendor change allowed in `client/src/vendor/ui/kit/FormField.tsx`: associate
the label with its control (`useId` + `htmlFor`, or wrapping). Replace the
clickable `div`/`span` controls named in RX-4 with `<button>` or `<Link>`
(PR row and agent card get a real link on their title; `NX-8`); add
`aria-expanded` to disclosure headers; give the five unnamed inputs an
accessible name; show the diff "+" button on focus as well as hover; fix the
nested button in `ReviewRunAccordion`. Update tests that relied on the old
markup to query by role or label. Check `e2e/specs/` still matches.
