# Spec: Multi-Agent Review   |   Spec ID: SPEC-13   |   Status: draft

Lesson L07. **Affected modules:** `server`, `client`. Cross-module, hence a root
spec. `reviewer-core` is a consumer-only dependency and is deliberately
unchanged (D4); `mcp-server` and `e2e` are non-goals for this slice (N7, N8).

> **Merge order, stated once and normatively.** This spec's branch
> (`feat/multi-agent-review`) merges **first**, before the sibling
> `specs/14-export-to-ci.md` (`feat/export-to-ci`). Export-to-CI's
> result-ingestion path is written to depend on the findings-attribution
> mechanism defined here (§Shared contracts, AC-22/AC-23). That attribution
> mechanism must be stable and merged before Export-to-CI's ingestion work can
> safely build on it. Nothing in this spec may read from or modify
> `vendor/shared/contracts/eval-ci.ts` — that file is Export-to-CI's to own
> (N11).

> **Scoped core exception, stated once and normatively.** This spec includes a
> deliberate, product-owner-approved change to
> `server/src/modules/reviews/run-executor.ts` — the per-agent job loop runs
> concurrently instead of sequentially (D16, AC-16 – AC-20). This is a named
> exception to the standing "don't rewrite core execution" rule, granted
> because of its small and isolated blast radius, **not** a general licence to
> modify core elsewhere. Everything else about the executor — layering,
> persistence, error handling, the diff/intent pre-work, the run bus — is
> untouched (N2).

## Problem & Motivation

DevDigest lets a workspace configure several review agents with genuinely
different personalities — a Security Reviewer, a Performance Reviewer, a Junior
Mentor, a Customer-Facing reviewer — each with its own system prompt, model,
strategy and linked skills, and each already editable through a per-agent editor
(Config / Skills / Context / Evals / Stats tabs). Today, a reviewer who wants
more than one opinion on a pull request gets them **one at a time**, in the PR
detail page's run history, as a flat chronological list of independent runs.
There is no surface anywhere in the product that answers the two questions that
make running several agents worth the money:

> Where do my agents **agree**, and where do they **disagree**?

An agreement is a strong signal — several independently-prompted agents landing
on the same file and line is much more than several times one agent's
confidence. A disagreement is an even more interesting signal: it names the
exact spot where the reviewer's judgement is actually needed, because the
tooling itself is split. Neither is visible today. The run history shows N
separate verdicts and leaves the cross-referencing entirely to the human, which
is precisely the work the product exists to remove.

Most of the machinery already exists and is already paid for.
`ReviewRunExecutor.executeRuns` (`server/src/modules/reviews/run-executor.ts:58`)
already takes a *list* of `{agent, runId}` jobs, resolves the diff and the PR
intent **once** for the whole batch (`run-executor.ts:101,120`), then works
through them via `runOneAgent` (`run-executor.ts:204`) calling
`reviewPullRequest` from `@devdigest/reviewer-core` (`run-executor.ts:312`).
Each agent's `reviews` / `findings` / `agent_runs` / `run_traces` rows are
persisted independently, and per-agent failures are explicitly isolated
(`run-executor.ts:191-199`) so one agent's provider error cannot take down
another's run.

So this feature is mostly **presentation and aggregation**: choose the agents,
group their runs under one identity, compute where their findings collide, and
give the result a home. The one execution change it does make — running those
jobs concurrently rather than one after another — is small, isolated, and
explained in D16.

### This space is already reserved in seven independent places

Read before drafting, and adopted rather than duplicated (D1). This is the same
"reserved-but-unwired" pattern `server/LEARNINGS.md` (2026-08-03) and
`client/LEARNINGS.md` (2026-08-03, with a 2026-08-19 addendum) both document:

1. **A table.** `multi_agent_runs` exists in `server/src/db/schema/runs.ts:83-92`
   and shipped in `0000_init.sql:198`. It carries only `id`, `workspace_id`,
   `pr_id`, `ran_at`. Grep confirms **zero** references outside the schema file
   and the barrel (`server/src/db/schema.ts:46,92`) — zero readers, zero
   writers, zero rows.
2. **Multi-agent contracts.** `AgentColumnFinding`, `AgentColumn`,
   `ConflictTake`, `Conflict`, `MultiAgentRun` in
   `server/src/vendor/shared/contracts/observability.ts:22-86` (and the client
   copy at the same path). The file header names this lesson explicitly ("A5 —
   Observability / Multi-agent contracts (L07)") and the docstring at line 74
   names the two endpoints: `POST /pulls/:id/multi-agent-run` and
   `GET /pulls/:id/multi-agent`. **No implementation exists** for
   `Conflict`/`ConflictTake` anywhere in `server/src` or `reviewer-core`.
3. **A deterministic per-run score.** `scoreFromFindings`
   (`reviewer-core/src/review/reduce.ts:20-27`) already computes a 0–100 quality
   score from the *grounded* findings — explicitly "NOT the model's
   self-reported `score`, which has no anchor and drifts wildly". It is applied
   at `review/run.ts:231`, persisted to `reviews.score` and `agent_runs.score`
   (`run-executor.ts:406,431`), and already exposed on the reserved
   `AgentColumn.score` (`observability.ts:43`). This resolves the mockups' score
   badge with zero invention (D18).
4. **A reusable finding-detail component.** `FindingCard`
   (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/`)
   already renders severity badge, category tag, `file:line` link, confidence
   number, markdown rationale, a "Suggested fix" block, and Accept / Dismiss /
   Turn-into-eval-case actions — built, tested, and in use on the PR review
   page (D19).
5. **Active-key detection.** `client/src/components/app-shell/helpers.ts:35`
   already returns `"multi-agent"` for any pathname containing that segment.
6. **A nav label.** `client/messages/en/shell.json`'s
   `nav["multi-agent"]: "Multi-Agent Review"`.
7. **A page copy set.** `client/messages/en/runs.json` carries `page.*`,
   `conflicts.*`, `column.*` and `tabs.noSummary`. Every one of these keys has
   **zero** consumers today; the only consumers of the `runs` namespace are
   `RunTraceDrawer` and its sub-components. Several of these keys were written
   for an earlier "run every enabled agent" design and no longer match the
   mockups — see D20.

**The missing wiring is `client/src/vendor/ui/nav.ts`.** Its `NAV` array has
entries for `pulls`, `context`, `onboarding-tour`, `skills`, `agents`,
`conventions` and `eval` — and **none** for `multi-agent`. (It has none for
`memory` either: Memory is a *separate* reserved-but-unwired feature — an
active-key branch and a `nav.memory` label, but no nav item, no route, and no
backend at all, as D24 establishes. Do not mistake it for shipped.)
`client/LEARNINGS.md`'s 2026-08-03 entry (twice confirmed, most recently for
SPEC-12's `/eval`) records exactly this failure mode: route + active-key + i18n
label all present makes a section *look* wired while it is silently unreachable
from the sidebar, and nothing throws, no test fails, `typecheck` is clean.
`nav.ts` is the first thing to grep and the last thing to forget (D14, AC-52).

The reserved shapes do not all fit the feature as briefed. Each mismatch is
resolved explicitly below rather than silently.

## Goals / Non-goals

### Goals

- **G1** — Let a reviewer pick a pull request, pick an explicit subset of that
  workspace's agents, see what the run will cost before committing, and fan them
  all out in one action.
- **G2** — Run those agents **concurrently**, so a multi-agent review takes
  roughly as long as its slowest agent rather than the sum of all of them.
- **G3** — Present the result as one column per selected agent — verdict, score,
  summary, model, cost, duration, findings — side by side.
- **G4** — Offer the same run as per-agent tabs, where the active agent's
  findings render in full detail and can be triaged in place — accepted,
  dismissed, learned from, or turned into an eval case.
- **G5** — Compute and present **where the agents disagree**: a location at
  least one agent flagged and another (that also ran successfully) did not, or
  that two agents flagged at divergent severities.
- **G6** — Let a reviewer drill from any agent's result straight into that
  agent's run logs, **by reusing the existing run-trace drawer**, not by
  building a second one.
- **G7** — Define, once and stably, how a finding is attributed to a specific
  agent and a specific run, so the sibling Export-to-CI feature can depend on it.
- **G8** — Surface a partly-failed run as **partial results**, honouring the
  per-agent error isolation the executor already provides — never as a
  whole-run failure.
- **G9** — Make the seven already-reserved surfaces load-bearing, adopting each
  in place rather than building a parallel set beside it.
- **G10** — Let a reviewer already looking at a pull request fan out several
  agents without leaving the page, from the Run Review control that is already
  there.

### Non-goals (explicitly out of scope for this slice)

- **N1 — Any CI execution or CI-triggered multi-agent run.** `agent_runs.source`
  stays `'local'` for every run this feature starts (D10, AC-11). CI is
  `specs/14-export-to-ci.md`'s scope.
- **N2 — Any change to the executor beyond the approved concurrency change.**
  Layering, persistence, per-agent error handling, cancellation, the SSE run
  bus, the run trace and the shared diff/intent pre-work all stay exactly as
  they are (D16, AC-17 – AC-19).
- **N3 — Predictive "what this agent will likely flag" previews.** Screen A's
  mockup shows a one-line prediction under each selectable agent (e.g. *"Two
  critical exposures: a committed live key and an SSRF-shaped webhook
  forwarder. Block."*). Producing that before the run would mean speculatively
  reviewing the PR with every agent the user has *not* yet chosen — i.e.
  paying the full cost of the run in order to render the screen that asks
  whether to pay for the run. It is mockup flavour text illustrating the shape
  of results, and is not built (D17).
- **N4 — Semantic-similarity or embedding-based conflict detection.** No such
  engine exists in this codebase, and the nearest thing —
  `modules/reviews/smart-diff.ts`'s `buildSmartDiff` / `classifyFile` — groups
  *files* by risk role, not *findings* by similarity, and is not a fit. A
  location-overlap heuristic ships instead (D7, AC-36).
- **N5 — The "Reply to author" finding action.** *(Revised: "Learn" was
  previously scoped out alongside it and is now back **in** scope — see D24 and
  AC-63 – AC-65. The authoritative requirements name the tab action set as
  Accept, Dismiss, Learn and Turn into eval case; Reply to author is never
  mentioned and stays out.)* Reply is the more expensive of the two: it posts a
  comment to GitHub, which is an outbound side effect on a third-party system,
  needs its own auth/permission and failure story, and is a pull-request-page
  concern rather than a multi-agent one. `FindingActionKind`
  (`vendor/shared/contracts/findings.ts:82`) reserves `'reply'` and
  `messages/en/prReview.json:9-11` reserves its copy; both stay unwired here.
- **N6 — A multi-agent run history browser.** Rows persist (AC-21), but the
  results surface shows the latest run for the selected PR only (D11).
- **N7 — An MCP tool** exposing multi-agent runs or conflicts.
- **N8 — An e2e browser flow**, consistent with the SPEC-09/10/11/12 precedent.
- **N9 — Cross-agent ranking.** Results sit side by side; the surface must not
  imply a leaderboard, and no "best agent" aggregate is computed. Per-agent
  scores are comparable *as scores of the same PR*, but the surface must not
  present them as a ranking of the agents themselves.
- **N10 — Automatic runs.** No multi-agent run is triggered by a PR opening, a
  push, a page load, or a schedule. Every run is an explicit user action.
- **N11 — Touching `vendor/shared/contracts/eval-ci.ts`.** Export-to-CI owns it.
- **N12 — Editing agent configuration from these surfaces.** That is the Agent
  editor's job; these surfaces link out to it at most.
- **N13 — Storing conflicts.** They are computed on read (D6, AC-35), exactly as
  `observability.ts:65` already states ("Computed from persisted findings; not
  stored.").
- **N14 — A per-agent colour/icon schema field.** The mockups give each agent a
  visual identity; `agents` has no colour or icon column and gains none (D21).
- **N15 — Building the reserved `AgentStats` surface.** `GET /agents/:id/stats`
  and the `AgentStats` contract are reserved and unwired; this feature computes
  only the narrow duration/cost estimate it actually renders, from raw run rows,
  and does not implement the wider stats surface (D22).

### Decisions

- **D1 — Adopt the reserved `multi_agent_runs` table and the reserved
  `MultiAgentRun`/`AgentColumn`/`Conflict` contracts; do not introduce a
  parallel set beside them.** The table has zero rows and zero consumers, so
  reshaping it in place needs no data migration and no compatibility shim. Per
  `server/LEARNINGS.md` (2026-08-04), confirm first that the reservation targets
  *this* lesson — it does: `observability.ts:5` names L07 and lines 9-11 name
  this feature's two endpoints and its `Conflict` concept by name.
- **D2 — The run set is an explicit, user-chosen subset of the workspace's
  agents.** *(Resolved by the product owner; supersedes this spec's first
  draft, which inferred "every enabled agent" from the prepared copy and the
  existing trigger contract.)* Screen A shows a genuine agent picker: a
  checkbox per agent, a "Select all" affordance, four of five agents checked,
  and a run button labelled with the selected count. Selection is per-run and
  ephemeral — it does not mutate `agents.enabled`, which keeps its existing
  meaning as "this agent is available at all".
- **D3 — The trigger contract gains exactly one new field.** `RunRequest`
  (`vendor/shared/contracts/platform.ts:384`) today admits `{ agentId?: string }`
  (exactly one) or `{ all?: boolean }`. It gains an **additive** list of agent
  identities for the multi-agent trigger; the two existing forms stay and keep
  working, because the existing single-agent and run-all paths still use them
  (AC-10, AC-19). This is the only new contract field the UI requires — no
  per-agent options object, no ordering, no per-run overrides.
- **D4 — Beyond the concurrency change of D16, execution is not
  re-architected.** The executor already fans out over a job list, resolves diff
  and intent once per batch, and isolates per-agent failures — which is the rest
  of this feature's execution requirement (N2).
- **D5 — Two endpoints, named by the reserved contract's own docstring:** a
  trigger returning the created multi-agent run identity and its per-agent run
  identities, and a read returning the aggregated `MultiAgentRun` (results +
  conflicts) for a PR. Rationale for a dedicated read rather than reusing
  `GET /pulls/:id/runs`: conflict computation is a cross-agent operation over
  persisted findings and belongs server-side, once, not re-derived in the
  browser; and `observability.ts:74` already reserves exactly this pair.
- **D6 — Conflicts are derived on read, never persisted.** The reserved contract
  states it outright. Storing them would create a second source of truth that
  goes stale the moment a finding is accepted, dismissed or deleted.
- **D7 — The conflict heuristic is location overlap: same file, and
  `[start_line, end_line]` ranges that intersect.** No semantic similarity
  (N4). This is the same shape of comparison SPEC-12 already adopted for
  expectation matching, and the same shape the citation-grounding gate already
  uses for hunk intersection (`reviewer-core/src/grounding.ts:41-46`) — one
  house rule for "these two things are about the same lines", not a third.
- **D8 — Only agents whose grouped run reached a successful terminal state
  participate in conflict computation.** A failed or still-running agent must
  never be rendered as "did not flag" — that would manufacture a conflict out of
  a provider timeout and actively mislead the reviewer (AC-38).
- **D9 — Findings attribution needs no new column; the existing linkage is
  already unambiguous.** Verified against the live schema, not assumed:
  `findings.review_id` is `NOT NULL` and cascades from `reviews`
  (`schema/reviews.ts:30-32`); `reviews` carries both `agent_id` and `run_id`
  (`schema/reviews.ts:17-19`), the latter documented in place as "The agent_run
  that produced this review (links the timeline run ↔ review)"; and `agent_runs`
  carries `agent_id`, `pr_id`, `workspace_id` and `source` (`schema/runs.ts:19-43`).
  So **finding → review → (agent_id, run_id) → agent_run** is a complete,
  single-valued path from any finding to exactly one agent and exactly one run,
  today. This feature therefore adds no attribution column and defines no second
  attribution path (AC-22). It does tighten one thing: `reviews.agent_id` and
  `reviews.run_id` are nullable `uuid` columns with **no** foreign-key
  constraint, so the invariant is currently a convention rather than an
  enforcement — AC-23 states it as a requirement.
- **D10 — `agent_runs.source` is `'local'` for every run started here.** The
  enum (`schema/runs.ts:36`) exists for the sibling CI feature; a studio-launched
  multi-agent run is local by definition. Stated explicitly so no implementer has
  to guess (AC-11).
- **D11 — The results surface shows the latest multi-agent run for the selected
  PR.** Rows accumulate as history, but no history browser ships this slice
  (N6). The copy agrees: `page.noRun.title` is singular ("No multi-agent run
  yet"), and the reserved read endpoint is `GET /pulls/:id/multi-agent`, not
  `/multi-agent-runs`.
- **D12 — Both `vendor/shared` copies, reconciled by hand.** Root `CLAUDE.md`
  §Do-not-touch warns the two copies are independent and already drifted. Any
  contract this feature adds or reshapes — notably `RunRequest` (D3) — lands in
  both, and must not widen the existing drift (AC-53).
- **D13 — The per-agent log surface is the existing `RunTraceDrawer`, reused as
  is.** It is already built, already tested, already mounted on the real PR
  detail page, and already fed by the wired SSE/trace endpoints. Its props
  (`runId`, `agentName`, `prNumber`, `findings`, `running`, `onClose`) are
  exactly what a per-agent result can supply. One gap, resolved rather than
  discovered later: the drawer's `findings` prop expects full `FindingRecord`s
  while `AgentColumnFinding` (`observability.ts:23`) is a deliberate subset —
  so the drawer's findings are sourced from the same existing per-PR runs data
  the PR detail page already uses for exactly this prop. No new drawer, no fork,
  no parallel component (AC-43, AC-46).
- **D14 — The nav item in `client/src/vendor/ui/nav.ts` is a required
  deliverable, not a finishing touch.** It is the documented missing wiring (see
  §"reserved in seven places"). The label comes from the existing `shell.json`
  `nav["multi-agent"]` key — this feature adds no new nav label. The user's
  informal term for this page is "Review Agents"; the shipped label is the
  already-prepared **"Multi-Agent Review"**, so nav, page title and breadcrumb
  agree.
- **D15 — Both the Columns and the Tabs presentation ship in this slice.** Asked
  to judge whether Tabs could be deferred for simplicity, the answer is that
  deferring it would save almost nothing. Both render the *same*
  `MultiAgentRun` payload from the *same* read, with the same conflicts section
  underneath (AC-30); the difference is one client-side view-mode value and two
  layout components. Tabs is in fact the *cheaper* of the two, because its
  findings list is `FindingCard` reused wholesale (D19) whereas Columns needs a
  new compact finding row. The copy for both already exists
  (`page.view.columns`, `page.view.tabs`, `column.noFindings`,
  `tabs.noSummary`). Shipping only Columns would strand that copy and the
  reuse win.

### Decisions resolved from the supplied mockups

Four screens were supplied: **A** — Configure run, populated; **B** — Configure
run, empty; **C** — Results, Columns view; **D** — Results, Tabs view. Genuine
gaps and over-reaches in them are resolved here rather than left open.

- **D16 — The per-agent job loop runs concurrently. Approved scoped exception.**
  The mockups are unambiguous about this: Screen A's aggregate estimate reads
  "≈ 8.2s · $0.20" while the single most expensive agent reads "8.2s · $0.06" —
  i.e. the aggregate duration is the **max** of the per-agent durations while
  the aggregate cost is their **sum**. That arithmetic is only true under real
  concurrency, and Screen C repeats the same figures as actuals. Inspecting
  `run-executor.ts:161-200` directly: each iteration is already fully isolated
  by its own `try`/`catch` and depends only on values computed once *before* the
  loop (`diff`, `resolvedIntent`/`resolvedInScope`/`resolvedOutOfScope`,
  `runLog`); nothing in one agent's iteration reads another's outcome. So this
  is a change to execution **order only** — not to layering, persistence, error
  handling, or the shared pre-work. The product owner approved it specifically
  on that basis. Because this loop is shared with the existing single-agent and
  run-all triggers, those paths must remain observably unchanged (AC-19), which
  is a **regression** requirement, not a new-feature one.
- **D17 — The per-agent "likely findings" preview on Screen A is not built.**
  See N3. Rendering it honestly would require running the agents to decide
  whether to run the agents. What Screen A *does* get is a real, cheap,
  historical estimate instead (D22, AC-5).
- **D18 — The circular numeric badge is the existing deterministic 0–100 review
  score. No new scoring algorithm.** The mockups show 38 (Security), 64
  (Performance), 72 (Junior Mentor), 58 (Customer-Facing) with no legend. Rather
  than invent a meaning, the codebase was checked first: `scoreFromFindings`
  (`reviewer-core/src/review/reduce.ts:20-27`) already produces exactly a 0–100
  number, deterministically, from the grounded findings, with a documented
  severity-penalty scale and "higher is better" semantics
  (`contracts/findings.ts:75`); it is already persisted per run and already on
  the reserved `AgentColumn.score`. The mockup's values fit that range and that
  ordering (the security agent, which found the critical issues, scores lowest).
  This is a straight reuse. One genuine gap the mockup *does* leave: a bare
  number with no legend is ambiguous to a reader who does not know the direction
  — so the surface must state that higher is better (AC-26).
- **D19 — Screen D's finding cards are the existing `FindingCard`, reused.**
  The mockup's card — severity icon, title, type tag, `file:line`, confidence
  percentage, expanded description, "SUGGESTED FIX" block, action row — matches
  the shipped component field for field
  (`.../pulls/[number]/_components/FindingCard/FindingCard.tsx`). Three of the
  five actions in the mockup's action row already exist there (Accept, Dismiss,
  Turn into eval case); the other two do not exist anywhere in the product and
  are out of scope (N5). The Tabs view therefore reuses `FindingCard` as-is,
  with its existing action set, rather than building a multi-agent-specific
  finding card (AC-34).
- **D20 — Several prepared `runs.json` copy keys were written for the earlier
  "every enabled agent" design and must be reworded, not wired as-is.**
  Specifically: `page.runAll` ("Run all agents" → a selected-count label),
  `page.subtitle`, `page.noAgents.body` and `page.noRun.bodyReady` (all say
  "every enabled agent"), `page.noRun.cta`, and `page.meta` — whose
  "fan-out via p-queue" clause, like Screen C's "fan-out via worktrees", names a
  mechanism this system does not use (nothing here uses git worktrees for
  execution). New keys are also needed for the configure step: select-all,
  per-agent estimate, aggregate estimate, the "Pick a pull request first" empty
  state, the "Configure run" back-action, and the selected count. Wiring the
  existing strings unchanged would ship copy that contradicts the feature
  (AC-59).
- **D21 — Per-agent colour and icon are derived, not stored.** The mockups give
  each agent a coloured border and icon. `agents` has no colour or icon column
  (`schema/agents.ts:8-36`). The visual identity is derived deterministically
  from the agent's own identity so that the same agent looks the same on every
  surface and across reloads, with no schema change and no migration (N14).
- **D22 — The pre-run estimate is computed from that agent's own completed
  runs, and says so when it can't be.** Screen A shows "8.2s · $0.06" per agent
  before anything runs. There is no existing source for this: the reserved
  `AgentStats` contract (`observability.ts:96`) has `avg_latency_ms` and
  `avg_cost_usd`, but `GET /agents/:id/stats` does not exist and nothing
  consumes the contract. Rather than build that whole surface (N15), the
  estimate is a narrow aggregate over the agent's existing `agent_runs` rows,
  which already carry `duration_ms` and `cost_usd`. An agent that has never
  completed a run has no basis for an estimate, and must say so rather than
  render a fabricated or zero figure (AC-5).
- **D23 — A second, lighter entry point on the pull-request page, reusing the
  Run Review control that is already there.** Screen E shows the PR detail
  page's existing "Run Review ▾" button opening a picker: a "PICK AGENTS TO RUN"
  header with a Clear affordance, a checkbox row per agent with a small duration
  estimate, a count-labelled run button, and a "Configure agents…" row leading
  to the full configure surface. This is **not** a second trigger flow: it
  submits the same request shape, creates the same multi-agent run, and lands on
  the same results surface (AC-60 – AC-62). No new backend surface at all. The
  component exists — `RunReviewDropdown`
  (`client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/`)
  already renders "Run all", a per-agent list, and a "Configure agents…" row
  (`runReview.configureAgents`, today routing to the agents surface). Two honest
  caveats, stated so they are not discovered mid-implementation: (a) the
  existing dropdown deliberately lists *every* agent, not just enabled ones
  ("a specific agent can be run regardless of its enabled flag"), whereas the
  mockup shows enabled agents — the multi-select rows follow the mockup and
  offer only agents that can actually be selected for a run; and (b)
  `DropdownItemDef` (`client/src/vendor/ui/kit/types.ts:5`) has no selected or
  checked concept and its rows dismiss on activation, so multi-select rows are
  an **additive extension of a shared UI primitive**, not merely one more entry
  in an options array — see §Shared contracts.
- **D24 — "Learn" writes into the existing `memory` table, and that write path
  does not exist yet. This is the one genuinely new backend surface this spec
  adds beyond multi-agent orchestration.** Checked before scoping, not assumed:
  the `memory` table is fully provisioned (`server/src/db/schema/knowledge.ts:18-38`
  — `workspace_id`, `repo_id`, `scope` ∈ {repo, global, team}, `kind` ∈
  {decision, convention, preference, fact, learning}, `content`, a nullable
  1536-dim `embedding`, `confidence`, `sources`, timestamps), but there is **no
  `modules/memory/`, no route, no service and no repository** anywhere in
  `server/src`, and no client surface — every other `memory` hit in the server
  is unrelated (the in-memory run bus, the trace's reserved `memory_pulled`
  slot). So Memory is reserved-but-unwired in the same way this feature's own
  surfaces were. The scope taken here is the narrowest useful one: activating
  Learn records **one** memory row derived deterministically from the finding
  (AC-63), reusing the existing `kind: 'learning'` and `scope: 'repo'` enum
  values rather than adding any. Deliberately excluded: no embedding is
  generated (the column is nullable, and generating one means an embedding
  pipeline that does not exist), no deduplication, no curation, no retrieval.
  The route itself is nearly free — `FINDING_ACTIONS`
  (`modules/reviews/routes.ts:43`) is a `['accept', 'dismiss']` constant driving
  a loop that already mounts `POST /findings/:id/:action`, and
  `FindingActionKind` already admits `'learn'`.
- **D25 — Adding Learn to the shared finding card makes it appear on the
  pull-request review page too, and that is intended.** `FindingCard` is one
  component with one action row (D19); a Learn action added for the tabs layout
  necessarily shows up wherever that card renders. This is additive — no
  existing action changes behaviour — so it does not violate N2, but it is a
  visible change to a surface this feature does not otherwise touch, and is
  recorded here rather than discovered in review.
- **D26 — A pull request's existing run must be reachable again from every
  entrance, and the configure surface offers it rather than redirecting to it.**
  A prior build of this feature shipped a genuine navigation dead-end: once a
  run had been started and the user navigated away, re-entering the multi-agent
  section from the sidebar always landed on a fresh agent-picker, with no route
  back to the run they had already paid for. The run existed and was readable by
  the server; the UI simply offered no way to ask for it. Three entrances need
  fixing — the configure surface (AC-66), the results surface (AC-67) and the
  pull-request page (AC-68).
  **Offer, not auto-redirect.** Automatically bouncing the configure surface to
  the results surface whenever the selected pull request has a run is tempting
  and was considered, but it replaces one dead-end with its mirror image: a
  route the user can navigate to directly, which then instantly redirects away,
  is a browser-Back trap — leaving results sends you to configure, which
  immediately returns you to results, and the section becomes impossible to
  leave backwards. It also makes one sidebar item behave as two different
  screens depending on invisible state. So the configure surface *leads with* a
  prominent affordance into the existing run while keeping "configure a new one"
  available, and never navigates on its own.
  **This is per-pull-request resume, not a history browser.** It answers "take
  me back to the run I already started on *this* PR", using the latest-run read
  this spec already requires (AC-25). It does not list runs across a repository
  and does not reopen N6, which stands unchanged.

## Shared contracts (stable surface the sibling feature depends on)

Stated here explicitly and normatively, because `specs/14-export-to-ci.md` is
written against it.

**Findings attribution — the contract.** A finding is attributed to exactly one
agent and exactly one run through its review:

```
findings.review_id  ──▶  reviews.agent_id   (which agent produced it)
                    ──▶  reviews.run_id     (which run produced it)
                                │
                                └──▶ agent_runs.id
                                       ├─ agent_id     (same agent)
                                       ├─ pr_id        (which PR)
                                       ├─ workspace_id (tenancy)
                                       └─ source       ('local' | 'ci')
```

Invariants this feature guarantees and Export-to-CI may rely on:

1. **No new attribution column is introduced.** The path above is complete
   today; a second parallel path would immediately become a drift surface (D9).
2. **Every review persisted by a run this feature groups has non-null
   `agent_id` and non-null `run_id`** (AC-23). This upgrades a schema-level
   convention into a stated requirement.
3. **`agent_runs.source` is the local/CI discriminator**, and this feature only
   ever writes `'local'` (AC-11). Export-to-CI owns `'ci'`.
4. **A multi-agent run is a grouping over `agent_runs`, and adds no third
   entity between a finding and its agent.** Aggregation and conflicts are
   computed *from* the attributed findings; they never become an alternative
   attribution.
5. **Concurrency does not change any of the above.** D16 alters only the order
   in which jobs start; every row each job writes, and the run it writes it
   under, are unchanged.

**Contract files this feature owns and implements:**
`server/src/vendor/shared/contracts/observability.ts` and its client twin — the
`AgentColumnFinding` / `AgentColumn` / `ConflictTake` / `Conflict` /
`MultiAgentRun` group only. `AgentStats` and `CuratorResult` in the same file
belong to other slices and are not touched (N15).

**Contract file this feature extends additively:**
`vendor/shared/contracts/platform.ts`'s `RunRequest`, in **both** copies — one
new optional field for the selected agent list (D3). Existing fields keep their
meaning and their consumers.

**Contract file this feature must not touch:**
`vendor/shared/contracts/eval-ci.ts` (Export-to-CI's, N11).

**New backend surface this feature adds (the only one beyond orchestration):**
the Learn finding action and its write into the existing, currently-unwritten
`memory` table (D24, AC-63 – AC-65). It reuses the table's existing `kind` and
`scope` vocabularies and adds no column, no embedding, and no retrieval path.
Whoever later builds the Memory feature proper inherits these rows; they must be
able to treat them as ordinary `kind: 'learning'` entries with no
multi-agent-specific shape.

**Shared UI primitive extended:** `Dropdown` / `DropdownItemDef`
(`client/src/vendor/ui/kit/`) gains multi-select rows — a checked state and
activation that does not dismiss the menu (D23). This primitive is shared with
`RepoSwitcher` and every other dropdown in the product, so the extension must be
additive and leave single-select rows behaving exactly as they do today.

**Deliberately-touched core file:** `server/src/modules/reviews/run-executor.ts`,
concurrency of the job loop only (D16). This is an approved, named exception
justified by its small and isolated blast radius. It is **not** precedent for
modifying core execution elsewhere, and it carries a regression obligation:
because the loop is shared with the existing single-agent and run-all triggers,
those paths must be verified observably unchanged — same persisted rows, same
per-run SSE events, only concurrent instead of serial (AC-19).

**Shared touchpoint flagged for later, not now:** the app-shell sidebar
(`client/src/vendor/ui/nav.ts` `NAV` array, and `SHORTCUTS` in the same file) is
touched by **both** this feature (one `multi-agent` item, D14) and the sibling
Export-to-CI feature (which adds `ci-runs` and `agent-performance` items —
`helpers.ts:48-49` and `shell.json` already reserve both keys). This feature
adds its own item and **must not delete, rename or reorder anything resembling
the sibling's entries**. Because this branch merges first, navigation
integration — that all three items coexist, none was clobbered, and each
resolves to a live route — must be re-verified as a **separate check after the
Export-to-CI worktree merges**, not assumed done by either branch alone.

**Verification** (this repo's real commands):
`pnpm --dir server typecheck && pnpm --dir server test`;
`pnpm --dir client typecheck && pnpm --dir client test`; and
`cd server && pnpm db:migrate` after the schema change — migrations are **not**
applied on boot (root `CLAUDE.md` §Conventions). Beyond new-feature tests, the
verification pass must include an explicit **regression** check that the
existing single-agent and run-all review triggers still produce the same
persisted rows and the same per-run event streams under the concurrent loop
(AC-19) — this is the one place where this feature can break behaviour it does
not own.

## User stories

- **US-1** — As a reviewer, I open Multi-Agent Review, pick a pull request, and
  choose exactly which agents to fan out — not all of them, the ones I want for
  this PR. *(AC-1, AC-2, AC-3, AC-4, AC-7, AC-8)*
- **US-2** — As a reviewer, before I commit to spending anything, I see what
  each agent is likely to cost and how long it takes, and what the whole
  selection adds up to. *(AC-5, AC-6)*
- **US-3** — As a reviewer, I fan out my chosen agents against the chosen PR in
  one action and get control back immediately.
  *(AC-9, AC-10, AC-13, AC-15)*
- **US-4** — As a reviewer, running four agents takes about as long as the
  slowest one, not four times as long. *(AC-16, AC-17, AC-18, AC-20)*
- **US-5** — As an existing user of the single-agent and run-all review buttons,
  nothing about my flow changes — same results, same live logs, same rows.
  *(AC-19)*
- **US-6** — As a reviewer, I see every selected agent's verdict, score,
  summary, model, cost, duration and findings side by side for the same PR.
  *(AC-25, AC-26, AC-27, AC-28, AC-29, AC-31, AC-32)*
- **US-7** — As a reviewer, I switch to a per-agent tab and read that agent's
  findings in full detail — rationale, suggested fix, confidence — and triage
  them right there, with the same actions I already use on the PR page.
  *(AC-33, AC-34)*
- **US-21** — As a reviewer already reading a pull request, I fan out several
  agents straight from the Run Review button on that page, without first
  navigating to a separate configure screen — and I can still get to that screen
  when I want the fuller picture. *(AC-60, AC-61, AC-62)*
- **US-22** — As a reviewer who agrees with a finding and wants the product to
  remember it, I hit Learn and the finding is recorded as a durable lesson for
  this repository — and the product does not overstate what that will do.
  *(AC-63, AC-64, AC-65)*
- **US-23** — As a reviewer who started a multi-agent run and then went
  somewhere else, I can get back to that run from wherever I re-enter — the
  sidebar, the pull request, or the results themselves — without re-running the
  agents and without being trapped on a screen I can't navigate back out of.
  *(AC-66, AC-67, AC-68)*
- **US-8** — As a reviewer, I see exactly where the agents disagree — a location
  one flagged and another didn't, or one they graded differently — and I can
  filter the view down to just those spots, from either layout.
  *(AC-30, AC-35, AC-36, AC-37, AC-38, AC-39, AC-40, AC-41, AC-42)*
- **US-9** — As a reviewer, I click through from any agent's result to that
  agent's own run logs — configuration, stats, prompt assembly, tool calls, raw
  output — in the same drawer I already know from the PR page.
  *(AC-43, AC-44, AC-45, AC-46)*
- **US-10** — As a reviewer whose run partly failed, I still get every agent that
  succeeded, with the failed ones named and their reasons shown, instead of
  losing the whole run. *(AC-47, AC-49, AC-50)*
- **US-11** — As a reviewer watching a run, I see per-agent progress as it
  happens rather than one opaque spinner for the whole batch. *(AC-48)*
- **US-12** — As a user, I can reach this surface from the sidebar, like every
  other section of the product. *(AC-52)*
- **US-13** — As the author of the Export-to-CI feature, I can attribute any
  finding to exactly one agent and one run through a stated, stable path, and I
  know a multi-agent run does not introduce a competing one.
  *(AC-21, AC-22, AC-23, AC-24)*
- **US-14** — As a user who double-clicks the run button, I get one run, not two
  overlapping fan-outs billing me twice. *(AC-12)*
- **US-15** — As a security-conscious owner, I cannot be made to run or read
  another workspace's agents, runs or findings, and hostile content in a PR
  cannot issue instructions to my models or inject markup into my browser.
  *(AC-14, AC-55, AC-56, AC-57)*
- **US-16** — As a keyboard or screen-reader user, I can pick a PR, select
  agents, start a run, read every agent's status, score and severity, switch
  layouts and open an agent's logs without relying on a mouse or on colour.
  *(AC-58)*
- **US-17** — As a maintainer, the contracts this feature adds or extends are
  identical in both `vendor/shared` copies and every response conforms to them.
  *(AC-53, AC-54)*
- **US-18** — As a reviewer, the run-summary line tells me what the run actually
  cost and how long it actually took, and doesn't name a mechanism the system
  doesn't use. *(AC-24, AC-59)*
- **US-19** — As a reviewer opening a PR nobody has fanned out yet, the surface
  tells me so and offers to start, instead of showing me an empty result.
  *(AC-51)*
- **US-20** — As the person who will later ship CI reviews, runs started from
  the studio are unambiguously marked local. *(AC-11)*

## Acceptance criteria (EARS)

*Terms used below.* A **multi-agent run** is one grouping identity over the set
of agent runs started together against one pull request. A **selected agent** is
an agent the user explicitly chose on the configure surface. A **participating
agent** is a selected agent whose grouped run reached a successful terminal
state (D8). A **location** is a `(file, [start_line, end_line])` pair carried by
a finding. Two findings **address the same location** when their files are equal
and their line ranges intersect (D7). A **conflict** is a location on which
participating agents' stances diverge (AC-37).

### Configuring a run (Screens A and B)

- **AC-1** — WHERE no pull request is selected, the configure surface shall
  prompt the user to select one, shall present no agent list, and shall keep the
  run action disabled.
  *Verify: with no PR chosen, the agent area shows the pick-a-PR-first state and
  the run control cannot be activated.*
- **AC-2** — WHEN a user selects a pull request, the system shall present every
  agent available in that workspace as an individually selectable entry showing
  that agent's name and its derived visual identity.
- **AC-3** — The system shall allow any subset of the presented agents to be
  selected and deselected, shall offer an affordance that selects all of them at
  once, and shall not alter any agent's stored configuration as a result.
  *Verify: selecting and deselecting agents leaves every agent's persisted
  enabled flag unchanged.*
- **AC-4** — The run action shall state how many agents are currently selected,
  and shall remain disabled WHILE no pull request is selected or no agent is
  selected.
- **AC-5** — The system shall present, for each selectable agent, an estimated
  duration and cost derived from that agent's own previously completed runs;
  WHERE an agent has no completed run to derive from, the system shall state
  that no estimate is available rather than presenting a zero or a fabricated
  figure.
- **AC-6** — The system shall present an aggregate estimate for the current
  selection as the **maximum** of the selected agents' estimated durations and
  the **sum** of their estimated costs, and shall update it as the selection
  changes.
  *Verify: selecting two agents estimated at 8.2s/$0.06 and 3.1s/$0.04 yields an
  aggregate of 8.2s and $0.10.*
- **AC-7** — WHERE the workspace has no agent available to select, the configure
  surface shall state so, shall offer a route to the agents surface, and shall
  not offer the run action.
- **AC-8** — WHEN a user opens the configure surface, selects a pull request, or
  changes the agent selection, the system shall make no LLM call.
  *Verify: exercising the whole configure flow against a stubbed provider
  produces zero provider calls.*

### Triggering a run

- **AC-9** — WHEN a user activates the run action with a pull request selected
  and at least one agent selected, the system shall start exactly one agent run
  per **selected** agent and shall group all of them under exactly one
  multi-agent run identity.
  *Verify: selecting four of five agents produces four run ids under one
  multi-agent run id.*
- **AC-10** — The system shall accept the selected agent set as an explicit list
  of agent identities on the existing review-trigger contract, added
  additively, so that the contract's existing single-agent and all-agents
  request forms remain valid and continue to behave as they do today.
- **AC-11** — WHEN the system creates agent runs for a multi-agent run started
  from the studio, it shall record each run's source as `local`.
- **AC-12** — WHILE a multi-agent run for a pull request is in flight, the
  system shall not start a second multi-agent run for that same pull request,
  and shall surface the in-flight run rather than queueing or duplicating it.
  *Verify: two rapid activations of the run action produce exactly one
  multi-agent run.*
- **AC-13** — WHEN a user triggers a multi-agent run, the system shall respond
  with the multi-agent run identity and its per-agent run identities before any
  agent's review has completed.
- **AC-14** — IF a requested agent identity does not belong to the caller's
  workspace, THEN the system shall refuse the whole request, start no agent run,
  and create no multi-agent run record.
  *Verify: a request mixing one valid and one foreign agent id starts zero
  runs.*
- **AC-15** — The system shall rate-limit multi-agent run triggering per
  workspace, since one activation fans out to one LLM execution per selected
  agent.
- **AC-60** — The system shall offer a second entry point to the multi-agent
  trigger from the pull-request detail page's existing Run Review control,
  presenting a selectable list of that workspace's agents with a per-agent
  duration estimate, an affordance that clears the selection, and a run action
  stating the number selected.
  *Verify: the pull-request page's Run Review control offers multi-agent
  selection alongside its existing single-agent and run-all options.*
- **AC-61** — WHEN a multi-agent run is triggered from the pull-request page,
  the system shall submit the same request shape, create the same multi-agent
  run, and present its results on the same results surface as a run triggered
  from the configure surface.
  *Verify: runs started from either entry point are indistinguishable once
  created.*
- **AC-62** — The pull-request page's agent picker shall offer a route to the
  full configure surface for the selected pull request, and the existing
  single-agent and run-all options of that control shall continue to behave as
  they do today.

### Concurrent execution (scoped core exception)

- **AC-16** — WHEN a batch of agent jobs is executed for a pull request, the
  system shall start those jobs concurrently rather than starting each only
  after the previous one has finished.
  *Verify: a batch of N agents whose executions each take roughly T completes in
  roughly T, not roughly N×T.*
- **AC-17** — The system shall preserve each agent job's existing per-agent
  error isolation under concurrent execution, so that one job failing neither
  aborts, delays, nor alters the outcome of any other job in the batch.
  *Verify: in a concurrent batch where one agent's provider throws, every other
  agent still persists its own run, review and findings.*
- **AC-18** — The system shall continue to resolve the pull request's diff and
  its shared context exactly once per batch, before any agent job starts, and
  shall not resolve them per job.
  *Verify: a batch of N agents produces one diff-load step, not N.*
- **AC-19** — WHERE a review is triggered through the existing single-agent or
  all-agents request forms, the system shall produce the same persisted rows and
  the same per-run event stream as it does today, differing only in the order
  and timing with which jobs start.
  *Verify: the existing single-agent and run-all review tests pass unchanged
  against the concurrent loop.*
- **AC-20** — WHILE jobs execute concurrently, the system shall keep every
  emitted progress event attributable to the single run that produced it, so
  that no run's live log receives another run's per-agent events.
  *Verify: in a concurrent batch, each run's event stream contains only its own
  agent's events, alongside the shared pre-work events.*

### Persistence and attribution

- **AC-21** — WHEN a multi-agent run is created, the system shall persist a
  record identifying its workspace, its pull request, when it ran, and exactly
  which agent runs it grouped, such that the grouped set is recoverable without
  inferring it from timestamps.
  *Verify: reading a stored multi-agent run returns the same run ids the trigger
  returned, after a server restart.*
- **AC-22** — The system shall attribute every finding produced under a
  multi-agent run to exactly one agent and exactly one agent run through that
  finding's review, and shall not introduce a second, parallel attribution path.
- **AC-23** — WHEN a review is persisted for an agent run belonging to a
  multi-agent run, the system shall record that review's agent identity and its
  run identity as non-null.
  *Verify: every review row produced by a multi-agent run has both `agent_id`
  and `run_id` set.*
- **AC-24** — The system shall report, for a multi-agent run, the number of
  agents it grouped, its total wall-clock duration and its total cost, the cost
  being the sum over its grouped runs; WHERE a grouped run's cost is unknown,
  the total shall be reported as unavailable rather than as zero.

### Results — common to both layouts

- **AC-25** — WHEN a user opens the results surface for a pull request that has
  at least one completed multi-agent run, the system shall present the latest
  such run as one result per grouped agent, each carrying that agent's name, its
  derived visual identity, provider, model, status, verdict, score, summary,
  duration, cost and findings.
- **AC-26** — The system shall present each agent's score as the deterministic
  0–100 review score already computed and persisted for that run, and shall
  state that a higher score is better, so the number is not read as a severity
  count or a ranking.
  *Verify: a run whose persisted score is 38 displays 38, with a legend stating
  the direction.*
- **AC-27** — WHERE a participating agent produced no findings, the system shall
  state that the agent produced no findings, rather than rendering an
  indistinguishably empty result.
- **AC-28** — WHERE a grouped run produced no summary, the system shall state
  that no summary exists for it.
- **AC-29** — The system shall offer both a side-by-side column layout and a
  per-agent tab layout of the same stored multi-agent run, and switching between
  them shall neither re-run any agent nor re-request the run.
  *Verify: toggling the layout issues no additional request.*
- **AC-30** — The system shall present the agent-disagreement section beneath
  the results in both layouts, rendered from the same computed conflicts rather
  than derived separately per layout.
- **AC-31** — WHEN a user opens the results surface or switches layouts, the
  system shall make no LLM call.

### Results — columns layout (Screen C)

- **AC-32** — In the column layout, the system shall present each agent's
  findings as compact entries carrying severity, title and file path, and shall
  present, per column, that agent's finding count and an affordance to open that
  agent's run logs.

### Results — tabs layout (Screen D)

- **AC-33** — In the tab layout, the system shall present one tab per grouped
  agent showing that agent's name and score, and shall present for the active
  tab a summary of that agent's run with its duration, cost and an affordance to
  open its run logs.
- **AC-34** — In the tab layout, the system shall render the active agent's
  findings through the same finding-detail component the pull-request review
  page already uses, offering the accept, dismiss, learn and turn-into-eval-case
  actions, and shall not introduce a multi-agent-specific finding card.
  *Verify: the tab layout's findings expose the same four triage actions, with
  the same behaviour, as the pull-request review page's findings.*
- **AC-63** — WHEN a user activates the learn action on a finding, the system
  shall record one durable memory entry for that finding's repository,
  classified as a learning, whose content is derived deterministically from that
  finding's title, file and line range, and rationale.
  *Verify: activating learn on a finding produces exactly one stored memory
  entry scoped to that repository, containing the finding's file and line
  range.*
- **AC-64** — WHEN the system records a memory entry from a finding, it shall
  record which finding it came from, and shall generate no embedding and make no
  LLM call.
  *Verify: activating learn against a stubbed provider produces zero provider
  calls and leaves the entry's embedding unset.*
- **AC-65** — The learn action shall not state or imply that the recorded entry
  will influence future reviews, since no retrieval path consumes these entries
  yet.
  *Verify: the learn action's copy claims that the finding was recorded, not
  that the agent has learned from it.*

### Conflicts

- **AC-35** — The system shall compute a multi-agent run's conflicts from that
  run's persisted findings at read time, and shall not store computed conflicts.
- **AC-36** — The system shall treat two findings as addressing the same
  location WHEN they cite the same file and their `[start_line, end_line]`
  ranges intersect, and shall not use semantic or embedding-based similarity to
  relate findings.
  *Verify: two findings on the same file at lines 10–20 and 18–25 are grouped as
  one location; the same two findings on different files are not.*
- **AC-37** — The system shall report a conflict at a location WHEN at least one
  participating agent flagged it and at least one other participating agent did
  not, OR WHEN two participating agents flagged it with different severities.
- **AC-38** — The system shall count as participating only those agents whose
  grouped run in that multi-agent run reached a successful terminal state, so
  that a failed or still-running agent is never presented as having declined to
  flag a location.
  *Verify: a run in which one agent failed and one agent flagged a line produces
  no conflict at that line.*
- **AC-39** — WHEN the system presents a conflict, it shall present the
  location as file and line, a title drawn from a flagging agent's finding, and
  for each participating agent either the severity that agent assigned together
  with a one-line rationale, or an explicit did-not-flag stance.
- **AC-40** — WHERE a multi-agent run's participating agents produced no
  conflicting location, the system shall state that the agents agree on every
  flagged location, rather than presenting an empty list.
- **AC-41** — The system shall offer a control that restricts the results
  presentation to conflicting locations only, and releasing it shall restore the
  full results without re-running or re-requesting.
- **AC-42** — WHERE fewer than two agents participated in a multi-agent run, the
  system shall compute no conflicts and shall state that comparing stances needs
  at least two successful agent runs.

### Per-agent logs (reuse, not rebuild)

- **AC-43** — WHEN a user activates the view-logs action on one agent's result,
  the system shall open, for that agent's grouped run, the same run-trace and
  live-log surface the pull-request detail page already uses.
- **AC-44** — The opened log surface shall present that run's configuration,
  stats, prompt assembly, tool calls, raw output and findings, and shall offer
  the copy-raw-output action, with behaviour unchanged from the pull-request
  detail page.
- **AC-45** — WHILE an agent's grouped run is in flight, its log surface shall
  stream that run's live progress events; WHEN the run completes, the surface
  shall present its persisted trace.
- **AC-46** — The system shall not introduce a second log drawer, sidebar or
  trace viewer for this feature.
  *Verify: the results surface's log affordance resolves to the same component
  the pull-request detail page mounts, not a copy of it.*

### Partial results and failure

- **AC-47** — IF one or more agents' grouped runs fail while at least one
  succeeds, THEN the system shall present the multi-agent run as partial
  results — every succeeded agent's result rendered in full, every failed
  agent's result marked failed with its recorded reason — and shall not present
  the multi-agent run itself as failed.
  *Verify: a run of four agents in which one agent's provider errors renders
  three full results and one failed result, and the run is readable.*
- **AC-48** — WHILE a multi-agent run is in flight, the system shall present
  per-agent progress and per-agent completion, and shall not collapse the batch
  into a single undifferentiated pending state.
- **AC-49** — IF every grouped run fails, THEN the system shall state that the
  run produced no results and shall name each agent's recorded failure reason.
- **AC-50** — IF the shared pre-work for a multi-agent run fails — the pull
  request's diff cannot be loaded — THEN the system shall mark every grouped run
  as failed with that reason and shall present that one shared reason rather
  than N identical per-agent errors.

### Empty states, resume and reachability

- **AC-51** — WHERE the selected pull request has no multi-agent run, the
  results surface shall state that no run exists yet and shall offer a route
  back to the configure surface to start one.
- **AC-66** — WHERE the pull request selected on the configure surface already
  has a multi-agent run, the configure surface shall present that run's results
  as a prominent, primary affordance ahead of the option to configure a new run,
  and shall not navigate away from itself automatically.
  *Verify: selecting a pull request that already has a run keeps the user on the
  configure surface, with a visible route into the existing results; the browser
  Back button still leaves the section.*
- **AC-67** — The results surface shall offer an explicit start-new-review
  action leading to the configure surface for the same pull request, with the
  agent selection open for editing.
  *Verify: from a results view, one action returns the user to the agent picker
  for that same pull request.*
- **AC-68** — WHERE a pull request already has a multi-agent run, its
  pull-request detail page shall offer a direct affordance to that run's
  results, and activating it shall start no agent run.
  *Verify: activating the affordance navigates to the existing results and
  creates no new run record.*
- **AC-52** — The multi-agent surfaces shall be reachable from the primary
  sidebar navigation using the existing navigation label, and the existing
  active-key detection shall resolve their route to the multi-agent section.
  *Verify: the navigation list contains an item whose key is the one
  `activeKeyFor` already returns for this route, and following it lands on the
  surface.*

### Contracts, security, accessibility

- **AC-53** — Every contract this feature adds or reshapes shall be present and
  identical in both `vendor/shared` copies, and the feature shall not increase
  the existing divergence between them.
  *Verify: a mechanical comparison of the two copies reports no new divergence
  in the files this feature touches.*
- **AC-54** — Every multi-agent response the system returns shall conform to the
  reserved multi-agent contract shape, and shall be rejected at the boundary
  rather than partially rendered if it does not.
- **AC-55** — WHERE a pull request, agent, agent run, multi-agent run or finding
  belonging to another workspace is requested — for read or for triggering — the
  system shall not disclose it and shall not act on it, over any surface.
- **AC-56** — The system shall render all model-authored text these surfaces
  display — verdicts, summaries, finding titles, rationales, suggestions and
  conflict rationales — through the product's existing sanitised rendering path,
  and shall not render supplied markup as markup nor introduce a new markdown
  surface for untrusted text without the same guarantees.
  *Verify: a finding whose title contains a script tag renders it as visible
  text.*
- **AC-57** — The system shall pass the pull request's diff, file paths and
  description to the models only through the existing review execution path and
  its shared injection guard, as data, and shall introduce no additional
  provider-facing repository content beyond what a single-agent review of the
  same pull request already sends.
- **AC-58** — Every agent status, finding severity, score and conflict stance
  shall be distinguishable without relying on colour alone; selecting a pull
  request, selecting and deselecting agents, starting a run, switching layouts,
  applying the conflicts-only filter and opening an agent's logs shall each be
  operable from the keyboard; and a change in an agent's run status shall be
  announced to assistive technology.

### Copy honesty

- **AC-59** — The system shall present a multi-agent run's summary line as its
  agent count, its wall-clock duration and its total cost, and shall not name an
  execution mechanism the system does not implement.
  *Verify: the rendered summary line reports a duration consistent with
  concurrent execution and contains no reference to worktrees or to a named
  queueing library.*

## Edge cases

- **A selected agent is deleted between configuring and running.** The trigger
  must refuse cleanly rather than starting a partial batch under a stale
  selection (AC-14 covers the foreign-agent case; a vanished agent is the same
  class of stale selection).
- **One agent's provider errors mid-batch.** The executor already isolates it
  (`run-executor.ts:191-199`), and concurrency must not weaken that (AC-17). The
  surface shows partial results (AC-47), and the failed agent must not count as
  "did not flag" in conflict computation (AC-38) — otherwise a timeout silently
  manufactures conflicts.
- **The shared diff load fails.** Different in kind from the above: it fails
  *every* grouped run (`run-executor.ts:78-97`), and it happens before any job
  starts, so concurrency does not change it. One shared reason, not N identical
  ones (AC-50).
- **Concurrent jobs interleaving their log events.** The pre-work logger fans
  out to every run in the batch and is then narrowed per run
  (`run-executor.ts:68,226`). Under concurrency the per-agent events now
  interleave in time, and each must still land only in its own run's buffer
  (AC-20). This is the single most likely regression from D16.
- **Concurrent jobs contending on the provider.** N simultaneous calls to the
  same provider can hit rate limits that N sequential calls would not. A
  provider-side rate-limit rejection surfaces as that one agent's failure
  (AC-17, AC-47), not as a batch failure — but see Non-functional on why this is
  a real new exposure that sequential execution was accidentally hiding.
- **Exactly one agent selected.** The run succeeds and renders one result;
  conflicts are structurally impossible and must be stated as such rather than
  rendered as "no conflicts found" (AC-42) — those two messages mean different
  things to a reviewer deciding whether to trust the result.
- **Zero agents selectable in the workspace.** No run record, no empty shell to
  clean up later (AC-7).
- **An agent with no run history on the configure screen.** No estimate exists;
  saying "8.2s · $0.06" would be a fabrication and "0s · $0.00" would be worse
  (AC-5).
- **Two agents flag the same lines at the same severity.** Agreement, not a
  conflict. It must not appear under the disagreement section, and the
  conflicts-only filter must hide it (AC-37, AC-41).
- **Two agents flag overlapping-but-not-identical ranges.** One location, by the
  intersection rule (AC-36). Picking the exact anchor line to display is a
  presentation choice over a range that genuinely spans both — see
  clarification 4.
- **A finding whose range spans a whole file, or a full-file-kind finding**
  (`secret_leak`, `lethal_trifecta`, `phantom`, `hook` — exempted from hunk
  intersection by `reviewer-core/src/grounding.ts:16`). Under a pure
  line-overlap rule such a finding can intersect nearly every other finding in
  that file and flood the disagreement section. *See clarification 2.*
- **Learn activated twice on the same finding.** Nothing deduplicates memory
  entries — there is no curation path (D24) — so a double-click writes two
  near-identical rows into a store that has no cleanup. Worth guarding at the
  action, since the cost of a duplicate is permanent.
- **Learn activated on a finding whose run's agent has since been deleted.** The
  memory entry is scoped to the repository, not the agent, so it survives; but
  the recorded provenance may point at a run whose `agent_id` is now null
  (`schema/runs.ts:24`).
- **The pull-request page's picker and the configure surface disagreeing.** Both
  submit the same shape (AC-61), but the PR-page picker shows no cost estimate
  and no aggregate. A user who selects four agents there gets the same bill with
  less warning than the configure surface would have given — which is precisely
  why AC-62 requires a route to the fuller surface.
- **Re-entering the section from the sidebar after starting a run.** This is the
  dead-end D26 exists to prevent. Landing on a fresh picker with no route back
  to the in-flight or completed run is a defect, not an empty state (AC-66).
- **A pull request whose only multi-agent run failed entirely.** It still counts
  as having a run for resume purposes — the user must be able to get back to it
  and read why every agent failed (AC-49), rather than being silently offered a
  fresh picker as though nothing had happened.
- **A run that is still in flight when the user returns.** Resume must lead to
  the live run with its per-agent progress (AC-48), not to a "no run yet" state
  and not to a second trigger.
- **A multi-agent run already in flight when the PR-page picker is used.** The
  in-flight guard is per pull request (AC-12) and applies regardless of which
  entry point triggered it; the picker must surface that rather than appear to
  start a second run.
- **Triaging a finding from the tabs layout.** The reused finding card writes
  through the existing finding-action route, so a finding accepted here is
  accepted everywhere, including on the PR review page. That is the correct
  behaviour, and it means the results surface is not read-only.
- **An agent is renamed or deleted after a run.** The stored run and its
  findings must still render — the results view reads persisted rows, and
  `agent_runs.agent_id` is `ON DELETE set null` (`schema/runs.ts:24`), so a
  deleted agent leaves a run with no agent id and the result must degrade
  legibly rather than crash.
- **A run is cancelled part-way** via the existing `POST /runs/:id/cancel`. That
  run is not successful, so it is not a participating agent (AC-38), and its
  result shows the cancelled state.
- **A second multi-agent run on the same PR.** Rows accumulate; the surface
  shows the latest (D11). The earlier run's `agent_runs` and findings stay
  intact and stay reachable from the PR detail page's run history.
- **A finding accepted or dismissed after the run.** Conflicts are computed from
  the finding rows, which survive triage; the disagreement view does not change
  meaning because a human triaged one side of it. *See clarification 3.*
- **A large PR reviewed by many agents.** Cost is agents × one review each, and
  the surface renders N × findings at once. Both are real limits worth stating
  (see Non-functional) even though neither is capped this slice.
- **Hostile content in a diff, a file path, a PR body or a model-authored
  finding title.** Reaches the models as data under the existing guard (AC-57)
  and the browser through the sanitised renderer (AC-56). Note the specific
  amplification of this surface: it renders **N agents' worth** of
  model-authored text on one page, where the PR detail page renders one run's.
- **A nav clash with the sibling Export-to-CI feature.** Both branches edit the
  same `NAV` array. Nothing errors if one clobbers the other — see §Shared
  contracts, and the post-merge navigation check named there.

## Non-functional

- **Cost.** One activation is *N* full review executions, one per selected
  agent, each with the same diff and context. This is the single most expensive
  user action in the product. It is explicit and never automatic (N10), stated
  before the spend (AC-5, AC-6), guarded against double-firing (AC-12),
  rate-limited (AC-15), and attributed after the fact (AC-24). Reading results
  is free by construction (AC-8, AC-31).
- **Latency.** With concurrent execution (D16), a multi-agent run's wall-clock
  time is roughly the **max** of the selected agents' latencies rather than
  their sum — which is what makes the mockups' "≈ 8.2s · $0.20" arithmetic true
  and what AC-59 now permits the copy to claim honestly. Per-agent progress is
  still required (AC-48), because agents finish at different times.
- **Provider load — a new exposure created by concurrency.** Sequential
  execution incidentally rate-limited this product against its own providers.
  Running N agents at once removes that accidental protection: N simultaneous
  calls, possibly to the same provider and key, can hit throttling that the
  serial version never reached. This does not change correctness — a throttled
  agent fails in isolation (AC-17) — but it is a real behavioural consequence of
  D16 and should be watched rather than discovered in production.
- **Regression risk is concentrated in one place.** D16's loop is shared with
  every existing single-agent and run-all trigger. AC-19 and AC-20 exist
  specifically because this feature can break behaviour it does not own, and the
  verification pass must treat the existing review tests as a gate, not a
  formality.
- **Determinism of conflicts.** Conflict computation is a pure, in-memory
  comparison over persisted findings with no model in the path (AC-35, AC-36):
  the same stored run must yield the same conflicts every time it is read.
  Concurrency changes the order runs are *written*, never the conflicts computed
  from them.
- **Security — untrusted input to the models.** The diff, file paths and PR body
  are contributor-controlled on any repository accepting outside contributions.
  They travel under the existing shared `INJECTION_GUARD`
  (`reviewer-core/prompt.ts`) as data; no per-feature keyword scanning is
  introduced, consistent with `server/CLAUDE.md` §Gotchas. This feature sends
  strictly no additional repository content to any provider beyond what a
  single-agent review of the same PR already sends (AC-57).
- **Security — untrusted output rendered in a browser.** These surfaces render
  N agents' model-authored verdicts, summaries, finding titles, rationales and
  suggestions simultaneously, and the tabs layout renders them expanded. All of
  it goes through the existing sanitised rendering path (AC-56). Specifically
  noted because `client/LEARNINGS.md` (2026-08-13) records that the shared
  `vendor/ui/primitives/Markdown.tsx` blocks raw HTML but does **not** constrain
  link or image targets — any feature rendering untrusted markdown through it
  must strip disallowed targets before the client sees them, not after.
- **Security — an attacker-chosen agent list.** The trigger now accepts a list
  of identities from the client (D3). Every identity must be resolved against
  the caller's workspace before any run starts, and a single foreign identity
  must fail the whole request rather than being silently dropped (AC-14, AC-55)
  — silently dropping it would let a caller probe which ids exist.
- **Security — workspace scoping.** `multi_agent_runs` is workspace-scoped at
  the schema level (`schema/runs.ts:85-87`), but findings reach a workspace only
  transitively (`findings → reviews.workspace_id`). Every read and every trigger
  must resolve the caller's workspace before touching a row (AC-55).
- **Performance of the read path.** The results read joins one multi-agent run
  to N runs to N reviews to their findings, then computes conflicts over the
  union. It must render from stored rows alone — no diff re-fetch, no repository
  checkout, no provider call (AC-31). `server/LEARNINGS.md` (2026-07-28) records
  the house pattern for this shape: IN-query plus JS grouping, not per-row
  queries.
- **Backwards compatibility.** The pull-request detail page, its run history,
  the run trace drawer, the SSE stream, the finding-action routes and per-agent
  error isolation all behave exactly as today (N2, AC-19). Adding these surfaces
  must not change any existing route's response shape; the one contract change
  is additive (D3).
- **Accessibility.** Status, severity, score and conflict stance legible without
  colour — which matters more here than elsewhere, because the mockups lean
  heavily on per-agent colour coding (D21); the full flow keyboard-operable; run
  status transitions announced (AC-58).
- **Migration discipline.** The schema change to `multi_agent_runs` needs a
  migration, and migrations are **not** applied on boot — `cd server && pnpm db:migrate`
  after pulling. The table has zero rows today, so the change is safe to make in
  place with no backfill (D1).

## Inputs (provenance)

| Input | Provenance |
|---|---|
| The list of agents offered for selection | `[reused: the workspace's existing agent records]` |
| The selected agent set for a run | `[deterministic: the user's explicit choice on the configure surface, validated against the caller's workspace]` |
| Per-agent duration and cost estimate | `[deterministic: aggregated over that agent's existing completed agent_runs rows (duration_ms, cost_usd) — no LLM call, no prediction]` |
| Aggregate estimate for a selection | `[deterministic: max of the per-agent duration estimates, sum of the per-agent cost estimates]` |
| Per-agent visual identity (colour, icon) | `[deterministic: derived from the agent's own identity client-side — no schema field, no stored value]` |
| Each agent's identity for a run (system prompt, model, provider, strategy, linked skills, repo-intel toggle) | `[reused: the existing agent record and its existing per-agent configuration]` |
| The pull request's unified diff | `[reused: loaded once per batch by the existing executor pre-work]` |
| Derived PR intent, repo map, callers digest, project-context documents | `[reused: the existing per-batch / per-agent context resolution — unchanged by this feature]` |
| Each agent's verdict, summary and findings | `[new: N LLM call(s) per multi-agent run — one existing review execution per selected agent; each agent's configured strategy determines calls per agent]` |
| Each agent's 0–100 score | `[reused: scoreFromFindings, already computed deterministically from grounded findings inside every review execution and already persisted — no additional call, no new algorithm]` |
| Which findings survived citation grounding | `[reused: the existing grounding gate, already computed inside every review execution — no additional call]` |
| Per-agent duration, tokens and cost (actual) | `[reused: the existing per-run token accounting and cost estimation persisted on agent_runs]` |
| Finding → agent → run attribution | `[deterministic: the existing findings.review_id → reviews.agent_id/run_id → agent_runs.id path — no new column, no new computation]` |
| Conflicts and agreements between agents | `[deterministic: code-only file equality plus line-range intersection over persisted findings, computed on read — never model-authored]` |
| The selected agent set submitted from the pull-request page | `[deterministic: the user's explicit choice in the existing Run Review control, validated against the caller's workspace exactly as the configure surface's selection is]` |
| A memory entry recorded by the learn action | `[deterministic: assembled in code from the finding's own persisted title, file, line range and rationale — no LLM call, no embedding, no summarisation]` |
| Multi-agent run agent count, wall-clock duration, total cost | `[deterministic: aggregated in code over the grouped agent runs]` |

## Untrusted inputs

- **The selected agent identity list submitted with a trigger.** Client-supplied
  and therefore attacker-controllable. Every identity must be resolved against
  the caller's workspace before any run starts, and a foreign identity must fail
  the whole request rather than be silently dropped (AC-14).
- **The pull request's diff, including code content and file paths.**
  Contributor-controlled on any repository accepting outside contributions.
  Reaches every one of the N models in a multi-agent run. Data, never
  instructions.
- **The pull request's title and description.** Author-controlled free text that
  reaches every selected agent's prompt. Data, never instructions.
- **Every agent's findings — titles, rationales, suggestions — and its verdict
  and summary.** Model-authored over attacker-influenceable input, then rendered
  N-at-a-time on one page, and rendered *expanded* in the tabs layout. Untrusted
  for rendering.
- **Conflict titles and per-agent rationale lines.** Derived from the above
  model-authored finding text; they inherit its untrusted status and must not be
  treated as safe merely because a deterministic function assembled them.
- **Finding file paths and line numbers used for conflict matching.**
  Model-authored, already filtered by the citation-grounding gate, but still
  data to be compared — never a path to open, resolve, or interpolate into a
  query.
- **Finding text copied into a memory entry by the learn action.** This is
  model-authored text over attacker-influenceable input being promoted into a
  durable, repository-scoped store that a future retrieval path is expected to
  feed back into prompts. It is the longest-lived untrusted payload this feature
  creates: a single Learn on a poisoned finding outlives the run, the pull
  request and the review it came from. It must be stored as data, must be
  rendered sanitised wherever it is later displayed, and must never be treated
  as trusted merely because a human pressed Learn on it.
- **Agent names and descriptions.** Workspace-authored configuration rendered as
  selection rows, column headers, tab labels and conflict personas. Untrusted
  for rendering; must render as text, never as markup.

## Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Configure run (Screens A/B)
    participant R as Results (Screens C/D)
    participant API as Server
    participant DB as multi_agent_runs / agent_runs / reviews / findings
    participant X as ReviewRunExecutor
    participant M as Models
    participant D as RunTraceDrawer (existing, reused)

    Note over U,C: 1 — configure: pick a PR, pick agents, see the price
    U->>C: select a pull request
    C->>API: read agents + each agent's historical duration/cost
    API-->>C: agent list + per-agent estimates (0 LLM calls)
    U->>C: check/uncheck agents (or Select all)
    C->>C: aggregate = MAX(durations), SUM(costs)
    U->>C: Run multi-agent review (N)

    Note over U,C: 1b — OR the lighter entry point, from the PR page itself
    U->>C: PR page · "Run Review ▾" · check agents · Run (N)
    Note right of C: same request shape, same run,<br/>same results surface (AC-61);<br/>"Configure agents…" leads here

    Note over U,R: 1c — resume: every entrance can reach an existing run (D26)
    U->>C: re-enter configure · PR already has a run
    C-->>U: prominent "view existing results" + "configure a new run"<br/>(offered, never auto-redirected — AC-66)
    U->>R: PR page · "view multi-agent results" (starts nothing — AC-68)
    U->>C: Results · "Start new review" (AC-67)

    Note over C,DB: 2 — trigger
    C->>API: start run · PR id + explicit agent id list
    API->>API: validate every agent id against the caller's workspace
    API->>API: guard in-flight run for this PR
    API->>DB: create multi-agent run + one agent_run per agent (source='local')
    API-->>R: multi-agent run id + per-agent run ids (immediately)

    Note over API,M: 3 — execution: shared pre-work once, then CONCURRENT jobs
    API->>X: executeRuns(jobs)
    X->>X: load diff ONCE · resolve intent ONCE
    par one job per selected agent, concurrently (D16)
        X->>M: agent A · reviewPullRequest
        and
        X->>M: agent B · reviewPullRequest
        and
        X->>M: agent C · reviewPullRequest
    end
    Note right of X: each job keeps its OWN try/catch —<br/>a failure is isolated, order only changed
    X->>DB: per job: review (agent_id, run_id) + findings + score + trace

    Note over U,R: 4 — read: aggregate + derive conflicts, zero LLM calls
    U->>R: open results · Columns | Tabs
    R->>API: read latest multi-agent run for this PR
    API->>DB: grouped runs → reviews → findings
    API->>API: conflict = same file AND overlapping line range,<br/>over SUCCEEDED agents only
    API-->>R: per-agent results + conflicts (stored data only)
    U->>R: "Show only conflicts"

    Note over U,D: 5 — drill into one agent's logs (reused component)
    U->>R: view trace on an agent's result
    R->>D: mount with that agent's runId + run findings
    D->>API: existing /runs/:id/events (live) · /runs/:id/trace (persisted)
    API-->>D: configuration · stats · prompt assembly · tool calls · raw output
```

## [NEEDS CLARIFICATION: …]

1. **Learn writes memory entries that nothing reads yet.** Resolved as far as
   *this* spec goes — Learn is in scope, scoped to the narrowest useful write
   (D24, AC-63 – AC-65) — but the consequence should be acknowledged rather than
   buried: there is no retrieval path anywhere in the product, so these rows
   accumulate without affecting a single review until the Memory feature ships.
   AC-65 keeps the copy honest about that. The open question is whether that is
   acceptable as a shipped user-facing action, or whether Learn should stay
   hidden behind the same triaged-only gate that Turn-into-eval-case uses
   (`FindingCard` shows that action only once a finding is accepted or
   dismissed) until retrieval exists. Recommend the latter if the ambiguity
   bothers anyone; this spec does not currently require it.
2. **Full-file and whole-file-range findings in conflict computation.** Under a
   pure line-overlap rule (AC-36), a finding whose range covers most of a file —
   including the full-file kinds `secret_leak`, `lethal_trifecta`, `phantom` and
   `hook`, which `reviewer-core/src/grounding.ts:16` exempts from hunk
   intersection entirely — can intersect nearly every other finding in that
   file, flooding the disagreement section with low-signal entries. Options:
   exclude full-file kinds from conflict matching; cap the range width that
   participates; or accept it this slice and revisit. Not resolved here because
   each option changes what AC-37 reports, and there is no data yet on how often
   it actually bites.
3. **Does triage state affect the disagreement view?** A finding accepted or
   dismissed after the run still exists as a row, so conflicts computed from it
   are unchanged (as this spec assumes). But a reviewer who has already
   dismissed one side of a conflict arguably shouldn't keep being shown it as an
   open disagreement — and now that the tabs layout lets them triage *from this
   very page* (D19), they will hit this immediately. Left unresolved rather than
   guessed: it is a product judgement about what the disagreement view is *for*,
   and the simplest behaviour — ignore triage entirely — is what this spec
   currently specifies.
4. **Conflict anchor line for a range.** `Conflict` carries a single
   `line: number` (`observability.ts:68`) while findings carry a
   `[start_line, end_line]` range, so a conflict over two overlapping ranges
   must collapse to one displayed line. This spec does not fix which one (the
   earliest flagging finding's start line is the obvious default).
   Presentation-level and safe to decide during planning; recorded here so it
   isn't decided silently.
5. **Repo-state grounding tools were unavailable this session.**
   `get_conventions`, `get_blast_radius` and `get_findings` all require the
   local API on `http://localhost:3001`, which was not running, so this spec is
   grounded in direct reads of the schema, contracts, executor, routes,
   components, copy and both modules' `LEARNINGS.md` instead. If there are
   accepted repo conventions or prior findings recorded against
   `modules/reviews` or the app-shell navigation, they have not been checked
   against this spec.
