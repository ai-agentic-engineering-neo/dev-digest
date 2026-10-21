# Plan: PR Brief · branch feat/pr-brief

Design-system task: no (no change under `client/src/vendor/ui/`; the token formatter goes to `client/src/lib/format-cost.ts`, every new component stays page-local; `CircularScore`, `Badge`, `Card`, `Icon`, `IconBtn`, `Skeleton` and `SEV` are reused from the barrel)
Execution mode: multi-agent
Requirements source: specs/pr-brief.md (SPEC-03, draft; draft status accepted by the main session for the autonomous run)

Status: READY. The eight unknowns in the brief were decided by the main session (M1–M8 below). The planner's own defaults are D1–D8. A cross-model review was applied on 2026-10-21 (see the last section). Nothing blocks.

Inputs: `.pipeline/feat-pr-brief/brief.md` (haiku researcher, 2026-10-21). Its facts are taken as established. "unverified" means the planner did not open that file; the implementer confirms it while building the row.

## Requirements review

| Id | Requirement (spec wording, shortened) | Verdict | Evidence | Covered by |
|---|---|---|---|---|
| AC-1 | Overview tab: Brief card first, Intent + Blast grid, Review focus full-width below | OK | `OverviewTab.tsx:21-27` (section, `briefGrid`) | rows 30, 31, 32 |
| AC-2 | "Risk areas" inside Intent card under scope lists; no heading when no risks / no brief | OK | insert point `IntentCard.tsx:158-166` (brief) | rows 33, 34 |
| AC-3 | Intent, Blast and description unchanged when no brief | OK | — | rows 30, 34 |
| AC-4 | No brief, no run: "Generate brief" with tooltip `<provider>/<model>` | OK | tooltip names the current workspace feature model (D5) | rows 26, 31 |
| AC-5 | Generate / regenerate calls `POST /pulls/:id/brief/generate` | OK | — | rows 16, 26, 31 |
| AC-6 | While running: spinner, disabled, previous brief kept, poll GET | OK | polling pattern `client/src/lib/hooks/onboarding.ts:20-44` | rows 26, 31 |
| AC-7 | Stored brief: verdict tile + label, findings badge, (i), summary, regenerate, score ring, cost line | OK | `CircularScore` used at `VerdictBanner.tsx:52` | row 31 |
| AC-8 | Failed run: previous brief or Generate state + inline error, no toast | OK | failure is a run status, not a mutation error, so `providers.tsx` does not toast | rows 15, 31 |
| AC-9 | Loading skeleton; GET error → inline error + Retry; other cards still render | OK | `IntentCard.tsx:65-119` states | rows 30, 31 |
| AC-10 | Verdict, score, counts from newest `reviews.kind = 'review'` across agents, at read time | OK | `server/src/db/schema/reviews.ts:23-26` | rows 13, 14, 15 |
| AC-11 | findings = non-dismissed; blockers = non-dismissed `CRITICAL` | OK | `reviews.ts:39,48` | row 14 |
| AC-12 | Verdict label + colour from the `VerdictBanner` mapping | OK | `VerdictBanner/constants.ts:5-17` | row 31 |
| AC-13 | (i) on hover/focus: agent name, review time, "written by the brief model" | OK | no tooltip primitive in `@devdigest/ui` (grep found none): local hover/focus popover; it also names the stored brief's model (D5) | row 31 |
| AC-14 | No review: neutral "Not reviewed yet", no ring, no badge, hint; text sections still shown | OK | — | row 31 |
| AC-15 | After a review or dismiss/accept, card reflects it after refetch, no regeneration | OK | invalidate `["pr-brief", prId]` on run done and on finding action | rows 28, 36 |
| AC-16 | Cost line `formatCost(cost_usd)` + `<in>→<out>` of the brief call; "—" when null | OK (formatter added) | no existing formatter gives `8.2K→1.3K` (brief §4.2) | rows 25, 31 |
| AC-17 | Cost line click sets `trace=<run_id>` → `RunTraceDrawer` | OK | `page.tsx:183-190`; drawer title falls back to `config.agent` (brief §4.1) | rows 15, 31, 36 |
| AC-18 | Every generation is an `agent_runs` row, `kind = 'brief'`, `agent_id` null, usage, status, error | OK | `server/src/db/schema/runs.ts:8-33` | rows 6, 14, 15 |
| AC-19 | `run_traces` doc: prompt, raw output, log lines (inputs/caps, call, refs dropped) | OK | `RunTrace` `contracts/trace.ts:107-124` | rows 13, 15 |
| AC-20 | Log lines via `RunLogger` (SSE, trace, pino) | OK | `server/src/platform/run-logger.ts:36-97` | rows 12, 15, 16 |
| AC-21 | Exactly one structured call, `maxRetries: 0`, trace lists one `generate_brief` tool call | OK with D1 (spec AC-21 being reworded to match D1) | all three adapters honour `req.maxRetries` for the reprompt loop: `reviewer-core/src/llm/openrouter.ts:61,68`, `server/src/adapters/llm/openai.ts:90,96`, `server/src/adapters/llm/anthropic.ts:92,99` | rows 15, 22 |
| AC-22 | No model call on GET, page load, intent derivation, or anything but POST generate | OK | — | rows 15, 23 |
| AC-23 | `kind = brief` excluded from agent stats, active runs, Findings live UI, Run history; included in cost rollup | OK | `run.repo.ts:11-29,41-51,138-160`; `agents/repository.ts:259-268` | rows 9, 10, 23 |
| AC-24 | POST → 202 + running run; work in a background job | OK | `onboarding/routes.ts:35-40`, M1 | rows 15, 16 |
| AC-25 | One running brief run per PR; young → returned; older than stale limit → failed as abandoned, new run | OK | `onboarding/service.ts:58-86`, `server/INSIGHTS.md:39` (partial unique index + 23505) | rows 6, 14, 15 |
| AC-26 | Per-route rate limit 6/min on POST | OK | syntax `reviews/routes.ts:41` | row 16 |
| AC-27 | Model from `container.featureModel(ws, 'risk_brief')` | OK | `container.ts:211-213` | row 16 |
| AC-28 | `risk_brief` default `openrouter` / `deepseek/deepseek-v4-flash`, label "PR Brief", new description; override wins | OK | `contracts/platform.ts:59-65`, client mirror `client/src/lib/feature-models.ts:28-34`, test `server/test/settings-models.it.test.ts:59-62` | rows 3, 5, 24 |
| AC-29 | Inputs chosen in code: title, branch, body; files+patches in Smart Diff order; findings of newest review; stored intent (never derived); blast when index usable | OK with D2 | Smart Diff order `smart-diff/helpers.ts:41-52`; intent port `reviews/ports.ts:53-60` | rows 12, 13, 15, 18 |
| AC-30 | Caps: 6 000/file, 60 000 total, overflow files named only, 30 findings (title, severity, file:line, 200 chars), 10 symbols × 5 callers | OK | constants pattern `onboarding/constants.ts:6-7` | rows 11, 13 |
| AC-31 | `done` → brief + metadata replaced in one transaction; `failed` → stored brief untouched | OK | — | rows 14, 15 |
| AC-32 | Output not matching `PrBriefDraft` → failed "model returned an invalid brief", no second call | OK | adapters throw on schema failure (`openrouter.ts:115`, `openai.ts:132`, `anthropic.ts:147`); pattern `onboarding/service.ts:141-147` | rows 13, 15 |
| AC-33 | No API key → failed, error names the provider | OK (M3) | `ConfigError` names the env var (`container.ts:288,296,303`) | rows 13, 15 |
| AC-34 | summary ≤ 400 chars, 3–5 risks, ≤ 6 focus items, trimmed in code | OK | "3 to 5" read as "at most 5, keep what survives" (EC-5) | row 13 |
| AC-35 | Index degraded or `REPO_INTEL_ENABLED` off → brief without blast | OK | `BlastService.get` returns `degraded` (`blast/service.ts:20-24`) | rows 15, 16 |
| AC-36 | Drop focus items and risks whose path is not a changed file | OK | — | row 13 |
| AC-37 | Line/range outside new-side hunks → keep without line; partial range → clip | OK with D3 | `reviewer-core` grounding is not importable here (`server/.dependency-cruiser.cjs:133-138`); new pure hunk parser | row 13 |
| AC-38 | Focus item `{path, line\|null, reason}`; risk ref `path`, `path:line`, `path:start-end` | OK | — | rows 1, 13 |
| AC-39 | No surviving risk → empty list, no section; no surviving focus → explicit empty note; no invented items | OK | — | rows 13, 32, 33 |
| AC-40 | Risk chip: kind icon, title, mono ref, chevron; expanded: explanation + severity from `SEV` | OK with D6 | `SEV` `client/src/vendor/ui/primitives/tokens.ts:6` | row 33 |
| AC-41 | `Risk.kind` closed enum; generic icon for any other stored value | OK | `brief.ts:88` is `z.string()` today | rows 1, 33 |
| AC-42 | Review focus card: count badge, `path:line — reason` rows, model order | OK | — | row 32 |
| AC-43 | Click → same PR with `tab=diff`, `file`, `line` (omitted when none) | OK | `page.tsx:66-74` | rows 35, 36 |
| AC-44 | Files changed with `file`: expand file + role group, scroll, line scroll + brief highlight | OK (M8) | open state read at mount only: `RoleGroup.tsx:25`, `FileCard.tsx:48-50` | rows 37–41 |
| AC-45 | Unknown file or unrendered line → normal tab, no error, no toast | OK | — | row 37 |
| AC-46 | `file`/`line` stay in URL; `file` matched only against changed paths | OK | — | rows 36, 37 |
| AC-47 | `stale` = head sha differs, or newest review id differs from `source_review_id`; model change / dismiss / accept do not | OK | — | rows 13, 15 |
| AC-48 | "Out of date" badge + hint; no auto-regeneration | OK | — | row 31 |
| AC-49 | `files_included < files_total` → "Based on X of Y files" | OK | — | rows 13, 31 |
| AC-50 | `GET /pulls/:id/brief` → `PrBriefView {brief, review, run, stale}`; DB only | OK | `onboarding/service.ts:43-55` | rows 1, 14, 15, 16 |
| AC-51 | Reload shows stored brief, no generation | OK | — | rows 26, 44 |
| AC-52 | Both routes through `getContext()`, PR scoped to workspace, unknown PR → 404 envelope | OK | `pr_brief` has no `workspace_id` (`reviews.ts:74-79`): scope through `pull_requests.workspace_id` | rows 14, 16 |
| AC-53 | Replace composed `PrBrief` with `PrBriefDraft`, `PrBrief`, `PrBriefReview`, `PrBriefView`; keep the rest apart from `Risk.kind`; copy to client | OK | `brief.ts:157-164` dead (brief §2); only re-export `client/src/lib/types.ts:35` keeps compiling | rows 1, 4 |
| AC-54 | Extend `pr_brief` with metadata columns, add `agent_runs.kind`, via `pnpm db:generate`; no migrate on boot | OK (M2) | — | rows 6, 7, 8 |
| AC-55 | Stored `json` validated on read; invalid → no brief | OK | — | rows 13, 14 |
| AC-56 | Strings in `messages/en/brief.json` (camelCase), CSS variables only, keyboard-operable controls with accessible names | OK (M5) | `brief.json:1-19` unused (no `useTranslations("brief")`) | rows 29–33 |
| EC-1 | Never reviewed: Generate works, neutral tile | OK | — | AC-14 · rows 13, 31 |
| EC-2 | Review finishes mid-run: run keeps its start review id; "Out of date" afterwards | OK | review id and head sha captured in `generate()` and passed in the job payload (D8) | AC-47 · row 15 |
| EC-3 | New commit: "Out of date", old brief stays | OK | — | AC-47 · rows 13, 31 |
| EC-4 | Huge diff: capped input, "Based on X of Y" | OK | — | AC-30, AC-49 · row 13 |
| EC-5 | One tiny file: fewer than 3 risks survive, no filler | OK | — | AC-34 · row 13 |
| EC-6 | Path not in PR dropped silently | OK | — | AC-36 · row 13 |
| EC-7 | Line outside hunks: path without line; click opens the file | OK | — | AC-37, AC-43 · rows 13, 35 |
| EC-8 | Two clicks / two tabs: one run | OK | partial unique index | AC-25 · rows 6, 15, 23 |
| EC-9 | Orphaned run: next Generate fails it after 10 min; boot reaps `running` | OK | boot reap is kind-agnostic (`run.repo.ts:201-208`) | AC-25 · row 15 |
| EC-10 | Regenerate fails: previous brief, inline error, enabled again, no toast | OK | — | AC-8, AC-31, AC-32 · rows 15, 31 |
| EC-11 | No key: failed, names provider | OK | — | AC-33 · row 15 |
| EC-12 | Index not built: no blast input | OK | — | AC-35 · row 15 |
| EC-13 | Old/invalid stored json: Generate state | OK | — | AC-55 · row 14 |
| EC-14 | Secret in diff: prompt forbids quoting values | OK | — | row 17 |
| EC-15 | Summary disagrees with verdict: verdict tile is the review's | OK | model schema has no verdict/score field | AC-10 · rows 1, 31 |
| EC-16 | Deep link to collapsed file / group: both expand, line highlighted | OK | — | AC-44 · rows 37–41 |
| EC-17 | Deep link to a removed file: normal tab | OK | — | AC-45 · row 37 |
| EC-18 | PR deleted mid-run: final write finds none, ends silently | GAP → D4 (spec EC-18 revised on 2026-10-21, commit 850dfc1, to match D4: run row survives with `pr_id` null, marked failed, job ends silently) | `agent_runs.pr_id` is a pre-existing `ON DELETE SET NULL` FK (`runs.ts:14`) and stays; only `pr_brief` cascades | row 15 |
| EC-19 | Brief run never shown as a review in Run history / active runs | OK | — | AC-23 · row 9 |
| EC-20 | No clipboard action | OK | — | — |
| EC-21 | Postgres unavailable: inline error + Retry | OK | — | AC-9 · row 31 |
| NFR-1 | One call per generation; read makes no model, GitHub or git call | OK | GET reads DB only; generation reads `pr_files`, no git (D2) | rows 14, 15 |
| NFR-2 | Input caps are constants, not settings | OK | — | row 11 |
| NFR-3 | Cost and tokens on run row and stored brief; null → "—" | OK | — | rows 14, 25 |
| NFR-4 | Background job, never blocks; stale limit 10 min | OK (M1) | job timeout 120 s `jobs.ts:49`; a timed-out handler is not retried (`resilience.ts:35-44`: `TimeoutError` has no status) | rows 11, 15 |
| NFR-5 | Run and brief written so run-first readers never see `done` without brief | OK | one transaction; read order per `server/INSIGHTS.md:52` | rows 14, 15 |
| NFR-6 | Secrets via `container.secrets`; logs carry counts/paths/ids only | OK | — | rows 15, 16 |
| NFR-7 | Mutation toast policy applies; inline failure not toasted | OK | — | rows 26, 31 |
| NFR-8 | Keyboard, accessible names, `aria-busy`, CSS variables + `SEV` only | OK | — | rows 31–33, 38–41 |
| NFR-9 | Onion: `modules/pr-brief/` trio + ports, deps in routes, `lint:arch` clean; reviewer-core builder pure | OK with D3 | no reviewer-core change: `pr-brief` may not import it (`.dependency-cruiser.cjs:133-138`) | rows 11–19 |
| NFR-10 | GET answers with one round of indexed reads | OK | new index on `agent_runs (pr_id, kind, ran_at)` | rows 6, 14 |
| OQ-1 | `RunTraceDrawer` with no findings, non-review `config.agent` | Resolved | title falls back to `config.agent` (`RunTraceDrawer.tsx:73`); empty findings note (`FindingsSection.tsx:26-27`); `config.agent = "PR Brief"` | row 15 |
| OQ-2 | Compact token formatter | Resolved | add `formatTokenPair` to `client/src/lib/format-cost.ts` (`8190, 1300` → `8.2K→1.3K`) | row 25 |
| OQ-3 | `RoleGroup` open state | Resolved (M8) | `forceOpen` prop + effect | rows 38, 40 |
| OQ-4 | Readers needing the `kind` filter | Resolved (M7) | `activeRunsForPull`, `listRunsForPull`, `statsByAgent`; not `costRollupForPulls`; "Agent runs" tab label uses findings count (`PrDetailHeader.tsx:117`), no change | rows 9, 10 |

## Suggestions (optional)

None. The spec already settles scope; the defaults below cover the gaps.

## Goal & acceptance criteria

The spec's criteria AC-1 to AC-56 apply verbatim and completely; they are not restated here (source: `specs/pr-brief.md:46-130`). Verification per criterion:

- [ ] AC-1, AC-2, AC-3, AC-9, AC-14 — `OverviewTab`/`PrBriefCard.test.tsx`, `RiskAreas.test.tsx`, `IntentCard.test.tsx` (existing, must stay green); e2e `16-pr-brief`
- [ ] AC-4 to AC-8, AC-12, AC-13, AC-16, AC-17, AC-48, AC-49 — `PrBriefCard.test.tsx`
- [ ] AC-10, AC-11, AC-15, AC-47, AC-50, AC-52, AC-55 — `server/test/pr-brief.it.test.ts`; AC-15 also `PrBriefCard.test.tsx` (refetch after invalidation)
- [ ] AC-18 to AC-22, AC-24, AC-25, AC-27, AC-29, AC-31 to AC-33, AC-35 — `server/test/pr-brief-service.test.ts`; AC-18, AC-19, AC-24, AC-25, AC-31 also `pr-brief.it.test.ts`
- [ ] AC-23 — `pr-brief.it.test.ts` (`GET /pulls/:id/runs`, `GET /pulls/:id/runs/active`, agent stats, PR list cost)
- [ ] AC-26 — `pr-brief.it.test.ts` (7th POST within a minute → 429) or route options asserted in `pr-brief-service.test.ts` if the it-app disables rate limiting (unverified)
- [ ] AC-28 — `server/test/settings-models.it.test.ts`
- [ ] AC-30, AC-34, AC-36 to AC-39 — `server/test/pr-brief-helpers.test.ts`
- [ ] AC-40 to AC-42 — `RiskAreas.test.tsx`, `ReviewFocusCard.test.tsx`
- [ ] AC-43 to AC-46 — `OverviewTab/helpers.test.ts`, `DiffTab/helpers.test.ts`, `RoleGroup.test.tsx` (new), e2e `16-pr-brief`
- [ ] AC-51 — e2e `16-pr-brief` (seeded brief shown after load, no generate call)
- [ ] AC-53, AC-54 — `verify.sh` contract-copy check, `pnpm typecheck`, generated migration committed
- [ ] AC-56 — component tests query by role/name; review of `styles.ts` (CSS variables only)
- [ ] TC-1 Contract copies under `client/src/vendor/shared/contracts/{brief,trace,platform}.ts` are byte-identical to the server copies — verified by `verify.sh run` (drift check)
- [ ] TC-2 `pnpm lint:arch` passes with no new baseline entry — verified by `verify.sh run`
- [ ] TC-3 The new migration is generated (no hand edits) and applies on a clean DB — verified by `verify.sh run --with-it`
- [ ] TC-4 The brief's model call is wrapped in a deadline below the 120 s job timeout (`BRIEF_CALL_TIMEOUT_MS`) — verified by `pr-brief-service.test.ts` (a never-resolving fake LLM ends the run `failed` with a timeout error)

## Out of scope

- Workspace scoping of `GET /runs/:id/trace` (M6). The route stays as is (`reviews/routes.ts:133-138`); listed under risks.
- Changing transport-level retries inside the LLM adapters (D1).
- Changing the `agent_runs.pr_id` delete rule (D4).
- Exporting `buildLineIndex` from reviewer-core or adding a reviewer-core prompt builder (D3).
- Specs and docs: `server/specs/`, `client/specs/pages.md` (new `file`/`line` params), `e2e/README.md` coverage row, READMEs. These belong to `doc-writer` after implementation. Spec revisions for EC-18 and AC-21 belong to `spec-creator`.
- MCP tool, auto-generation, cancel, per-brief model picker (spec non-goals).

## Relevant INSIGHTS

- `server/INSIGHTS.md:39` — orphaned background run is failed after the stale limit; the partial unique index turns a race into 23505 and the existing run is returned → rows 6, 15
- `server/INSIGHTS.md:52` — read the run first, then the result, never in `Promise.all` → rows 14, 15 (view)
- `server/INSIGHTS.md:82` — `completeAgentRun` before `saveRunTrace`; tests wait for the trace row → row 14 (one transaction makes the order moot), row 23
- `server/INSIGHTS.md:43` — `pr_files` and body are written only by `GET /pulls/:id` → D2 (the brief is generated from the PR page, so they exist; an empty file list is handled)
- `server/INSIGHTS.md:38` — sibling modules reach each other through the container and structural ports → rows 12, 18
- `server/INSIGHTS.md:70` — `ContainerOverrides` has no `reposRepo`; 404 and 202 are only testable in `.it.test.ts` → row 23
- `server/INSIGHTS.md:31` — PR-list cost is a read-time rollup over done runs → brief cost flows in with no change (row 9 must not filter it)
- `client/INSIGHTS.md:74` — PR BRIEF `briefGrid` layout → row 30
- `e2e/INSIGHTS.md:50` — seeded-row flows with no model call; `e2e/INSIGHTS.md:19` — clicks below the fold in a page-internal scroll pane do not navigate (scroll the focus card into view first) → row 44

## Architecture constraints

| Rule / limit | Applies to | How the plan complies |
|---|---|---|
| reviewer-core-boundary (`.dependency-cruiser.cjs:133-138`) | `modules/pr-brief/*` | no reviewer-core import; prompt builder, untrusted wrapper and hunk parser are pure helpers in `pr-brief/helpers.ts` (copy `onboarding/helpers.ts:60-100`) |
| no-cross-module | pr-brief → reviews (intent), smart-diff, blast | `container.intentRepo` (exists), new `container.smartDiffService` and `container.blastService` getters; structural `IntentReader`, `SmartDiffReader`, `BlastReader` in `pr-brief/ports.ts`; pr-brief repository writes `agent_runs`/`run_traces` itself, never imports `reviews/repository` |
| application-no-container | `pr-brief/service.ts`, `helpers.ts` | explicit deps object built in `routes.ts` (pattern `onboarding/routes.ts:17-28`) |
| application-no-row-types | service, helpers | repository maps rows to DTOs (`RunSummary`, `PrBrief`, structured inputs) |
| routes-no-persistence | `pr-brief/routes.ts` | routes call the service only; repo comes from `c.prBriefRepo` typed as the port |
| ports-are-pure | `pr-brief/ports.ts` | interfaces and plain types only |
| Contracts canonical in server, copied to client | rows 1–4 | edit server copy, copy file verbatim; grep new names first (`PrBriefDraft`, `PrBriefReview`, `PrBriefView`, `PrBriefFocusItem`, `RiskKind`, `RunKind`) to avoid TS2308 |
| Migrations only via `pnpm db:generate` | rows 6–8 | never hand-edit the SQL or `meta/` |
| Client: `page.tsx` thin, `_components/<Name>/`, data via hooks + `api.*` | rows 26–41 | new hook file `hooks/brief.ts`; no raw `fetch`; components page-local |
| `client/src/components/diff-viewer` minimal (M8) | rows 39–41 | optional props only; existing callers unchanged |
| Do-not-touch | all | no lockfile, `vendor/ui`, client contract edits by hand, committed migrations |

## Existing patterns to follow

- GET view + POST 202 + job + stale reap + 23505 → copy `server/src/modules/onboarding/{routes,service,constants,ports}.ts` (`service.ts:43-86`, `:89-188`)
- Untrusted blocks and message building → `server/src/modules/onboarding/helpers.ts:60-100`
- Schema-failure detection and error text → `onboarding/helpers.ts:233-250` (`isSchemaFailure`, `runErrorText`)
- Partial unique index on a running run → the onboarding runs table in `server/src/db/schema/` (unverified file name; grep `one_running_uidx`)
- Run trace shape and write → `server/src/modules/reviews/run-executor.ts:313-371`; RunLogger construction `run-executor.ts:72-77`
- Rate limit option → `server/src/modules/reviews/routes.ts:41`
- Container getter for a sibling service → `container.ts:202-208` (`skillsService`, `agentsService`); repo getter with override → `container.ts:157-159`
- Polling query + generate mutation keeping old data → `client/src/lib/hooks/onboarding.ts:20-44`
- Card states (loading, error+retry, empty, data) → `OverviewTab/_components/IntentCard/IntentCard.tsx:65-119`
- Verdict tile + score ring → `VerdictBanner/VerdictBanner.tsx`, `VerdictBanner/constants.ts:5-17`
- Server tests → `server/test/onboarding-helpers.test.ts`, `onboarding-service.test.ts`, `onboarding.it.test.ts`, `test/helpers/onboarding.ts`
- e2e seeded flow → `e2e/specs/15-onboarding-tour.flow.json`, seed rows `server/src/db/seed.ts:481,501`

## Decisions taken by the main session (not re-asked)

- M1 Background job via `jobs.enqueue`; handler never throws; explicit per-call timeout below 120 s.
- M2 `pr_brief.run_id` is a plain nullable uuid (no FK).
- M3 The brief module builds "No API key configured for `<provider>`" from the `ConfigError`.
- M4 Pass `maxRetries: 0`; verified: all three adapters honour it for the reprompt loop (see AC-21 evidence).
- M5 Replace the unused keys in `client/messages/en/brief.json`.
- M6 `/runs/:id/trace` scoping unchanged.
- M7 `RunSummary.kind`; `listRunsForPull` and `activeRunsForPull` filter `kind = 'review'`; cost rollup keeps all kinds.
- M8 Deep link: controlled open on `RoleGroup`/`FileCard` from `file`/`line`, `data-line` anchor, one-off scroll + 2 s highlight; diff-viewer changes minimal.

## Decisions taken by default

- D1 AC-21 means one structured call with no reprompt (`maxRetries: 0`) and no intent derivation. An adapter's transport-level retry of the same request after a 429/5xx/network error is not a second call and is not disabled (`openrouter.ts:55` SDK `maxRetries: 2`; `withRetry` in `openai.ts:97`, `anthropic.ts:100`). The spec's AC-21 is being reworded the same way. The trace records one `generate_brief` tool call with `attempts` from the result. OpenRouter ignores `req.timeoutMs` (client timeout fixed at 90 s, `openrouter.ts:54`), so the service wraps the call in `withTimeout(…, BRIEF_CALL_TIMEOUT_MS = 90_000)` from `platform/resilience.ts` and also passes `timeoutMs` (honoured per attempt by OpenAI/Anthropic).
- D2 Diff source is the persisted `pr_files` patches (no git read): the Files changed tab renders the same patches, so a verified line is a rendered line (AC-44). `files_total` = changed files of the PR; files with a null patch count as "named only".
- D3 No reviewer-core change. The pr-brief module cannot import reviewer-core (`.dependency-cruiser.cjs:133-138`), so the hunk parser (new-side line numbers, same counting as `client/src/components/diff-viewer/helpers.ts:16-34`), the untrusted wrapper and the message builder are pure functions in `pr-brief/helpers.ts`.
- D4 EC-18: the pre-existing `agent_runs.pr_id` FK is `ON DELETE SET NULL` (`runs.ts:14`) and stays. When the final write fails with 23503 (the PR and its `pr_brief` row are gone) or the PR lookup returns nothing, the run is marked `failed` with "Pull request was removed" outside the transaction and the handler returns silently; the `agent_runs` row survives with `pr_id` null. The spec's EC-18 is being revised to match.
- D5 Tooltips (AC-4, AC-7, AC-13): the Generate button and the regenerate icon always name the current workspace feature model, `<provider>/<model>` of `risk_brief` from the settings hook (`useSettings` in `client/src/lib/hooks/core.ts:21`) with the registry default from `client/src/lib/feature-models.ts` as fallback. The stored brief's model appears only in the (i) info popover and on the cost line.
- D6 Risk severity to `SEV` tokens: `high` → `CRITICAL`, `medium` → `WARNING`, `low` → `SUGGESTION` (constant in `RiskAreas/constants.ts`).
- D7 The deep link's `line` for a range reference is its start line; a risk with several `file_refs` renders one clickable ref per entry.
- D8 `source_review_id` and `head_sha` are captured in `generate()` and passed in the job payload, so a review that lands mid-run makes the new brief stale (EC-2).

## Work breakdown (ordered)

| # | Package | Module / ring | File (new/edit) | Change | Skills to apply | Test |
|---|---|---|---|---|---|---|
| 1 | server | vendor/shared · 0 | `src/vendor/shared/contracts/brief.ts` (edit) | `RiskKind = z.enum(['auth','dependency','performance','data','api_change','config','other'])`, `Risk.kind: RiskKind`; delete composed `PrBrief`; add `PrBriefFocusItem {path, line: int nullable, reason}`, `PrBriefDraft {summary, risks, review_focus}` (no verdict/score fields, no length limits: trimming is code), `PrBrief` (spec field list, `cost_usd`/`source_review_id` nullable, `run_id` nullable), `PrBriefReview`, `PrBriefView {brief, review, run: RunSummary nullable, stale}` (import `RunSummary` from `./trace.js`; check for an import cycle with `review-api.ts`) | zod, typescript-expert | row 21 |
| 2 | server | vendor/shared · 0 | `src/vendor/shared/contracts/trace.ts` (edit) | `RunKind = z.enum(['review','brief'])`; `RunSummary.kind: RunKind` | zod | rows 9, 23 |
| 3 | server | vendor/shared · 0 | `src/vendor/shared/contracts/platform.ts` (edit) | `risk_brief`: label "PR Brief", description "Writes the PR brief (summary, risks, review focus)", default `openrouter` / `deepseek/deepseek-v4-flash` | zod | row 24 |
| 4 | client | vendor/shared copy | `src/vendor/shared/contracts/{brief,trace,platform}.ts` (copy) | copy rows 1–3 verbatim (no hand edit) | — | TC-1 |
| 5 | client | lib | `src/lib/feature-models.ts` (edit) | mirror row 3 (label, description, default) | react-frontend-architecture | typecheck |
| 6 | server | db schema · 3a | `src/db/schema/runs.ts` (edit) | `kind: text('kind', { enum: ['review','brief'] }).notNull().default('review')`; partial unique index `agent_runs_one_running_brief_uidx` on `(pr_id)` where `kind = 'brief' and status = 'running'`; index `agent_runs_pr_kind_ran_at_idx` on `(pr_id, kind, ran_at)`; `pr_id` delete rule unchanged (D4) | drizzle-orm-patterns, postgresql-table-design | row 23 |
| 7 | server | db schema · 3a | `src/db/schema/reviews.ts` (edit) | `pr_brief`: add nullable `generated_at` (timestamptz), `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd` (double), `head_sha`, `source_review_id` (uuid), `run_id` (uuid, no FK, M2), `files_total`, `files_included` | drizzle-orm-patterns, postgresql-table-design | row 23 |
| 8 | server | db migrations | `src/db/migrations/0017_*.sql` + `meta/` (generated) | `pnpm db:generate` after rows 6–7; commit as generated; then `pnpm db:migrate` locally | — | TC-3 |
| 9 | server | reviews · 3a | `src/modules/reviews/repository/run.repo.ts` (edit) | `activeRunsForPull`, `listRunsForPull`: add `eq(t.agentRuns.kind, 'review')`; map `kind: run.kind` in `listRunsForPull` and `findingsForRun`; `costRollupForPulls`, `reapStaleRunningRuns`, `createAgentRun` unchanged (default `review`) | drizzle-orm-patterns, onion-architecture-backend | row 23 |
| 10 | server | agents · 3a | `src/modules/agents/repository.ts` (edit) | `statsByAgent` run query: add `eq(t.agentRuns.kind, 'review')` (`:267`) | drizzle-orm-patterns | row 23 |
| 11 | server | pr-brief · 2 | `src/modules/pr-brief/constants.ts` (new) | `GENERATE_JOB_KIND = 'pr-brief.generate'`, `STALE_RUN_MS = 10 min`, `BRIEF_CALL_TIMEOUT_MS = 90_000`, `MAX_FILE_CHARS = 6_000`, `MAX_TOTAL_CHARS = 60_000`, `MAX_FINDINGS = 30`, `MAX_RATIONALE_CHARS = 200`, `MAX_SYMBOLS = 10`, `MAX_CALLERS = 5`, `MAX_SUMMARY_CHARS = 400`, `MAX_RISKS = 5`, `MAX_FOCUS = 6`, `TRACE_AGENT_NAME = 'PR Brief'`, `TOOL_NAME = 'generate_brief'`, `INVALID_BRIEF_ERROR`, `RATE_LIMIT = { max: 6, timeWindow: '1 minute' }` | onion-architecture-backend | — |
| 12 | server | pr-brief · 1 | `src/modules/pr-brief/ports.ts` (new) | `PrBriefRepositoryPort` (row 14 methods); structural `IntentReader { get(ws, prId) }` (subset of `StoredIntent`: `intent`, `inScope`, `outOfScope`), `SmartDiffReader { get(ws, prId): Promise<SmartDiff> }`, `BlastReader { get(ws, prId): Promise<BlastRadiusResponse> }`, `BriefRunLog` (`info`, `tool`, `result`, `error`, `logFor`), `JobsPort`, `LlmFactory`, `PrBriefDeps` (incl. `repoIntelEnabled`, `systemPrompt()`, `now?()`, `log?`), `GenerateJobPayload { workspaceId, prId, runId, headSha, sourceReviewId }` | onion-architecture-backend, typescript-expert | — |
| 13 | server | pr-brief · 2 | `src/modules/pr-brief/helpers.ts` (new) | pure: `newSideLines(patch)` (hunk parser), `parseRef`/`formatRef`, `verifyDraft(draft, files)` (drop unknown paths, line outside → null, range clip to hunk lines, returns kept + dropped count), `trimDraft` (summary 400, risks ≤ 5, focus ≤ 6), `selectFiles` (Smart Diff order, per-file and total caps, `included`/`named` split), `selectFindings` (≤ 30, 200-char rationale), `blastDigest` (≤ 10 × 5), `buildMessages` (every PR/diff/finding/intent/blast text inside `<untrusted>` with `neutralize`), `isStale(brief, headSha, newestReviewId)`, `reviewFacts` mapping, `isSchemaFailure`, `runErrorText` (ConfigError → "No API key configured for `<provider>`", M3), `toBrief(meta)`, `buildTrace(...)` (`config.agent = TRACE_AGENT_NAME`, one `tool_calls` entry `generate_brief`, `prompt_assembly {system, user, pr_description, intent}`, `stats.findings = 0`, `grounding = "<kept>/<total> refs kept"`) validated with `RunTrace.parse` | onion-architecture-backend, zod, security | row 21 |
| 14 | server | pr-brief · 3a | `src/modules/pr-brief/repository.ts` (new) | `getPull(ws, prId)` (title, branch, body, head sha, number, repo full name; joins `pull_requests` on `workspace_id`); `getPrFiles(prId)`; `getNewestReview(ws, prId)` (`reviews.kind = 'review'`, newest `created_at`, agent name via left join, non-dismissed count, CRITICAL non-dismissed count, verdict, score, findings list for the input); `getLatestRun(ws, prId)` (`kind = 'brief'`, newest `ran_at`, mapped to `RunSummary`); `getStored(prId)` (row → `PrBrief.safeParse`, invalid → null, AC-55); `createRun(ws, prId, model)` (`kind: 'brief'`, `agent_id` null, `status: running`, `source: local`); `failRun(ws, runId, error, usage?)`; `completeRun(ws, prId, runId, brief, usage, trace)` in ONE transaction: upsert `pr_brief` (json + metadata), update `agent_runs` to `done` with usage and `findings_count` 0, upsert `run_traces`; `saveTrace(runId, trace)` for failed runs | drizzle-orm-patterns, postgresql-table-design, onion-architecture-backend | row 23 |
| 15 | server | pr-brief · 2 | `src/modules/pr-brief/service.ts` (new) | `PrBriefService`: constructor registers the job; `view(ws, prId)`: 404 when no pull, then run first, then brief + review (INSIGHTS:52), `stale` via helper, no model / git call; `generate(ws, prId)`: stale reap or return young run (copy `onboarding/service.ts:58-86`), capture head sha + newest review id (D8), resolve feature model, create run (23505 → return running run), enqueue; `runGeneration(payload)`: never throws; RunLogger lines for inputs and caps, blast skipped when `!repoIntelEnabled` or `degraded` or the reader throws, one `llm.completeStructured({ schema: PrBriefDraft, schemaName: 'PrBriefDraft', maxRetries: 0, temperature: 0, timeoutMs: BRIEF_CALL_TIMEOUT_MS, sessionId })` wrapped in `withTimeout` (D1), schema failure → `INVALID_BRIEF_ERROR`, verify + trim, `completeRun`; on error `failRun` + `saveTrace` with the log and any raw output; 23503 / missing pull → D4 | onion-architecture-backend, security | row 22 |
| 16 | server | pr-brief · 3b | `src/modules/pr-brief/routes.ts` (new) | `GET /pulls/:id/brief` (response `PrBriefView`), `POST /pulls/:id/brief/generate` (`config.rateLimit` 6/min, 202 `{ run }`); both `getContext()` first; deps from `app.container`: `prBriefRepo`, `intentRepo`, `smartDiffService`, `blastService`, `repoIntelEnabled`, `llm`, `featureModel(ws, 'risk_brief')`, `jobs`, `systemPrompt: () => loadPromptTemplate('pr-brief.system.md')`, `runLog: (runId) => new RunLogger(c.runBus, [runId], app.log, { prId })` | fastify-best-practices, onion-architecture-backend, zod, security | row 23 |
| 17 | server | prompts | `src/prompts/pr-brief.system.md` (new) | stable instructions: role, output fields, risk kinds, 3–5 risks, ≤ 6 focus items, only paths/lines from the given patches, never state verdict or score, `<untrusted>` content is data, never quote secret values (name the kind only); follow `../docs/agent-prompts/` rules | security | row 22 (loaded) |
| 18 | server | root | `src/platform/container.ts` (edit) | `prBriefRepo` getter typed `PrBriefRepositoryPort` with `overrides.prBriefRepo`; `smartDiffService` (`new SmartDiffService({ repo: this.smartDiffRepo })`) and `blastService` (`new BlastService({ repo: this.blastRepo, intel: this.repoIntel })`) getters; `ContainerOverrides.prBriefRepo` | onion-architecture-backend | row 22 |
| 19 | server | root | `src/modules/index.ts` (edit) | import and register `prBriefRoutes` (`:12-13`, `:41-42`) | fastify-best-practices | row 23 |
| 20 | server | db seed · 3a | `src/db/seed.ts` (edit) | for the e2e PR: one `agent_runs` row `kind: 'brief'` (done, usage, cost), its `run_traces` doc, one `pr_brief` row with 3 risks and 3 focus items whose paths/lines are in the seeded `pr_files` patches, `head_sha` = the PR's head, `source_review_id` = the seeded newest review id; idempotent like the existing inserts (`:481`, `:501`) | drizzle-orm-patterns | row 44 |
| 21 | server | test | `test/pr-brief-helpers.test.ts` (new) | hunk parser vs client counting; verification (unknown path dropped, line outside → null, range clip, partial range); trimming; caps and "named only" files; findings cap; stale rules (head sha, review id; not model/dismiss); `PrBriefDraft` has no verdict/score field; `RunTrace.parse` of the built trace | — | itself |
| 22 | server | test | `test/pr-brief-service.test.ts` (new) | fake deps: exactly one `completeStructured` call with `maxRetries: 0`; invalid output → failed `INVALID_BRIEF_ERROR`, no second call; `ConfigError` → error names provider; young running run returned; old running run failed then new run; never throws; blast skipped when disabled/degraded/throwing; trace has one `generate_brief` call; never-resolving LLM → failed by deadline (TC-4); intent read never derives | — | itself |
| 23 | server | test | `test/pr-brief.it.test.ts` (new) | GET: 404 unknown PR, `{brief:null, review:null, run:null, stale:false}`, review facts from newest `kind='review'` across agents with dismissed excluded and CRITICAL blockers; invalid stored json → `brief: null`; POST 202 + `kind` `brief`; concurrent POST → one run (partial index); done writes brief + run + trace in one transaction; failed leaves brief; `GET /pulls/:id/runs` and `/runs/active` exclude brief runs; PR-list cost includes it; agent stats exclude it; stale after head sha / newest review change | — | itself |
| 24 | server | test | `test/settings-models.it.test.ts` (edit) | expected `risk_brief` default `openrouter` / `deepseek/deepseek-v4-flash` (`:59-62`) | — | itself |
| 25 | client | lib | `src/lib/format-cost.ts` (edit) | `formatTokenPair(inTok, outTok)` → `8.2K→1.3K` (one decimal, `K`/`M`), nulls → "—" | react-best-practices | `src/lib/format-cost.test.ts` (new or edit; unverified whether it exists) |
| 26 | client | lib/hooks | `src/lib/hooks/brief.ts` (new) + `src/lib/hooks/index.ts` (edit, if the barrel exists; unverified) | `usePrBrief(prId)` key `["pr-brief", prId]`, poll 2 s while `run.status === 'running'`; `useGenerateBrief()` keeps the previous brief via `setQueryData` then invalidates (copy `hooks/onboarding.ts:20-44`) | react-best-practices, react-frontend-architecture | covered by row 31 |
| 27 | client | — | (no separate row: hook tests live in row 31) | — | — | — |
| 28 | client | lib/hooks | `src/lib/hooks/reviews.ts` (edit) | `useFindingAction` success also invalidates `["pr-brief", prId]` (AC-15) | react-best-practices | row 31 |
| 29 | client | i18n | `messages/en/brief.json` (replace) | remove unused keys (M5); add `card.*` (title, generate, regenerate, generating, notReviewed, notReviewedHint, findingsBadge, outOfDate, staleHead, staleReview, basedOn, costLine, error, retry, info.*), `risks.*` (title, kind.*, severity.*, expand, collapse), `focus.*` (title, empty, count) — camelCase | — | rows 31–33 |
| 30 | client | pr page · OverviewTab | `.../OverviewTab/OverviewTab.tsx` + `styles.ts` (edit) | call `usePrBrief` once; render `PrBriefCard`, then the existing grid (Intent gets `risks` + `onOpenRef`), then `ReviewFocusCard` full-width; new props `onOpenTrace(runId)`, `onOpenDiff(path, line)`; no brief → Intent/Blast/description unchanged | react-frontend-architecture, react-best-practices | row 31, `IntentCard.test.tsx` stays green |
| 31 | client | pr page · OverviewTab | `.../OverviewTab/_components/PrBriefCard/` (new: `PrBriefCard.tsx`, `index.ts`, `styles.ts`, `constants.ts`, `helpers.ts`, `PrBriefCard.test.tsx`) | states: skeleton; GET error + Retry; Generate; running (`aria-busy`, disabled spinner, previous brief kept); failed inline error; data: verdict tile from `VERDICT_META` (`../../VerdictBanner/constants`, path unverified relative depth) or neutral "Not reviewed yet", findings badge, (i) popover on hover and focus (agent, review time, "written by" the stored brief's `<provider>/<model>`), summary as plain text, regenerate `IconBtn`, `CircularScore` "PR SCORE", cost line button (`formatCost` + `formatTokenPair`, stored brief's model) → `onOpenTrace`, "Out of date" badge + reason hint, "Based on X of Y files". Generate button and regenerate icon tooltips always name the current workspace `risk_brief` feature model from the settings hook + registry default (D5), never the stored brief's model | react-frontend-architecture, react-best-practices, react-testing-library | `PrBriefCard.test.tsx` (AC-4–9, 12–17, 48, 49; regenerate tooltip shows the workspace model when it differs from the stored one; no toast on failed run) |
| 32 | client | pr page · OverviewTab | `.../OverviewTab/_components/ReviewFocusCard/` (new: component, `index.ts`, `styles.ts`, `ReviewFocusCard.test.tsx`) | header "Review focus — read these first" + count badge; rows `path:line — reason` (button, accessible name) in model order → `onOpenDiff`; explicit empty note; hidden when no brief | react-frontend-architecture, react-best-practices, react-testing-library | `ReviewFocusCard.test.tsx` |
| 33 | client | pr page · OverviewTab | `.../OverviewTab/_components/RiskAreas/` (new: component, `index.ts`, `styles.ts`, `constants.ts` (kind → icon with fallback, severity → `SEV` D6), `RiskAreas.test.tsx`) | "Risk areas" heading only when risks exist; chip: kind icon, title, mono refs (buttons → `onOpenRef`), chevron `aria-expanded`; expanded: explanation + severity | react-frontend-architecture, react-best-practices, react-testing-library | `RiskAreas.test.tsx` (AC-40, 41 unknown kind icon) |
| 34 | client | pr page · IntentCard | `.../OverviewTab/_components/IntentCard/IntentCard.tsx` (edit) | optional `risks?: Risk[]` and `onOpenRef?` props; render `RiskAreas` between the scope lists and the sources disclosure (`:158-166`); nothing when absent | react-best-practices | `IntentCard.test.tsx` (add one case) |
| 35 | client | pr page · OverviewTab | `.../OverviewTab/helpers.ts` (new) + `helpers.test.ts` | `parseRef("a.ts:12-20") → {path, line: 12}` (D7), `formatFocusRow` | react-frontend-architecture | `helpers.test.ts` |
| 36 | client | pr page | `src/app/repos/[repoId]/pulls/[number]/page.tsx` (edit) | `openDiffAt(path, line)` sets `tab=diff`, `file`, `line` (or deletes `line`) in one `router.replace`; pass `onOpenTrace` / `onOpenDiff` to `OverviewTab`; pass `search.get('file')` / `search.get('line')` to `DiffTab`; `onRunDone` also invalidates `["pr-brief", prId]`; keep the page thin | next-best-practices, react-frontend-architecture | e2e row 44 |
| 37 | client | pr page · DiffTab | `.../DiffTab/DiffTab.tsx`, `helpers.ts` (edit), `useDiffDeepLink.ts` (new), `helpers.test.ts` (edit or new; unverified) | `resolveDeepLink(files, file, line)` → `{path, line|null} | null` (path must be a changed file, line a positive integer); pass `focus` to `RoleGroup` (`forceOpen` when the group holds the path) and to `DiffViewer`; `useDiffDeepLink` runs once per `(path, line)`: after render `scrollIntoView` on `[data-diff-path]`, then on `[data-line]` inside it when rendered, sets a 2 s highlight; nothing on miss (AC-45) | react-frontend-architecture, react-best-practices | `helpers.test.ts` |
| 38 | client | pr page · DiffTab | `.../DiffTab/_components/RoleGroup/RoleGroup.tsx` (edit) + `RoleGroup.test.tsx` (new) | `forceOpen?: boolean` → effect sets `open` true; `focus` forwarded to `DiffViewer` | react-best-practices, react-testing-library | `RoleGroup.test.tsx` (collapsed `docs` group opens with `forceOpen`) |
| 39 | client | components/diff-viewer | `src/components/diff-viewer/DiffViewer/DiffViewer.tsx` (edit) | optional `focus?: { path: string; line: number | null; highlight: boolean }`; passes `forceOpen` + `highlightLine` to the matching `FileCard` only | react-best-practices | row 38 |
| 40 | client | components/diff-viewer | `src/components/diff-viewer/FileCard/FileCard.tsx` (edit) | `forceOpen?` effect opens the card; root gets `data-diff-path={file.path}`; `highlightLine` forwarded to `CodeLine` | react-best-practices | row 38 |
| 41 | client | components/diff-viewer | `src/components/diff-viewer/CodeLine/CodeLine.tsx` (+ `styles.ts` if needed) (edit) | `data-line={ln.newNo}` on new-side lines; `highlighted` prop → background from an existing CSS variable (no hard-coded colour) | react-best-practices | row 38 |
| 42 | client | test | `.../RunHistory/RunHistory.test.tsx` (edit) | factory `run()` adds `kind: 'review'` (typecheck after row 2) | react-testing-library | itself |
| 43 | mcp | test | `mcp/` fixtures building `RunSummary` (edit only if `npm run typecheck` fails after row 2; unverified) | add `kind: 'review'` | — | mcp typecheck |
| 44 | e2e | flows | `e2e/specs/16-pr-brief.flow.json` (new) | seeded PR: Overview shows the brief card (verdict, summary, cost line), Risk areas in Intent, Review focus card; reload shows it again (no generate); scroll to and click a focus row → URL has `tab=diff&file=…&line=…`, the file card is open; click the cost line → trace drawer titled "PR Brief". No model call | — | itself |

## Contracts & migrations

- Contract changes: `RiskKind`, `Risk.kind`, `PrBriefFocusItem`, `PrBriefDraft`, `PrBrief` (replaced), `PrBriefReview`, `PrBriefView`, `RunKind`, `RunSummary.kind`, `FEATURE_MODELS.risk_brief` → copied to `client/src/vendor/shared` in row 4.
- Migration: `agent_runs.kind` (not null, default `review`) + partial unique index + `(pr_id, kind, ran_at)` index; `pr_brief` metadata columns, via `pnpm db:generate` (row 8).

## Verification plan

| Package | Commands | Needs Docker |
|---|---|---|
| all touched | `bash .claude/skills/pr-self-review/scripts/verify.sh run --with-it --e2e` | yes |
| server | `pnpm exec vitest run pr-brief-helpers pr-brief-service` while building rows 13–15 | no |
| server | `pnpm exec vitest run pr-brief.it.test settings-models.it.test` after rows 8–16 | yes |
| server | `pnpm lint:arch` after rows 12–19 | no |
| client | `pnpm exec vitest run PrBriefCard RiskAreas ReviewFocusCard RoleGroup DiffTab OverviewTab IntentCard RunHistory format-cost` | no |
| e2e | via `verify.sh --e2e` (seed from row 20); restart the dev web on :3000 afterwards (`e2e/INSIGHTS.md:21`) | yes |

## Risks & open questions

- `/runs/:id/trace` is not workspace-scoped (`reviews/routes.ts:133-138`); brief traces inherit that. Out of scope (M6); worth a follow-up issue.
- D1: an adapter's transport retry after a 429/5xx can bill a resent request; this is accepted behaviour under the reworded AC-21, not a defect.
- When the job deadline fires, the HTTP request keeps running in the background; its later result is discarded. The 120 s job timeout does not cancel the handler (`jobs.ts:79-96`), so the service's own deadline is what ends the run.
- `container.smartDiffService` / `blastService` are new getters; `BlastService.get` also queries prior PRs (`blast/service.ts:17`), a small extra read per generation. Acceptable; reuse avoids duplicating the facade mapping.
- `pr_files` exist only after `GET /pulls/:id` (`server/INSIGHTS.md:43`). Generate is only offered on the PR page, so this holds; an empty file list still produces a brief (summary from title/body/findings, focus likely empty).
- The OpenAI strict JSON schema needs every field required: `line` is `nullable`, not optional (check `toJsonSchema` output in row 21).
- Spec revisions for EC-18 and AC-21 landed in commit 850dfc1; the plan follows the revised wording.
- Doc follow-ups for `doc-writer`: `client/specs/pages.md` (`file`, `line` params), `server/README.md` API map, `server/specs/` brief spec or module doc, `e2e/README.md` coverage row, spec status to `implemented`.

## Handoff

- Architecture review focus: `modules/pr-brief/*` against rules 3, 4, 6, 8 and the reviewer-core boundary; the three new container getters; the one-transaction completion in `repository.ts`; `page.tsx` staying thin; the diff-viewer props staying optional and minimal; no `vendor/ui` change.
- Security review focus: prompt assembly in `pr-brief/helpers.ts` (every PR, diff, finding, intent and blast text inside `<untrusted>`, closing-tag neutralised); `pr-brief.system.md` (no secret quoting); verification of model paths/lines before storage; plain-text rendering of model text on the client; `file`/`line` query params matched only against changed paths; logs carry counts/ids only; `GET` workspace scoping; rate limit on POST; secrets only via `container.llm`.
- plan-verifier: re-run AC-21 (one call, `maxRetries: 0`), AC-23 (four readers), AC-25 (concurrent POST), AC-31 (transaction), AC-37 (range clip), AC-44/45 (deep link), D5 (tooltip model source) and TC-1 to TC-4.

## Cross-model review

Reviewer: `deepseek/deepseek-v4-flash` via OpenRouter, 2026-10-21 (plan author: Claude implementation-planner). Verdict as given: FAIL (one critical, one warning, one info).
| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | critical | `agent_runs.pr_id` delete rule contradicts spec EC-18 | Rejected: pre-existing `set null` FK; spec EC-18 revised to match D4 |
| 2 | warning | Regenerate tooltip could name a stale model | Accepted: D5 and row 31 now use the workspace feature model |
| 3 | info | Transport retries vs "exactly one call" | Accepted: D1 and spec AC-21 reworded; transport retries allowed, no reprompt |

## Amendments (main session, 2026-10-21, after two live runs)

Two live generations on the seeded PR with `deepseek/deepseek-v4-flash`: the second succeeded (one `generate_brief` call, 1,311→1,833 tokens, $0.00018, 12/12 refs kept, trace and log lines stored); the first failed with "The model returned an invalid brief" and the trace carried no raw output, no token counts and no reason, because the adapter throws before the service sees the text. Rows 45–46 add diagnosability and tolerance without a reprompt (AC-21 unchanged).

| # | Package | Ring / layer | File | Change | Skills to apply | Depends on |
|---|---|---|---|---|---|---|
| 45 | reviewer-core | llm adapter | `reviewer-core/src/llm/openrouter.ts` (+ `reviewer-core/test/…` existing structured tests) | When the last attempt fails `parseWithRepair`, throw an error whose message keeps the word "schema" and appends the parse issues (`parsed.error`, capped at 400 chars), never the raw text. Same for the "not valid JSON" case. Review runs are unaffected except for a more informative message after their retries are exhausted. | typescript-expert | — |
| 46 | server | 2 (application) | `server/src/modules/pr-brief/helpers.ts`, `service.ts`, `constants.ts`, `server/test/pr-brief-helpers.test.ts`, `pr-brief-service.test.ts` | (a) Send the model a loose draft schema defined in `helpers.ts` (`PrBriefDraftLoose`: `kind` and `severity` as `z.string()`, `line` as number, numeric string or null, `file_refs` strings) and normalise in code with `normaliseDraft()` before the strict `PrBriefDraft.safeParse`: trim + lowercase `kind`, unknown → `other`; trim + lowercase `severity`, unknown → `medium`; `line` numeric string → integer, anything else → null; drop refs that are not strings. (b) The stored run error becomes `INVALID_BRIEF_ERROR + ': ' + cause message` (so the Zod issues from row 45 land in `agent_runs.error`, capped by `runErrorText`). (c) The trace's `raw_output` stays empty on failure (the adapter does not return it); log one `error` line with the issues. Tests: normalisation table (case, numeric string line, unknown kind/severity); a failing call stores the issues in the run error. | zod, typescript-expert | 45 |

Acceptance: AC-21 still holds (one call, `maxRetries: 0`); AC-32 and AC-41 are strengthened (an unknown kind no longer fails the run; it is stored as `other`). Verification unchanged: `verify.sh run --with-it --e2e`.
