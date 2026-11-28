# DevDigest — improvement plan

An audit of the whole repo against the project's own skills
(`.claude/skills/`), taken on 2026-11-27 at commit `4b95acc`. It lists what to
change, why, where, and in what order. Nothing in it has been done yet.

88 items in six areas: 7 high, 46 medium and 35 low. The seven high items are
all small or medium fixes. The largest structural gap is that none of the
repo's gates has ever run on this fork (XC-1).

## Order of work

### Step 1 — bugs that lose work or take the app down (about two days)

| Item | In one line |
|---|---|
| BE-1 | A failed clone or index job crashes the API process |
| BE-2 + DB-4 | Cancel does not cancel; a review's outcome is saved in five unguarded writes |
| RX-1 | The `a` / `d` shortcuts accept or dismiss findings by accident, with no undo |
| RX-2 | Saving the agent form silently reverts a toggle made in the list |
| DB-1 (stopgap) | An interrupted re-index leaves an empty index that reads "full" |
| BE-4, BE-3 | PR title and author are outside the untrusted fence; the model can exempt its own finding from grounding |
| RX-11 (two bugs) | A comment can post twice; "no newline" lines shift diff line numbers |

### Step 2 — make the gates real (about two days)

| Item | In one line |
|---|---|
| XC-1 | Enable CI on the fork and protect `main` |
| BE-5, XC-6 | Unit tests and the e2e stack touch the real database and the real secrets |
| XC-4, NX-4 | Type-check the tests; build the client in CI |
| XC-2 | Stop contract drift: one source, or a CI diff |
| XC-7 | The two flaky e2e flows |
| NX-1, FE-11 | ESLint and an import checker for the client |

### Step 3 — data integrity and failure handling (about a week)

DB-2 and DB-3 (indexes and foreign keys, one migration each), DB-5, DB-7,
BE-7 (error envelope), BE-8 (SSE), BE-9 and XC-5 (bounded LLM calls and
spend), BE-10, BE-11, BE-12, RX-5, RX-6, RX-7, RX-9, RX-10, NX-2 (error and
not-found pages), BE-6 with XC-3 (response schemas).

### Step 4 — structure and coverage, done as files are touched

FE-1 to FE-10 (the `frontend-architecture` offenders), NX-3 (shell in a
layout), FE-6 with NX-7 (thin pages and titles), RX-3 and RX-4
(accessibility), RX-12 and RX-13 with FE-7 and BE-14 (tests), DB-6
(retention), and every low item.

### Decisions needed before some items can start

1. **DB-1 proper fix** changes two call sites in `repo-intel/pipeline/`, which
   `server/AGENTS.md` marks do-not-touch. Allow it, or stay with the stopgap?
2. **DB-3**: was `ON DELETE SET NULL` on `agent_runs.pr_id` deliberate (keep
   run history after a PR is removed)? If yes, the fix is a cleanup job, not a
   cascade.
3. **XC-2**: the root `AGENTS.md` says the contracts exist as two copies.
   Replace that rule with a single source, or keep two copies and gate the diff?
4. **BE-3**: changing the grounding exemption needs a spec in
   `reviewer-core/specs/` first.
5. **RX-3, RX-4**: the focus trap, Escape handling and label association belong
   in `client/src/vendor/ui`, which is changed only deliberately.
6. **XC-15**: Zod 4 is the only fix for the audit's high advisory and is a
   large upgrade across three packages. Schedule it or accept the risk.

## How to read it

- **Severity** — high: wrong data, a user-visible bug, or a security or
  reliability risk in normal local use. Medium: a cost that grows with the
  code or the data. Low: polish and hardening.
- **Effort** — S: under an hour. M: about half a day. L: more.
- **Evidence** is `path:line` at the audited commit. "Confirmed" means a second
  pass re-opened the code; everything else was read once by the auditor.
  "Inference" marks a conclusion that was reasoned, not reproduced.
- Each item names the skill whose rule it applies. A finding that contradicted
  a decision recorded in an `AGENTS.md` or `INSIGHTS.md` was dropped.

## 1. Frontend structure — `frontend-architecture`

Measured with the greps in the skill's "Check before you finish" section, run
from `client/`. The skill is new, so these are the existing offenders it was
written against, not regressions.

| ID | Sev | Effort | What | Evidence | Fix |
|---|---|---|---|---|---|
| FE-1 | medium | M | 18 top-level constants and helper functions live in 11 `.tsx` files | `RunHistory.tsx` (5: `outcomeOf`, `tsOf`, three style consts), `MermaidDiagram.tsx` (3), `ReviewRunAccordion.tsx` (2), `FileCard.tsx`, `CommentCard.tsx`, `FindingsCell.tsx`, `PromptModalBody.tsx`, `PromptBlock.tsx`, `FindingsSection.tsx`, `pulls/page.tsx`, `agents/[id]/page.tsx` (1 each) | Move each to the folder's `constants.ts` / `helpers.ts` / `styles.ts`, with a `helpers.test.ts` case per function |
| FE-2 | medium | S | The same helper or constant exists twice | `formatWhen` in `ReviewRunAccordion.tsx:22` and `CommentCard.tsx:11`; `SEV_COLOR` in `FindingCard/constants.ts:4` and `FindingsSection.tsx:12`; `PROVIDER_OPTIONS` in `CreateAgentModal/constants.ts:8` and `ConfigTab/constants.ts:4` | One copy each, at the lowest folder above both consumers (`src/lib/<subject>.ts` for `formatWhen`) |
| FE-3 | medium | S | 3 imports reach into another component folder's internals; 1 `index.ts` re-exports helpers | `pulls/helpers.ts:2`, `SeverityFilter.tsx:11`, `FindingsCell.tsx:14` (all into `FindingsPanel/constants`); `RunCostBadge/index.ts:2` | Move `SEVERITY_ORDER`, `SEVERITY_FILTERS` and the cost formatters to `pulls/constants.ts` / `pulls/helpers.ts`. A test run of the skill already produced this exact move |
| FE-4 | medium | M | About 17 user-facing English strings are hardcoded in app code | `app/page.tsx:23,33`; `pulls/[number]/page.tsx:115,153`; `FindingsTab.tsx:126,161`; `ReviewRunAccordion.tsx:117,122,123` plus "Agent", "finding(s)", "blocker(s)"; `AgentCard.tsx:44,47,48`; `agents/[id]/page.tsx:45`; `AddRepoView.tsx:77`; `CodeLine.tsx:49,50` | Message keys under `messages/en/`. Check `e2e/specs/` for flows that assert on the text |
| FE-5 | low | L | 91 inline `style={{…}}` objects in 19 files | `AddRepoView.tsx` (16), `RunHistory.tsx` (15), `agents/[id]/page.tsx` (13), `ReviewRunAccordion.tsx` (11), `PromptModalBody.tsx` (7), `FindingsSection.tsx` (7) | Named entries in each folder's `styles.ts`. Do it per file when the file is next touched, not as one sweep |
| FE-6 | medium | M | Pages are not thin | `pulls/[number]/page.tsx` (185 lines: nine hooks, finding filters at `:72-76`, `window.confirm` at `:153`); `pulls/page.tsx` (135); `agents/[id]/page.tsx` (124) | Move the body into a `_components/<Name>View/` with its helpers; the page keeps params and composition |
| FE-7 | medium | M | 7 `helpers.ts` files (14 functions) have no `helpers.test.ts`; `src/lib/github-urls.ts`, `model-label.ts`, `feature-models.ts` have no test | `diff-viewer/helpers.ts`, `app-shell/helpers.ts`, `AgentsListView/helpers.ts`, `AgentCard/helpers.ts`, `RunCostBadge/helpers.ts`, `FindingCard/helpers.ts`, `RunTraceDrawer/helpers.ts` | Plain unit cases beside each; these are the cheapest tests in the repo |
| FE-8 | low | S | `relativeTime` reads the clock directly, so its tests need fake timers | `pulls/helpers.ts:50` | `now = Date.now()` as the last parameter |
| FE-9 | low | M | 47 imports climb to `src/lib` with `../../..`; 19 use `@/lib` | `grep -rnE "from ['\"](\.\./)+(lib\|components)/" src/app src/components` | Switch to `@/` when a file is touched; a codemod is safe because the alias already resolves |
| FE-10 | low | S | Dead and missing files | `PrRowView` in `lib/types.ts:38` has no user; `RunHistory/` and `RunTraceDrawer/_components/` have no `index.ts` | Delete the type; add the two index files |
| FE-11 | medium | M | Nothing checks the import rules mechanically | `client/` has no linter and no import checker; `server/` runs `pnpm deps:validate` in CI | dependency-cruiser for `client/` with the rules the greps express today (see `frontend-architecture/references.md`, part C) |

Clean today: no `fetch`, `useQuery` or `useMutation` outside `src/lib`; no
import from `src/app` in `src/lib` or `src/components`; no React, Next or
TanStack import in any `helpers.ts` or `constants.ts`.

## 2. Database — `postgresql-table-design`, `drizzle-orm-patterns`

Schema and latest migration snapshot match exactly (40 tables, 0 pending
statements), and `pnpm typecheck` passes. Paths are under `server/`. Nothing
here was checked against a live database; the queries to confirm sizes, plans
and orphans are at the end of the section.

| ID | Sev | Effort | What | Evidence | Fix |
|---|---|---|---|---|---|
| DB-1 | high | S, then M | A full re-index deletes and rewrites symbols, references, edges, rank and facts in about ten autocommit statements, and writes the index state last. A crash or restart in between leaves an empty index that still reads "full", and an unchanged repo never re-indexes. Confirmed | `src/modules/repo-intel/pipeline/full.ts:205-207,270`; `repository.ts:223-226` and the `replace*` / `patch*` methods; `pipeline/incremental.ts:97-98` | Stopgap (S): `deleteAllForRepo` becomes one transaction that also deletes the `repo_index_state` row, which forces a full re-index next time. Proper (M): one repository method for the whole persist phase. The proper fix touches `pipeline/`, which `server/AGENTS.md` marks do-not-touch: needs a decision |
| DB-2 | medium | S | No index on the foreign-key and filter columns of the tables that grow, so every PR-list load runs three sequential scans and every cascade delete scans the child table per parent row. Confirmed | `src/db/schema/reviews.ts`, `runs.ts`, `pulls.ts` declare only `pr_repo_number_uq` and `pr_ws_idx`; queries at `reviews/repository/review.repo.ts:92-96,121-133`, `run.repo.ts:26-28,49-50,109,204`, `pulls/repository.ts:98,110,137` | One new migration: `findings(review_id)`, `reviews(pr_id, created_at desc)`, `agent_runs(pr_id, ran_at desc)`, partial `agent_runs(status) where status = 'running'`, `pr_files(pr_id)`, `pr_commits(pr_id)` |
| DB-3 | medium | M | Deleting a repo or a PR orphans its runs and traces: `agent_runs.pr_id` is `ON DELETE SET NULL` and every reader filters by PR. `reviews.run_id` and `reviews.agent_id` have no foreign key at all. Confirmed | `src/db/schema/runs.ts:14`; `src/db/schema/reviews.ts:17,19`; `run.repo.ts:73-89` compensates with two untransacted deletes | New migration: cascade on `agent_runs.pr_id`, FK `reviews.run_id → agent_runs`, FK `reviews.agent_id → agents … SET NULL`, after cleaning dangling values. Confirm that `SET NULL` on `pr_id` was not deliberate |
| DB-4 | medium | M | A review's outcome is saved in five separate writes. If one fails, an empty review stays attached to a failed run and replaces that agent's earlier findings in the PR list. Confirmed | `src/modules/reviews/run-executor.ts:216,227,232,241,286`; catch at `:291-311` | One repository method (`saveReviewOutcome`) in a transaction; `markReviewed` stays after commit. Add a `status = 'running'` guard to `completeAgentRun` so a cancelled run is not overwritten |
| DB-5 | medium | S | One upsert per pull request in a loop, up to 50 round trips, on every PR-list load and every poll; opening a PR rewrites all its files each time. Confirmed | `src/modules/pulls/repository.ts:36-61,96-133`; callers `pulls/service.ts:63,191`, `polling/service.ts:28`; same loop in `settings/repository.ts:25-34` | One multi-row `insert … onConflictDoUpdate` with `excluded.*`; skip the file rewrite when `head_sha` is unchanged |
| DB-6 | medium | M | Nothing prunes `run_traces`, `agent_runs`, `jobs` or clones. `jobs` is write-only and stale `queued` / `running` rows are never reaped; removing a repo leaves its clone on disk | `run-executor.ts:259-284`; `src/platform/jobs.ts:53-95`; `src/modules/repos/service.ts:138-141` | A retention rule for traces at boot; reap and prune `jobs` at boot; delete the clone on repo removal |
| DB-7 | medium-low | S–M | The agent version bump is read-then-write, and `onConflictDoNothing` hides the collision; `setSkills` deletes then inserts with no transaction | `src/modules/agents/service.ts:112`; `agents/repository.ts:89-109,117-146,166,224-230` | One transaction per method; bump with `version = version + 1` and snapshot from the returned row |
| DB-8 | low | M | About 12 status-like columns are free text with no `CHECK`; `agent_runs.status` is nullable | `src/db/schema/runs.ts:23`, `pulls.ts:25`, and `findings`, `reviews`, `jobs`, `repo_index_state`, `agents` | `check()` constraints in a new migration, after validating existing values |
| DB-9 | low | S–M | Cost is `double precision`; the PR total is already rounded to hide float noise | `src/db/schema/runs.ts:22`, `eval.ts:34`, `ci.ts:23`; `server/INSIGHTS.md:72` | `numeric(14,8)` and sum in SQL |
| DB-10 | low | S | Uniqueness the code assumes but the schema does not enforce | `users.email`, `workspaces.name` (`core.ts:8,15`); `agents(workspace_id, name)`; nullable columns inside two unique indexes (`core.ts:41,46`, `context.ts:71,80-86`); `pr_files(pr_id, path)` | Unique indexes or `NULLS NOT DISTINCT`, after checking for duplicates |
| DB-11 | low | S | Redundant or reader-less indexes; three repository methods with no caller | `repos_ws_idx`, `symbols_repo_path_idx` (prefixes of unique indexes); `symbols_repo_name_idx`, `pr_ws_idx`, `jobs_status_idx`; `repo-intel/repository.ts:128-170` | Drop in the DB-2 migration after checking `pg_stat_user_indexes`; delete the dead methods |
| DB-12 | low | S–M | Every incremental refresh rewrites every reference row twice | `repo-intel/repository.ts:378-401` | One `UPDATE … WHERE decl_file IS DISTINCT FROM new` |
| DB-13 | low now | M, later | The pgvector tables have no ANN index and no chunk identity; nothing writes them yet | `src/db/schema/context.ts:43,46`, `knowledge.ts:21,28`; `docker-compose.yml:5` floats `pgvector/pgvector:pg16` | When embeddings land: HNSW with `vector_cosine_ops`, a chunk key and `content_hash`, one constant for the dimension, a pinned image |
| DB-14 | low | S–M | Roll-ups in JS, whole-row selects, no limits | `run.repo.ts:201-205`; `review.repo.ts:113-133`; `pulls/repository.ts:64-69`; `reviews/service.ts:156-161` | `sum`/`count … group by`, `DISTINCT ON`, column projection |
| DB-15 | low | S | The workspace guard the schema comment describes does not exist; two run routes take a bare id | `src/db/schema.ts:4-6`; `reviews/routes.ts:134-145` | Filter by `workspaceId`; correct the comment |
| DB-16 | low | S | Stale statements: pgvector is enabled by `migrate.ts`, not by migration 0000 as the README says, so `drizzle-kit migrate` fails on an empty database; `db/rows.ts` has no importer | `README.md:114-115`, `drizzle.config.ts:12`, `src/db/migrate.ts:23`, `src/db/rows.ts` | A migration starting with `CREATE EXTENSION IF NOT EXISTS vector`; delete `rows.ts` |
| DB-17 | low | M | Integration tests cover no delete, cascade or indexer-persistence case | `server/test/*.it.test.ts` | One test with each of DB-1, DB-3 and DB-4 |

Done well, keep: `timestamptz` and `text` everywhere; upserts against matching
unique indexes; rows stop at repositories; bulk inserts chunked at 500 with
empty-array guards; no transaction held across a GitHub or LLM call; additive
migrations; the pool closed on shutdown with a boot-time reaper for runs.

To confirm on a live database before DB-2, DB-3, DB-8, DB-10 and DB-11:

```sql
SELECT relname, indexrelname, idx_scan FROM pg_stat_user_indexes ORDER BY idx_scan;
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_statio_user_tables ORDER BY 2 DESC;
SELECT count(*) FROM agent_runs WHERE pr_id IS NULL;
SELECT count(*) FROM reviews r WHERE run_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM agent_runs a WHERE a.id = r.run_id);
SELECT DISTINCT status FROM agent_runs;
```

## 3. React and component tests — `react-best-practices`, `react-testing-library`

`pnpm typecheck` is clean and `pnpm test` passes (17 files, 61 tests). Paths are
under `client/src`; `…/pulls` is `app/repos/[repoId]/pulls`. No finding was
reproduced in a browser.

| ID | Sev | Effort | What | Evidence | Fix |
|---|---|---|---|---|---|
| RX-1 | high | S–M | The findings-panel shortcuts `a` (accept) and `d` (dismiss) listen on `window` with no modifier, dialog or repeat guard. One listener per open review run, so one keypress acts on N findings; Cmd/Ctrl+A accepts and Cmd/Ctrl+D dismisses; the nav chord `g a` also accepts. The action is one-way on the server and the UI has no undo. Confirmed | `…/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:48-60`; `FindingsPanel/constants.ts:18-21`; `components/app-shell/hooks/useGlobalShortcuts.ts:43-47` | Bail on `metaKey`/`ctrlKey`/`altKey`/`repeat`, on text inputs and when a dialog is open; scope the keys to the focused panel; depend on `action.mutate`; add a test |
| RX-2 | high | M | The agent editor copies the agent into nine `useState`s and re-syncs only on `agent.id`. Toggling `enabled` in the list and then saving reverts the toggle; the "Saved" note and unsaved edits carry over or vanish on agent switch. Confirmed | `app/agents/[id]/_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx:18-39,68,140-142`; `AgentEditor.tsx:23` | `<ConfigTab key={agent.id} />`, delete the effect, hold one draft object, send only changed fields, derive `isDirty` |
| RX-3 | medium | M | `Modal` and `Drawer` declare `role="dialog"` but have no focus trap, initial focus, restore or Escape; four destructive confirms use `window.confirm`. Confirmed (vendor has no key or focus handling) | `vendor/ui/kit/Modal.tsx:25-27`, `Drawer.tsx:25-27`; `useShellContext.ts:44`, `…/pulls/[number]/page.tsx:153`, `ReviewRunAccordion.tsx:117`, `AgentCard.tsx:44` | Fix once in the vendor layer (a deliberate vendor change), then one `ConfirmDialog` for the four confirms |
| RX-4 | medium | M | Ten mouse-only controls (clickable `div`s and `span`s), five inputs with no accessible name, and `FormField` renders a `<label>` that is not associated with its control, so every form field is unlabelled and tests cannot use `getByLabelText` | `PRRow.tsx:23-27`, `AgentCard.tsx:30`, `FindingCard.tsx:56`, `FileCard.tsx:57`, `RunHistory.tsx:220-228`, `SettingsApiKeys.tsx:71`, `CodeLine.tsx:36,46-56`; `vendor/ui/kit/FormField.tsx:19` | Real `<button>` / `<Link>` elements, `aria-expanded` on disclosure headers, `useId` + `htmlFor` in `FormField` |
| RX-5 | medium | S | The trace drawer's live mode is unreachable: the page never passes `running`, so a live run opens with an empty persisted log. Confirmed | `…/pulls/[number]/page.tsx:175-181`; `RunTraceDrawer.tsx:41,45-49` | Pass `running`, invalidate `["run-trace", runId]` when the run ends, add `key={traceRunId}` |
| RX-6 | medium | M | Query keys are string literals in six files and invalidation is split between hooks and the page: starting a run does not invalidate `["pr-runs"]`, cancel invalidates nothing, and Retry on the PR page refetches a disabled query | `lib/hooks/reviews.ts:45-46,74-78,132-134,157-159`; `…/pulls/[number]/page.tsx:52,57,117,133` | A `queryKeys` factory in `lib/hooks`; run-lifecycle invalidation in the hooks' `onSuccess` |
| RX-7 | medium | S–M | Mutation errors show twice (inline and toast) in three places, and two `mutateAsync` calls have no `catch`; a failing poll repeats the same toast | `lib/providers.tsx:35-43`; `DiffTab.tsx:36-38`, `AddRepoView.tsx:36-38`, `SettingsApiKeys.tsx:55-57`; `RunReviewDropdown.tsx:41-49`, `CreateAgentModal.tsx:23-33` | One policy through mutation `meta`; dedupe toasts by message |
| RX-8 | medium | M | Effects used as event handlers; `onDone` fires on every re-render after a run ends; a `useMemo` with wrong dependencies. Three `eslint-disable` comments target a linter that is not installed. Confirmed for `RunStatus` | `RunStatus.tsx:23-26`; `FindingsPanel.tsx:45`; `ReviewRunAccordion.tsx:51-57`; `…/pulls/[number]/page.tsx:72-75` | Reset in the change handlers, lift the open-run ids into `FindingsTab`, reset the ref in `RunStatus` |
| RX-9 | medium | S | The stored active-repo id is never checked against the repo list, so a deleted or re-seeded repo leaves the shell polling a dead id. Confirmed | `lib/repo-context.tsx:48`; `useShellContext.ts:33,48-54` | Validate against the loaded list; clear storage on delete |
| RX-10 | medium | M | Loading and error collapse into "empty" on seven screens. In `SettingsModels` the pickers are writable before settings load, so a change can drop the other features' choices (inference about the server write) | `app/page.tsx:30`; `FindingsTab.tsx:157-164`; `DiffTab.tsx:19`; `SettingsModels.tsx:22-33`; `RunReviewDropdown.tsx:54-61` | Pass `isLoading` / `isError` down or return early; disable the pickers until settings load |
| RX-11 | medium | M | Diff viewer: a repeated Cmd/Ctrl+Enter posts a comment twice; `\ No newline at end of file` shifts later line numbers and the comment target by one; `FileCard` is keyed by index; every line re-renders on any change. Confirmed for the first three | `components/diff-viewer/InlineComposer/InlineComposer.tsx:49`; `helpers.ts:31-35`; `DiffViewer.tsx:28`; `DiffTab.tsx:26-41` | Guard `submit` on `posting`; skip `\`-prefixed lines; key by `file.path`; memoise `commenting` and `CodeLine`; add `helpers.test.ts` |
| RX-12 | medium | M | `TESTING.md` and `client/AGENTS.md` say tests mock `fetch`; no test does. Seven of twelve component tests mock the project's own hooks, so `lib/api.ts`, all 25 hooks and the toast policy have no coverage | `TESTING.md:38`; `client/AGENTS.md`; the `vi.mock` calls in `FindingsCell`, `FindingsPanel`, `RunTraceDrawer`, `RunReviewDropdown`, `RunStatus`, `AgentEditor`, `SettingsApiKeys` tests | One `src/test/render.tsx` (intl + `QueryClient` + a `fetch` stub) and `api.test.ts`; or correct the documents |
| RX-13 | medium | L | Coverage sits on the M1 widgets. No test for the keyboard shortcuts, the agent save payload, the diff comment flow, run start and cancel, the two PR pages, onboarding or settings models | see RX-1, RX-2, RX-11; `components/diff-viewer/comments.ts` | About eight typological tests, one per workflow with its one edge |
| RX-14 | low | S–M | Test style: `fireEvent` 17 times and `userEvent` never (not installed); `getByTestId` 11 times where a role exists; `renderWithIntl` copied into 11 files | `FindingsCell.test.tsx`, `RunCostBadge.test.tsx`, `RunHistory.test.tsx:86` | Add `@testing-library/user-event` and the shared render helper |
| RX-15 | low | S | `useCallback` / `useMemo` that memoise nothing; `FindingsTab` takes 13 props | `FindingsTab.tsx:44-74`; `PrDetailHeader.tsx:31-37`; `useShellContext.ts:41-90` | Delete them; memoise only where RX-11 needs it |
| RX-16 | low | S | Sort and search are in state, not the URL, although the page comment says otherwise; `?tab` and `?status` are not validated | `…/pulls/page.tsx:1-2,39,46-47`; `…/pulls/[number]/page.tsx:60` | Move to params; validate against the known keys |
| RX-17 | low | S | Small items: index keys on stateful rows, one render factory, three timers never cleared, dead props, four unused hooks and an unused `MermaidDiagram` | `TraceBody.tsx:45,102`; `PromptModalBody.tsx:11-32,66`; `RunTraceDrawer.tsx:58`; `lib/hooks/repo-intel.ts` | Fix when the file is next touched |

Done well, keep: `fetch` only in `lib/api.ts` and every query hook in
`lib/hooks`; derived data computed in render through tested helpers;
`FindingsCell` and `SeverityFilter` as the accessibility and test model;
effects that sync external systems clean up; stable id keys on data lists.

## 4. Next.js and client tooling — `next-best-practices`, `typescript-expert`

No high-severity finding. `pnpm typecheck` and a production build in an
isolated copy both pass.

| ID | Sev | Effort | What | Evidence | Fix |
|---|---|---|---|---|---|
| NX-1 | medium | S, then M | The client has no linter, so hook rules and the conventions in `client/AGENTS.md` are checked nowhere | no ESLint, Biome or Oxlint config in the repo; `client/package.json` has no `lint` script | ESLint 9 flat config with `eslint-plugin-react-hooks`, `@next/eslint-plugin-next`, `typescript-eslint`, `jsx-a11y`, and `no-restricted-imports` for the import rules; a CI step. Start with warnings; the fallout was not measured |
| NX-2 | medium | S | No `error.tsx`, `global-error.tsx` or `not-found.tsx`: a render-time exception blanks the app, and `/settings`, `/repos` and `/repos/:id` show the unstyled default 404 | `client/src/app` holds only `layout.tsx`, pages and `globals.css` | Add the three files and a `/settings` redirect |
| NX-3 | medium | M | The app shell is rendered by every page (13 call sites in 8 files) instead of a layout | e.g. `…/pulls/[number]/page.tsx:92,100,112,124` | `app/(shell)/layout.tsx` renders `AppShell` once; `(bare)/onboarding` stays outside; breadcrumbs from a context setter |
| NX-4 | medium | S | `client.yml` never builds; a value import from `@devdigest/shared` fails `next build` with "Module not found" while `tsc` stays green, and only the e2e job would catch it | `.github/workflows/client.yml:47-49`; `client/src/lib/feature-models.ts:6-11` works around it by hand-mirroring a registry | `pnpm build` in `client.yml`; `resolve.extensionAlias` in `next.config.mjs` (verified to fix the import), then delete the mirror |
| NX-5 | medium | M | A PR link cannot load until the PR list has synced with GitHub, and every shell page polls that list each minute for the sidebar badge | `…/pulls/[number]/page.tsx:35-37`; `useShellContext.ts:28`; `lib/hooks/core.ts:109-110`; `server/src/modules/pulls/service.ts:48-88` | A by-number lookup or a no-sync read for those two uses (touches a server route) |
| NX-6 | low | S | Five strictness flags can be enabled with zero app-code errors | measured: `noUnusedLocals` + `noUnusedParameters` (1, in vendor), `noFallthroughCasesInSwitch`, `noImplicitOverride`, `noImplicitReturns`, `verbatimModuleSyntax` (0 each) | Enable them; skip `exactOptionalPropertyTypes` (24 errors, no payoff) |
| NX-7 | low | M | Three pages hold all their logic under `"use client"`, so every tab is titled "DevDigest"; there is no icon | same pages as FE-6; `client/src/app/layout.tsx:9-12` | After FE-6, add a title template and `generateMetadata` from `params` |
| NX-8 | low | S–M | Clickable rows navigate with `router.push`, so there is no `href`, no open-in-new-tab and no prefetch | `PRRow.tsx:26`; `AgentsListView.tsx:89`; `agents/[id]/page.tsx:88` | Make the primary cell a `<Link>` (also fixes part of RX-4) |
| NX-9 | low | S | One root `<Suspense fallback={null}>` wraps the whole app; the server layout imports a string from a `"use client"` module | `client/src/app/layout.tsx:7,29-31`; `lib/theme.tsx:2,44` | Remove or narrow the boundary; move the script string to a plain module |
| NX-10 | low | S | Fonts are declared but never loaded; they render only if installed on the machine | `client/src/app/globals.css:7-13`; `vendor/ui/styles.css:145` | `next/font/local` with bundled files |
| NX-11 | low | S–M | Message keys are untyped, so a mistyped key is not a compile error | no `IntlMessages` declaration; `client/src/i18n/request.ts:16-25` | A `global.d.ts` built from the JSON files |
| NX-12 | low | S | Package hygiene: `mermaid` and `recharts` reach no page; no `packageManager` or `engines` field; `typedRoutes` is off; a few lookup tables force `!` and `as` | `client/package.json:16,43`; `PRRow.tsx:19,46,53`; `FindingsTab.tsx:20` | Remove or lazy-load; add the fields; type the tables as `Record<PrStatus, …>` |

Not worth doing here: Server Components with query prefetch, `loading.tsx`, and
splitting the `@devdigest/ui` barrel. For a single-user app on localhost that
fetches from a separate API they add machinery without a visible gain.

Done well, keep: a server root layout with one client `Providers`; the no-flash
theme script; one `apiFetch` with `ApiError`; tab state in the URL; the CSP in
`next.config.mjs`.

## 5. Backend — `onion-architecture`, `fastify-best-practices`

`pnpm deps:validate` reports no violation, both typechecks pass, and the unit
suites pass (server 190 tests, reviewer-core 23). The four greps for what the
import checker cannot see print nothing. "Probe" means the auditor ran the real
class against in-memory ports.

| ID | Sev | Effort | What | Evidence | Fix |
|---|---|---|---|---|---|
| BE-1 | high | S | A failed background job kills the API process: the job promise rethrows, no caller handles it, and there is no `unhandledRejection` handler. A clone that fails (a mistyped repo, a private repo without a token) takes down every in-flight review. Confirmed; probe | `server/src/platform/jobs.ts:59-100`; callers `modules/repos/service.ts:67,97,115,127`, `repo-intel/service.ts:191`; `server/src/server.ts` | Make `done` non-rejecting inside `JobRunner` (the failure is already in the `jobs` row); log `unhandledRejection`; add a `JobRunner` test |
| BE-2 | high | S | Cancel does not cancel: `cancelRun` sets the flag and then `complete()` deletes it, the only checkpoint is before the LLM call, and `completeAgentRun` has no status guard. The run finishes, saves findings and flips back to `done`. Confirmed; probe | `modules/reviews/service.ts:81-86`; `platform/sse.ts:79`; `reviewer-core/src/review/run.ts:164`; `reviews/repository/run.repo.ts:176` | Clear the flag when the executor exits; check after the LLM returns; guard on `status = 'running'` (with DB-4) |
| BE-3 | high | S–M | The grounding gate trusts two model-controlled fields: a finding labelled `secret_leak`, `lethal_trifecta`, `phantom` or `hook` skips the line check, and an unbounded `end_line` makes the range loop block the event loop (758 ms for a span of 1e8). Confirmed; probe | `reviewer-core/src/grounding.ts:16,41-46,59-70`; `server/src/vendor/shared/contracts/findings.ts:53-58` | Force `kind` to `finding` on the LLM path; iterate the hunk lines, require `start <= end`, cap the span. Needs a spec and tests per `reviewer-core/AGENTS.md` |
| BE-4 | high | S | PR title and author enter the prompt unfenced, although the guard text tells the model they are inside `<untrusted>`; `wrapUntrusted` escapes only the exact lower-case close tag. Confirmed | `server/src/modules/reviews/domain.ts:45`; `reviewer-core/src/prompt.ts:17-18,32,105` | Keep only the PR number in the task line; a fenced `pr-meta` slot; a case- and whitespace-insensitive escape; a test |
| BE-5 | medium | S | The unit lane is not hermetic: three "no DB" test files call `buildApp` without a database override, and `buildApp` runs the stale-run reaper against the configured `DATABASE_URL`. Confirmed | `server/src/app.ts:80-85`; `test/routes-smoke.test.ts:15,23,41,57`, `test/settings-test-connection.test.ts:36,54,72`, `test/local-only.test.ts:59` | Run the reaper from `server.ts` before `listen`; give those tests a stub `db` |
| BE-6 | medium | M–L | No route declares a response schema (0 of 38), so the serializer never runs and the root rule "one Zod schema per contract" holds only for input; three hand-written response types duplicate contracts. Confirmed | `server/src/modules/**/routes.ts`; `modules/reviews/domain.ts:7-27`; `modules/workspace/service.ts:9-19` | `response: { 200: Contract }` per route; replace `ReviewDto` with `ReviewRecord`; add the missing contracts to both copies |
| BE-7 | medium | S | Error envelope gaps: 404 is not the envelope; malformed JSON, 413 and 429 return `code: "internal_error"`; a database error message reaches the client; errors are logged without the request id; a missing GitHub token is a 500 | `server/src/app.ts:129-177`; `platform/errors.ts:48-51` | `setNotFoundHandler`; own codes for framework 4xx; a generic 5xx message logged with `req.log`; "not configured" as a 4xx |
| BE-8 | medium | M | The SSE endpoint never ends for a run id the bus does not know, does not unsubscribe on disconnect, and never frees its buffers; no heartbeat | `modules/reviews/routes.ts:68-112`; `platform/sse.ts:21-23,37-48,76-83` | Resolve the run through the service first; unsubscribe on close; expire buffers; send a heartbeat |
| BE-9 | medium | M | LLM calls cannot be aborted or bounded: the timeout only races, retries are nested three deep, no token cap is passed, and a failed attempt loses its usage and cost | `platform/resilience.ts:13-24`; `vendor/shared/adapters.ts:55-70`; `adapters/llm/openai.ts:96-110`, `anthropic.ts:99-119`; `reviewer-core/src/review/run.ts:174-181` | `signal` and a deadline on `StructuredRequest` (both contract copies); the SDKs' own timeout and retries; a token cap; a typed error carrying usage |
| BE-10 | medium | S | The Anthropic repair turn sends a plain user message after a `tool_use`, which the API rejects, so the first validation failure ends in a 400 instead of a repair (inference, not executed) | `server/src/adapters/llm/anthropic.ts:140-144` | Reply with a `tool_result` block; test with a fake client |
| BE-11 | medium | M | The review diff may be stale or truncated and nothing says so: the git path cannot succeed on a depth-1 clone, the fallback reads one page of 100 files, and an empty diff still scores 100 and marks the head reviewed (inference from code) | `modules/reviews/diff-loader.ts:20-37`; `modules/repos/constants.ts:9`; `adapters/github/octokit.ts:79-84`; `run-executor.ts:232` | Log the fallback as a run event; fetch the PR head or drop the git path; paginate; do not mark an empty or partial diff reviewed |
| BE-12 | medium | S–M | No dedupe or concurrency cap on review runs; jobs left `queued` or `running` by a restart are lost (see DB-6) | `modules/reviews/service.ts:94-129`; `platform/jobs.ts` | Queue runs with a small concurrency; return the active run for `(prId, agentId)`; reap or re-enqueue jobs on boot |
| BE-13 | medium | M | Agents routes are not thin (seven handlers throw the 404 themselves, one chooses between two service calls) and the agent shape is declared four times | `modules/agents/routes.ts:33-57,92-106,148-175`; `agents/service.ts:22-46`; `ports.ts:19-32`; `domain.ts:8-19` | The service throws `NotFoundError`; one method per use case; body schemas in the shared contract |
| BE-14 | medium | M | No unit test with in-memory ports for `ReviewService`, the run executor, `AgentsService`, `JobRunner`, `RunBus`, run cancellation, the error handler or `OpenRouterProvider`; their only coverage needs Docker | `server/test/`, `reviewer-core/test/` | Add them with BE-1, BE-2, BE-7 |
| BE-15 | low | S each | Tests are not type-checked (`tsconfig` includes `src` only; one test imports a path that does not exist); `REPO_INTEL_ENABLED=0` means enabled; shutdown has no time limit and does not drain runs; the stored verdict is the model's even when grounding drops every finding; unused `model-router.ts`, `trace-builder.ts`, `prompts.ts`; a port for the pure `parseUnifiedDiff` | `server/tsconfig.json`; `platform/config.ts:105-106`; `server.ts:12-26`; `reviewer-core/src/review/run.ts:208`; `reviews/ports.ts:131` | One at a time, with the area it belongs to |

Done well, keep: services on one `deps` object typed by narrow ports; pure
domain rules that take the clock as an argument; Zod on every params and body;
named errors; loopback bind with the Host and Origin guard, helmet, CORS
allowlist, body limit and rate limits; hand-written in-memory fakes in service
tests; `reviewer-core` with its one I/O point and a recomputed score.

BE-3 and BE-4 break a repo-wide rule in the root `AGENTS.md`. The security pass
rated their exposure medium, because both need a hostile PR and a model that
goes along with it.

## 6. Contracts, security, TypeScript, CI — `zod`, `security`, `typescript-expert`

All four typechecks and `pnpm deps:validate` pass. The security pass found
nothing exploitable without a malicious PR plus a compliant model, and no
contract mismatch that breaks a screen today.

| ID | Sev | Effort | What | Evidence | Fix |
|---|---|---|---|---|---|
| XC-1 | medium | S | CI has never run on this fork and `main` is unprotected, so every gate in this plan, including the new import-boundary step, has never executed. Confirmed (0 workflow runs; "Branch not protected") | `.github/workflows/*.yml`; `server-unit.yml:73` | Enable Actions on the fork, push once to prove all five workflows pass, protect `main` with one always-running aggregator check |
| XC-2 | medium | S, or M | The two contract copies differ in 5 files. The server copy is a superset; the client copy lacks `'openrouter'` in two provider enums and has no `AgentVersion`. Nothing breaks today because the client uses the copy for types only. Confirmed | `diff -rq server/src/vendor/shared client/src/vendor/shared`; `contracts/eval-ci.ts` (server `:249`, client `:220`); `productionize.ts:36` | Cheapest: sync once and add a CI `diff -r` step. Better: alias the client to the server copy as `reviewer-core` does and delete the client copy (type-checks with 0 errors; `next build` with it not verified). Either way reuse `Provider` instead of the two inline enums. Changes the root rule about two copies: needs a decision |
| XC-3 | medium | M | The client never validates a response: `apiFetch` and the SSE parser cast. One call is already typed wrong (`POST /repos/:id/refresh` typed as `Repo`, returns `{ status }`) | `client/src/lib/api.ts:62`; `lib/hooks/reviews.ts:184`; `lib/hooks/core.ts:85` | With BE-6: response schemas on the routes the UI renders first; an integration test that parses each response is the cheaper first step |
| XC-4 | medium | M | Server and reviewer-core tests are never type-checked and 19 errors have accumulated, including imports of modules that no longer exist. Confirmed (`include` is `src/**` only) | `server/tsconfig.json:28`; `reviewer-core/tsconfig.json:28`; `server/test/settings-test-connection.test.ts:4-6` | A `tsconfig.test.json` per package, fix the 19 errors, add a CI step |
| XC-5 | medium | S, then M | No output-token cap, no spend budget, no dedupe of concurrent runs, no cap on diff size. A recorded run used 264K completion tokens over 20 minutes. Confirmed (`maxTokens` is never passed) | `reviewer-core/src/llm/openrouter.ts:73`; `reviewer-core/src/review/run.ts:174-181`; `server/src/modules/reviews/service.ts:124` | A `maxTokens` default; refuse a second run for the same PR and agent while one runs (with BE-12); cap the diff with a visible "truncated" line; optionally a daily USD ceiling |
| XC-6 | medium | S | The "hermetic" e2e stack still loads the real `server/.env` and the real secrets file, so it calls GitHub with the user's token; it only warns when `agent-browser` is missing and can exit green without running. Confirmed for the script | `scripts/e2e.sh:40-43,51-52,113-117`; `server/src/platform/config.ts:101` | A `DEVDIGEST_SECRETS_PATH` variable pointed at an empty file; empty provider keys; exit 1 when the runner is missing |
| XC-7 | medium | S | Flows 04 and 05 click the PR row without waiting for it to render; both have failure screenshots showing the list still loading. Confirmed for the missing wait | `e2e/specs/04-pr-findings.flow.json`, `05-pr-diff.flow.json` | Add the `wait --text` step that flow 02 already has |
| XC-8 | low | S | `PUT /settings` accepts and stores any key: `Settings` is `passthrough()` and the repository upserts everything it is given. Confirmed | `server/src/vendor/shared/contracts/platform.ts:99-102`; `modules/settings/repository.ts:25-34` | `SettingsUpdate = SettingsKnown.partial().strict()` in both copies |
| XC-9 | low | M | Hand-written types beside schemas on both sides; `CreateAgentInput` on the client already lacks two fields | `client/src/lib/hooks/agents.ts:23`, `reviews.ts:19,99`, `repo-intel.ts:14`; see BE-13 | Move the bodies into shared, derive update from create with `.partial()`, use `z.infer` |
| XC-10 | low | S–M | Loose primitives in transport schemas: status and provider as `z.string()`, no `.datetime()` or `.uuid()` anywhere | `contracts/trace.ts:77,100,102`; `platform.ts:212,239` | Enums for `RunSummary.status` and `provider` first. Pays off only after BE-6 |
| XC-11 | low | S | CI path filters miss two alias dependencies; several checks are not gated at all | `server-integration.yml:16-22` and `e2e-web.yml:12-24` omit `reviewer-core/**`; no lint, no dependency audit, no `e2e` typecheck, no `timeout-minutes`; integration tests self-skip without Docker | Add the paths; fail the integration lane when `CI=true` and Docker is missing; pin `agent-browser` |
| XC-12 | low | S | Git ref names from GitHub reach `git diff` and `git fetch` without `--end-of-options`; reviews silently cover at most 100 files | `server/src/adapters/git/simple-git.ts:222-233`; `adapters/github/octokit.ts:79-84` | Reject refs starting with `-`, add `--end-of-options`; paginate (with BE-11) |
| XC-13 | low | S | `pnpm build` and `pnpm start` in `server/` cannot work: the emitted layout is wrong and the path aliases are unresolved | `server/package.json`; root `README.md:147` | Delete both scripts and say the server runs through `tsx`, or bundle |
| XC-14 | low | S | Strictness: four flags raise 0 errors in every package (`verbatimModuleSyntax`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`); `e2e` has `strict` only | measured per package | Enable the free ones everywhere (with NX-6) |
| XC-15 | low | L | Dependency audit: one high advisory on Zod 3 in three packages, patched only in Zod 4; two moderate on next-intl that do not apply to this setup (inference) | `pnpm audit --prod`, `npm audit --omit=dev` | Plan the Zod 4 upgrade separately; the 1 MB body limit bounds the request path today |
| XC-16 | low | S | Docs ask for a classic PAT with `repo` scope; the starter needs a fine-grained token with four permissions | `server/.env.example:11`; `server/README.md:103` | Document the fine-grained scopes |

e2e covers boot, the PR list and detail, the findings and diff tabs, the agents
list, and the onboarding and settings screens rendering. It does not cover
running a review, accept and dismiss, cancel, the trace drawer, or any form
submit, because flows never write or call an LLM. An env switch that selects
the existing `MockLLMProvider` at boot (effort M) would let one flow cover
run → live log → findings.

Done well, keep: secrets behind one provider and never in the database; the
loopback bind with Host and Origin allowlists; clone safety (validated owner
and name, containment check, token as a per-command header, no symlinks);
Markdown without raw HTML and a CSP; zero `any` and zero `@ts-ignore` in source.
