# Spec: Eval Pipeline   |   Spec ID: SPEC-12   |   Status: approved

Lesson L06. **Affected modules:** `server`, `client`. Cross-module, hence a root
spec. `reviewer-core` is a consumer-only dependency and is deliberately unchanged
(D6); `mcp-server` and `e2e` are non-goals for this slice (N9, N10).

> **Disambiguation, stated once and normatively.** The `evals/` directory at the
> repository root is a *different system*: it evaluates the Claude Code
> harness — skills, agent prompts, workflow routing — used to *build* DevDigest,
> and its blocking CI gate is `cd evals && pnpm eval:quality` (root
> `CLAUDE.md` §Eval Self-Check). This spec describes a **product feature**: a
> regression harness for DevDigest's *own* review agents, living in `server/` and
> `client/`, surfaced in the product UI. The two share the word "eval" and
> nothing else — no schema, no contracts, no scripts, no graders. Nothing in this
> spec may read from, write to, or depend on `evals/`, and nothing in `evals/`
> may depend on this feature.

## Problem & Motivation

DevDigest ships review agents (Security Reviewer, Performance Reviewer, …) whose
behaviour is determined by three editable things: a system prompt, a model, and a
set of linked skills. All three are editable today from the Agent editor, and
`agent_versions` already snapshots every config change. What does **not** exist
is any way to answer the question that immediately follows an edit:

> Did the agent get better or worse?

Today the only answer is to open pull requests and eyeball findings. That is
slow, unrepeatable, and unfalsifiable: two people looking at the same PR after a
prompt change will disagree, and neither can point at a number. A prompt edit
that quietly introduces a class of false positives is invisible until a reviewer
complains.

The raw material for a proper answer already exists and is already paid for.
Every review produces `Finding` records, and reviewers already triage them:
`POST /findings/:id/accept` and `POST /findings/:id/dismiss` are shipped routes
(`server/src/modules/reviews/routes.ts:43,233`), and the decision is persisted as
`accepted_at` / `dismissed_at` on the finding record
(`vendor/shared/contracts/review-api.ts:15-19`). Those two timestamps are a
labelled dataset that the product has been accumulating without ever reading it
back:

- An **accepted** finding is a human saying *"this is a real problem, at this
  file and these lines"* — a positive example the agent must keep finding.
- A **dismissed** finding is a human saying *"this is noise"* — a negative
  example the agent must stop producing.

This feature turns those decisions into a reusable regression set, runs an agent
against that set on demand, and scores the result **entirely in code** — no LLM
judge, no second model, no subjective grading. The scoring predicate already
exists too: the citation-grounding gate
(`reviewer-core/src/grounding.ts:52`) already decides whether a finding's
`file` + `[start_line, end_line]` corresponds to real changed lines. Matching an
agent's finding against an expectation is the same shape of comparison.

The result is the thing the product cannot do today: change a system prompt, run
the same fixed case set before and after, and read the difference as three
numbers — **recall**, **precision**, **citation accuracy**.

### This space is already reserved in four independent places

Like SPEC-11's `pr_brief`, this feature has reserved surface with zero consumers.
Read before drafting, and adopted rather than duplicated (D1):

1. **Tables.** `eval_cases` and `eval_runs` exist in
   `server/src/db/schema/eval.ts:7,22` and shipped in `0000_init.sql`. Neither is
   referenced anywhere outside the schema file and the barrel
   (`server/src/db/schema.ts`) — zero readers, zero writers, zero rows.
2. **Base contracts.** `EvalRun`, `EvalCase`, `EvalOwnerKind`, `EvalPerTrace`
   in `vendor/shared/contracts/knowledge.ts:194-228`.
3. **API contracts.** `EvalCaseInput`, `EvalRunRecord`, `EvalRunResult`,
   `EvalTrendPoint`, `EvalDashboard` in `vendor/shared/contracts/eval-ci.ts`,
   whose file header names this lesson explicitly ("A4 — Eval / CI / Compose /
   Conformance API contracts (L06)").
4. **UI slots.** `client/.../AgentEditor/constants.ts` comments its `TABS` array
   with *"later lessons add Evals/Stats/CI"*, and `client/src/vendor/ui/nav.ts`
   comments the SKILLS LAB section with *"Eval Dashboard joins this section once
   its route ships"*.

The reserved shapes do **not** all fit the feature as briefed. Each mismatch is
resolved explicitly below rather than silently, following the SPEC-11 precedent.

## Goals / Non-goals

### Goals

- **G1** — Turn a single triaged finding into a reusable eval case in one action,
  with the expectation type derived from the human decision already recorded:
  accepted → *must find*, dismissed → *must not flag*.
- **G2** — Store each case with a **frozen, self-contained input**, so that the
  only thing that varies between two runs of the same case set is the agent's own
  configuration.
- **G3** — Run one agent against its whole case set as a single, identifiable
  **suite run**, and record what it scored, which agent version produced it, and
  which cases it covered.
- **G4** — Score every run with **zero LLM calls in the scoring path**: matching
  is file equality plus line-range intersection, computed in code.
- **G5** — Define `citation_accuracy` as a *reuse* of the existing
  citation-grounding gate, never as a second, parallel definition of what a valid
  citation is.
- **G6** — Make a prompt change's effect legible: two runs on the same case set
  compare side by side, with per-metric deltas and a diff of the two agent
  configurations that produced them.
- **G7** — Give one agent's evals a home inside the Agent editor (case set + run
  history) and give all agents a global dashboard (latest metrics, trend, recent
  runs across agents).
- **G8** — Make the cost of a run visible and attributable before and after it
  runs, since a run is N review executions, not one.
- **G9** — Ship a mechanical `verify:l06` check that proves the feature is wired
  end to end, not merely compiling.

### Non-goals (explicitly out of scope for this slice)

- **N1 — Any LLM-based grading.** No judge model, no rubric scoring, no
  model-authored explanation of a metric move. Every number and every sentence
  this feature displays is computed deterministically from stored run data
  (AC-16, AC-45). This is the feature's defining constraint, not a budget
  preference.
- **N2 — Synthetic case authoring as the primary path.** Cases originate from
  real triaged findings (G1). Hand-editing a case after creation is supported
  (AC-12); inventing one from nothing is not a flow this slice designs for.
- **N3 — Skill-owned eval cases.** The reserved `EvalOwnerKind` enum admits
  `'skill'`; this slice implements `'agent'` only (see clarification 7).
- **N4 — Using the agent's verdict, summary or score in scoring.** Only its
  findings are scored (D7).
- **N5 — Automatic runs.** No run is triggered by a review completing, a prompt
  being saved, a page opening, a schedule, or CI. Every run is an explicit user
  action (D11).
- **N6 — Cross-agent metric comparison as a ranking.** The dashboard lists agents
  side by side, but two agents' numbers are computed over *different* case sets
  and are not comparable as a leaderboard; the surface must not imply otherwise
  (AC-43).
- **N7 — Changing how reviews, findings, accept/dismiss, grounding or agent
  versioning currently work.** This feature is a pure consumer of all of them.
- **N8 — Gating anything on a metric.** No run blocks a merge, fails CI, disables
  an agent, or prevents a prompt from being saved.
- **N9 — An MCP tool** exposing eval cases, runs or metrics.
- **N10 — An e2e browser flow**, consistent with the SPEC-09/10/11 precedent.
- **N11 — Exporting or importing case sets** between workspaces or repos.
- **N12 — "Promote" as a shipped action.** Decided post-draft: not in the
  assignment's acceptance list, and skipped to fit the time budget. D15 remains
  as the documented design *should it ship later*; AC-35 is marked deferred
  rather than removed, to avoid renumbering (see "Resolved decisions" below).
- **N13 — Eval runs integrated into the product's existing cost/observability
  surfaces.** Decided post-draft: out of scope for this slice. Cost is
  displayed only within the eval surfaces themselves (AC-24–AC-27).

### Decisions against the reserved code

- **D1 — Adopt the reserved `eval_cases` / `eval_runs` tables and the reserved
  `Eval*` contracts; do not introduce a parallel set beside them.** The brief
  asks for "new tables `eval_cases` and `eval_runs`"; they already exist, with
  zero rows and zero consumers. Building second tables under near-identical names
  is exactly the trap `server/LEARNINGS.md` (2026-08-04) already records — "this
  codebase can reserve more than one integration point under the same name for
  different lessons" — and SPEC-11 D6 paid for it once already. Because both
  tables are empty and unread, reshaping them in place needs no data migration
  and no compatibility shim.
- **D2 — A run is *set-level*, and the reserved per-case `eval_runs` row cannot
  express that.** The brief's unit of work and of comparison is "the agent
  against **all** its eval cases", and `recall` / `precision` are only meaningful
  over a set — a single case yields 0 or 1 and nothing else. The reserved
  `eval_runs.case_id` is `NOT NULL` (`schema/eval.ts:24`) and `EvalRunRecord`
  requires `case_id` (`eval-ci.ts:35`), so the reserved row is *per case
  execution*. Corroborating the read: the reserved `EvalRun`
  (`knowledge.ts:202`) already carries the exact set-level shape — `recall`,
  `precision`, `citation_accuracy`, `traces_passed`, `traces_total`,
  `duration_ms`, `cost_usd`, `per_trace[]`. **Resolution at spec level:** the
  system must be able to identify one suite run, carry set-level metrics for it,
  carry a per-case outcome under it, and compare two suite runs. Whether that is
  a new grouping identity or a widened existing row is a planning decision, not a
  spec one.
- **D3 — Expectation type is explicit and first-class.** The reserved
  `expected_output` is `z.unknown()` (`knowledge.ts:225`), which would leave
  "is this a positive or a negative example?" inferable only by convention. Each
  case carries exactly one expectation type — `must_find` or `must_not_flag` —
  as a validated, closed-vocabulary field, and the scorer branches on it rather
  than on the shape of a JSON blob (AC-3, AC-4).
- **D4 — A suite run records the agent configuration version it ran against.**
  `agents.version` and `agent_versions.config_json` already exist
  (`schema/agents.ts:33,38-49`) and `GET /agents/:id/versions` already serves the
  history (`agents/routes.ts:141`). Without recording it, "old prompt vs new
  prompt" has no source for the prompt diff the compare view must show, and
  "which change moved the number?" is unanswerable. The reserved `eval_runs` has
  no such column.
- **D5 — A suite run records the exact set of case ids it covered.** Cases can be
  added and deleted between runs, which silently breaks the brief's own
  "apples-to-apples" requirement. Recording the covered set is what makes AC-33
  (comparison must state a case-set difference) possible at all.
- **D6 — `citation_accuracy` reuses the existing grounding gate verbatim;
  `reviewer-core` is untouched.** `groundFindings`
  (`reviewer-core/src/grounding.ts:52`) already defines a valid citation: the
  finding's `file` must be present in the diff, and its
  `[start_line, end_line]` must intersect a real hunk on that file — except for
  full-file kinds (`secret_leak`, `lethal_trifecta`, `phantom`, `hook`,
  `grounding.ts:16`), which need only the file to be present.
  `groundingSummary` (`grounding.ts:87`) already emits `kept/total`. This is the
  package's declared do-not-touch surface (`reviewer-core/CLAUDE.md`
  §Do-not-touch), it already runs inside every review execution, and its result
  is already returned. `citation_accuracy` is therefore a *read* of a number the
  product already computes — not a new rule, not a re-implementation, and not a
  reason to modify `reviewer-core`.
- **D7 — Only findings are scored.** A review execution also produces a verdict,
  a summary and a score, all model-authored and all irrelevant to whether the
  agent located the right lines. Scoring reads `findings` and nothing else, which
  is also what keeps the scoring path free of any model judgement (N1, N4).
- **D8 — A case's input is frozen at capture and never re-fetched.** A case
  stores its own unified diff (and the PR metadata needed to run against it)
  rather than a pointer to a live PR. A pointer would make the input drift with
  force-pushes, repo deletion and branch cleanup, and would destroy
  reproducibility — the one property the whole feature rests on (G2). It also
  means a case outlives the review, PR, and repo it came from.
- **D9 — An eval run's prompt gets *only* what the frozen input can supply.**
  This is the sharpest consequence of D8 and it must be stated, not discovered
  during implementation. A live PR review currently enriches the prompt with a
  repo map, a callers digest, project-context documents, the PR description and
  the derived intent (`server/src/modules/reviews/run-executor.ts:283-330`), all
  of which need a persisted repo checkout and a live PR. An eval run has neither.
  Feeding them in from *today's* repo state would make a case's result change
  when unrelated code is pushed — a silent reproducibility break. So an eval run
  receives the agent's versioned identity (system prompt, model, strategy, linked
  skill bodies) plus the case's frozen input, and nothing else; the exclusion is
  stated on the run rather than hidden (AC-8, AC-9). This mirrors SPEC-08's
  "prompt parity" posture for the same reason.
- **D10 — Both `vendor/shared` copies, reconciled by hand.** Root `CLAUDE.md`
  §Do-not-touch warns the two copies are independent and already drifted, and
  `eval-ci.ts` is *itself* one of the drifted files: the server copy carries
  `AgentManifest` and a three-value `ConformanceInput.provider` enum, the client
  copy carries neither. Any contract this feature adds or reshapes must land in
  both copies, and this feature must not widen the existing drift (AC-50).
- **D11 — Every run is an explicit user action.** Opening the Evals tab or the
  dashboard renders stored data and spends nothing (AC-28). A run costs one
  review execution per case; a "Run all agents" action multiplies that by the
  agent count. Auto-running on prompt save — superficially attractive — would
  turn every keystroke-level config edit into a bill.
- **D16 — A case's frozen input is a diff fragment, scoped to the file(s) the
  expectation's finding came from — not the whole PR.** Resolves clarification
  1. The brief calls it a "diff fragment" (not "the PR"), and scoping it
  per-file keeps precision's denominator meaningful: a whole-PR frozen input
  would let an agent rack up unrelated findings in untouched files and dilute
  precision on noise the case was never about. Concretely: the frozen diff is
  the full unified diff of the finding's file only (all its hunks, so
  surrounding context survives), the file list is that one file, and the
  frozen PR metadata is trimmed to the id/title/body needed for prompt parity
  (D9) — never the full PR's file list. Two findings in the same file each
  still become two separate cases (simpler data model, and each case's
  pass/fail stays independently readable); each carries its own copy of that
  file's diff.
- **D17 — Creating a case from a finding is idempotent, not error-prone.**
  Resolves clarification 1's duplicate question. WHEN the turn-into-eval-case
  action is activated on a finding that already has a case, the system returns
  the existing case rather than creating a second one (AC-1 amended below) —
  simplest behaviour for a UI action a user might double-click, and it avoids
  two cases silently double-counting the same expectation in one suite run's
  metrics.
- **D18 — An agent's cases and runs are deleted when the agent is deleted.**
  Resolves clarification 6. `eval_cases.owner_id` is polymorphic with no
  foreign key (`schema/eval.ts:12-13`), so nothing cascades at the database
  level; the agent-delete service must explicitly delete `eval_cases` (and
  their `eval_runs`) where `owner_kind = 'agent' AND owner_id = :agentId`
  before deleting the agent, application-side. Orphaned, unreachable eval rows
  are worse than losing a regression history for a deleted agent.
- **D19 — A stuck in-flight run is reconciled by timeout, not left permanent.**
  Resolves clarification 10. A run is considered stale if it has been
  `running` for longer than a fixed timeout (15 minutes — well above a
  worst-case suite of review executions); on the next request to start a run
  for that agent, or on server startup, any stale `running` row for that agent
  is marked `errored` (interrupted) before the guard in AC-15 is evaluated,
  so a restart cannot deadlock an agent's runs permanently.
- **D20 — A run with errored cases remains eligible for comparison.**
  Resolves clarification 3. AC-11 already excludes errored cases from that
  run's own metrics; a comparison against another run is computed over cases
  common to both (AC-33's existing mechanism), so an errored case simply
  narrows that intersection rather than requiring a separate "unusable for
  comparison" state.
- **D21 — `verify:l06` lives in `server/package.json`, mirroring the
  `verify:l03` precedent, and may skip its DB-backed checks without Docker.**
  Resolves clarification 4. There is no root `package.json` in this
  repository. The migration/route checks in AC-57 follow the existing
  `*.it.test.ts` / testcontainers convention (`server/CLAUDE.md` §Testing) of
  self-skipping when Docker is unavailable — consistent with every other
  `verify:lNN` script, not a new exception. No separate client-side script is
  added; contract-parity (AC-50) and the scoring unit suite are both plain
  Vitest and run from the same command.
- **D22 — The ≥8-case bar (AC-29) is met by seed data plus one live-created
  case, not eight hand-triaged findings.** Resolves clarification 5. Seven
  fixture cases ship as seed data for the demo workspace/agent (so
  `verify:l06` can assert the count mechanically and deterministically,
  without depending on any human having triaged real findings first); the
  eighth is created live from a real accepted/dismissed finding during the
  AC-1–AC-7 demonstration. Both `must_find` and `must_not_flag` expectation
  types must be present across the seeded seven.

### Decisions resolved from the supplied mockups

The reference mockups are the visual target. Four genuine gaps in them are
resolved here rather than left open.

- **D12 — The dashboard's callout banner must be derived, not narrated.** The
  mockup shows *"Precision dipped 2pts on v7 — a new false positive slipped in"*.
  The first clause is computable: it is the largest absolute metric delta between
  the two most recent runs, plus the agent version. The second clause is a
  *causal claim*, and it is only assertable when the run data actually shows it —
  i.e. when a specific `must_not_flag` case transitioned from pass to fail
  between those two runs. Resolution: the banner states the metric, the
  direction, the magnitude and the version, and names the specific case
  transitions that account for it **only when such transitions exist**; it never
  produces a causal sentence it cannot substantiate, and it is never
  model-authored (AC-45, N1).
- **D13 — "Traces Passed" is a fourth tile alongside the three metrics, not a
  fourth metric.** The mockup shows four tiles; the brief names three metrics.
  The reserved `EvalRun` resolves this — `traces_passed` / `traces_total`
  (`knowledge.ts:206-207`) are counts, not ratios. Resolution: the tile shows
  passed-of-total cases, and per-case pass/fail is defined independently of the
  three ratios (AC-17).
- **D14 — The case editor's "Expected output" is an editable expectation, and
  editing it must not silently invalidate history.** The mockup shows expected
  output as a free JSON array of finding skeletons. Free JSON plus a code scorer
  is a validation surface: a malformed or hostile payload must be rejected at the
  boundary, not at scoring time (AC-13). Separately, editing a case's expectation
  changes what past runs *would* have scored — so past runs must remain readable
  as what they scored at the time, never retroactively recomputed (AC-14).
- **D15 — "Promote v7" is scoped as a config restore with append-only history
  (deferred — not implemented this slice, see N12).** The mockup's compare
  modal offers promoting the better run's version. Documented design should it
  ship later: promoting makes that version's stored config the agent's current
  config by recording a **new** version, never by rewriting or rolling back
  `agent_versions` history (AC-35, deferred). A rollback that mutates history
  would make every prior run's `agent_version` reference a config that no
  longer means what it did.

## User stories

- **US-1** — As a reviewer who just accepted a finding, I turn it into an eval
  case in one action, and the case remembers that this agent *should* find that
  problem at that file and those lines. *(AC-1, AC-2, AC-3, AC-5, AC-6, AC-7)*
- **US-2** — As a reviewer who just dismissed a noisy finding, I turn it into an
  eval case in one action, and the case remembers that this agent *should not*
  comment there. *(AC-1, AC-2, AC-4, AC-5, AC-6, AC-7)*
- **US-3** — As an agent owner, I open one place inside the agent editor and see
  every case in that agent's set, each with its expectation, its tags, and
  whether it passed the last run. *(AC-36, AC-37, AC-38)*
- **US-4** — As an agent owner, I open a case and see exactly what the agent will
  be given (the frozen diff, files and PR metadata) and exactly what is expected
  of it, and I can correct either. *(AC-12, AC-13, AC-14, AC-39)*
- **US-5** — As an agent owner, I run the agent against its whole case set in one
  action and get recall, precision and citation accuracy for that run.
  *(AC-8, AC-9, AC-15, AC-16, AC-17, AC-18, AC-19, AC-21, AC-22, AC-23, AC-29)*
- **US-6** — As an agent owner, I change the system prompt, run the same case set
  again, and see the numbers move — and when I deliberately make the prompt
  worse, I see precision fall. *(AC-10, AC-30, AC-31)*
- **US-7** — As an agent owner, I open the run history, select exactly two runs,
  and compare them: metric deltas old→new and a diff of the two system prompts
  that produced them. *(AC-32, AC-33, AC-34, AC-35, AC-44)*
- **US-8** — As an agent owner comparing two runs whose case sets differ, I am
  told they differ and how, instead of being handed a delta that quietly compares
  two different things. *(AC-33)*
- **US-9** — As a workspace owner, I open a global dashboard and see every
  agent's latest recall, precision, citation accuracy and pass count with a trend
  at a glance, plus recent runs across all agents. *(AC-40, AC-41, AC-43)*
- **US-10** — As a workspace owner, I drill into one agent and see its metric
  trend over runs, with deltas against the previous run and a plain statement of
  the biggest recent move. *(AC-44, AC-45)*
- **US-11** — As a workspace owner, I know what a run will cost before I trigger
  it and what it cost after, especially when I run every agent at once.
  *(AC-24, AC-25, AC-26, AC-27, AC-42)*
- **US-12** — As a workspace owner, opening any eval surface never spends money;
  only my explicit run action does. *(AC-28)*
- **US-13** — As someone whose run partly failed, I get the run with the failed
  cases named and excluded from the metrics, not a silently skewed score or a
  lost run. *(AC-11, AC-20, AC-49)*
- **US-14** — As an agent owner whose agent has no cases or no runs yet, each
  surface tells me what is missing and what to do, instead of showing me zeroes I
  would misread as failures. *(AC-46, AC-47, AC-48)*
- **US-15** — As a security-conscious owner, a pull request whose diff, file
  names or finding text contain hostile content cannot use a stored eval case to
  issue instructions to my model or to inject markup into my browser.
  *(AC-51, AC-52, AC-53)*
- **US-16** — As a workspace member, I can never read or run another workspace's
  eval cases or runs over any surface. *(AC-54)*
- **US-17** — As a keyboard or screen-reader user, I can create a case, run a
  set, select two runs and read the metrics and the trend without relying on a
  mouse or on colour. *(AC-55, AC-56)*
- **US-18** — As a maintainer, one command tells me whether this feature is
  actually wired end to end, including that the two shared-contract copies still
  agree. *(AC-50, AC-57)*

## Acceptance criteria (EARS)

*Terms used below.* A **case** is a stored eval case belonging to exactly one
agent. An **expectation** is a case's `must_find` or `must_not_flag` target,
consisting of a file and a line range. A **suite run** is one execution of one
agent against a set of cases (D2). A finding **matches** an expectation when the
finding's file equals the expectation's file **and** the finding's
`[start_line, end_line]` intersects the expectation's line range. A case's
**frozen input** is the diff, file list and PR metadata stored on it at creation
(D8).

### Case creation from a triaged finding

- **AC-1** — WHEN a user activates the turn-into-eval-case action on a finding
  that has no case yet, the system shall create one case belonging to the
  agent that produced that finding, without requiring any further input. IF a
  case already exists for that finding (D17), THEN the system shall return the
  existing case rather than creating a duplicate.
  *Verify: activating the action on a finding produces exactly one case in that
  agent's set, and activating it again on the same finding still yields exactly
  one case.*
- **AC-2** — The system shall offer the turn-into-eval-case action only on a
  finding that has been accepted or dismissed.
  *Verify: the action is absent on a finding with neither `accepted_at` nor
  `dismissed_at` set, and present once either is.*
- **AC-3** — WHEN a case is created from an **accepted** finding, the case's
  expectation type shall be `must_find`, and its expectation shall carry the
  finding's file and its `start_line`–`end_line` range.
- **AC-4** — WHEN a case is created from a **dismissed** finding, the case's
  expectation type shall be `must_not_flag`, and its expectation shall carry the
  finding's file and its `start_line`–`end_line` range.
- **AC-5** — WHEN a case is created from a finding, the system shall store on the
  case a frozen input containing a self-contained unified diff, the file list and
  the pull-request metadata needed to run the agent against it, and shall not
  store a reference that must be re-fetched at run time.
  *Verify: a case still runs unchanged after its source pull request, review and
  repository record are deleted.*
- **AC-6** — IF the expectation's line range does not intersect any hunk of the
  case's frozen diff for that file, THEN the system shall refuse to create the
  case and state that reason — because such an expectation can never be matched
  by a finding that survives the citation-grounding gate.
  *Verify: attempting to create a case whose expectation lines fall outside every
  hunk is refused with a stated reason and creates no case.*
- **AC-7** — The system shall keep a case's expectation fixed after creation, so
  that a later change to its source finding's accepted or dismissed state does
  not alter the case.
  *Verify: dismissing a previously accepted source finding leaves its case's
  expectation type as `must_find`.*

### Running a suite

- **AC-8** — WHEN a user triggers a run for an agent, the system shall execute
  the agent against every case in that agent's set using the existing review
  execution path, supplying each case's frozen input as the diff.
- **AC-9** — The prompt assembled for an eval execution shall contain only the
  agent's versioned identity — system prompt, model, strategy and linked skill
  bodies — together with the case's frozen input, and shall contain no repository
  map, callers digest, project-context document, live pull-request description or
  derived intent.
  *Verify: for a case whose repository has since gained a repo map, the assembled
  eval prompt contains no repo-map section.*
- **AC-10** — WHERE two suite runs cover the same case set and the agent's
  configuration is unchanged between them, the system shall supply
  byte-identical model input for each corresponding case in both runs.
  *Verify: assemble the input for the same case twice with no config change and
  assert the two are byte-identical.*
- **AC-11** — IF a case's execution fails — provider error, timeout, or an
  unvalidatable response — THEN the system shall complete the run, mark that case
  as errored with its reason, exclude it from every metric's numerator and
  denominator, and record how many cases errored.
  *Verify: a run in which one of several cases fails yields a stored run with
  metrics computed over the remaining cases and an errored-case count of one.*
- **AC-12** — The system shall allow a case's name, notes, frozen input and
  expectation to be edited, and shall allow a case to be deleted.
- **AC-13** — IF an edited expectation fails validation against the expectation
  contract, THEN the system shall reject the edit, state which field failed, and
  leave the stored case unchanged.
  *Verify: submitting an expectation with an unknown expectation type or a
  non-integer line is refused and the stored case is unmodified.*
- **AC-14** — WHEN a case is edited or deleted, the system shall leave previously
  stored suite runs and their recorded results unchanged, and shall not recompute
  a past run's metrics.
- **AC-15** — WHILE a suite run is in flight for an agent, the system shall not
  start a second run for that agent, and shall surface the in-flight state rather
  than queueing or duplicating it.
  *Verify: two rapid run actions on one agent produce exactly one run.*

### Scoring — deterministic, zero LLM calls

- **AC-16** — The system shall compute a run's `recall`, `precision`,
  `citation_accuracy`, per-case pass/fail and every displayed delta, trend point
  and banner without making any LLM call.
  *Verify: score a run from stored execution outputs against a stubbed provider
  and assert zero provider calls.*
- **AC-17** — The system shall mark a `must_find` case as passed WHEN at least
  one of the agent's findings for that case matches its expectation, and shall
  mark a `must_not_flag` case as passed WHEN none of the agent's findings for
  that case matches its expectation.
- **AC-18** — The system shall compute a run's `recall` as the number of
  `must_find` expectations matched by at least one finding, divided by the number
  of `must_find` expectations covered by the run.
- **AC-19** — The system shall compute a run's `precision` as one minus the ratio
  of false positives to the total number of the agent's findings across the run,
  where a false positive is a finding produced for a `must_not_flag` case that
  matches that case's expectation.
  *Verify: a run over one `must_not_flag` case in which the agent produces four
  findings, one of which overlaps the forbidden range, yields a precision of
  0.75.*
- **AC-20** — WHERE a metric's denominator is zero — no `must_find` cases for
  recall, no findings at all for precision or citation accuracy — the system
  shall report that metric as not applicable rather than as zero, one, or an
  error.
  *Verify: a run over only `must_not_flag` cases reports recall as not
  applicable rather than 0.*
- **AC-21** — The system shall compute a run's `citation_accuracy` as the
  proportion of the agent's findings across the run that survive the existing
  citation-grounding gate, and shall not define, re-implement or vary the rule by
  which a citation is judged valid.
  *Verify: for a run whose executions report four findings produced and three
  kept by grounding, citation accuracy is 0.75.*
- **AC-22** — The system shall count only findings that survived the grounding
  gate when matching against expectations and when computing precision's
  denominator, so that a finding is never counted as both a citation failure and
  a false positive.
- **AC-23** — WHEN a run completes, the system shall store its set-level metrics,
  its per-case outcomes, the agent configuration version it ran against, the
  exact set of case ids it covered, its duration, its errored-case count and its
  cost.

### Cost and spend control

- **AC-24** — WHEN a user requests a run, the system shall state how many cases
  will be executed and for how many agents before any execution starts.
- **AC-25** — WHEN a user requests a run of every agent at once, the system shall
  require an explicit confirmation stating the total number of executions, and
  shall start no execution until that confirmation is given.
- **AC-26** — WHEN a run completes, the system shall display its total cost and
  duration alongside its metrics.
- **AC-27** — The system shall rate-limit run triggering per workspace, so that a
  repeated or automated trigger cannot start an unbounded number of executions.
- **AC-28** — WHEN a user opens any eval surface — the agent's Evals tab, the
  dashboard, an agent's eval detail page, a case editor, or a run comparison —
  the system shall make no LLM call.
  *Verify: repeated loads of every eval surface against a stubbed provider
  produce zero provider calls.*

### The demonstration this feature must support

- **AC-29** — The system shall run and score, as one suite run, an agent whose
  case set contains at least eight cases including at least one `must_find` and
  at least one `must_not_flag` case.
- **AC-30** — WHEN an agent's system prompt is changed between two suite runs
  over the same case set, the system shall attribute each run to the distinct
  agent configuration version that produced it and shall present the difference
  between the two runs' metrics.
- **AC-31** — WHERE a change to an agent's system prompt causes the agent to
  produce a finding matching a `must_not_flag` case's expectation that it did not
  produce before, the system shall report a lower `precision` for the later run
  than for the earlier one over the same case set.
  *Verify: run a fixed case set, add an instruction that provokes a finding on a
  known must-not-flag range, re-run the same set, and read the precision drop.*

### Compare and promote

- **AC-32** — The system shall permit a comparison to be requested only when
  exactly two suite runs of one agent are selected.
- **AC-33** — WHEN two runs are compared, the system shall present each metric's
  old value, new value and delta; IF the two runs covered different case sets,
  THEN the system shall state that they differ, name the difference, and compute
  the deltas over the cases common to both.
  *Verify: comparing a run taken before a case was added with one taken after
  states the case-set difference rather than presenting a bare delta.*
- **AC-34** — WHEN two runs are compared, the system shall present a
  line-oriented difference between the system prompts of the two agent
  configuration versions the runs were attributed to, distinguishing removed from
  added lines.
- **AC-35 — Deferred, not implemented this slice (N12).** Reserved so later
  ACs keep their numbers. If a promote action ships later: WHERE a promote
  action is offered on a compared run, activating it shall make that run's
  agent configuration version the agent's current configuration by recording a
  new version, without modifying or removing any existing version record.

### Client surface — agent Evals tab

- **AC-36** — The agent editor shall present an Evals tab alongside its existing
  tabs, selectable by the same tab mechanism, without altering the behaviour of
  the existing tabs.
- **AC-37** — The Evals tab shall present, for the selected agent: tiles for
  recall, precision, citation accuracy and cases passed of total from the latest
  run; a list of the agent's cases; and the agent's run history.
- **AC-38** — Each case in the list shall show its name, its expectation type,
  its severity and category tags, its expected and actual finding counts from the
  latest run, its pass/fail outcome from that run, and actions to run, edit and
  delete it.
- **AC-39** — WHEN a user opens a case, the system shall present the case's name,
  its frozen input separated into diff, files and pull-request metadata, its
  expectation in an editable form, and its outcome in the latest run that covered
  it.

### Client surface — Eval Dashboard

- **AC-40** — The system shall present a workspace-level Eval Dashboard, reachable
  from the primary navigation and not scoped to a repository, listing every agent
  with its latest run's recall, precision, citation accuracy and cases-passed
  count, and a trend indicator over that agent's recent runs.
- **AC-41** — The dashboard shall present a combined table of recent runs across
  all agents, each row naming its agent, when it ran, its metrics and its cost.
- **AC-42** — WHEN a user runs all agents from the dashboard, the system shall
  report per-agent progress and per-agent failure rather than a single combined
  success or failure.
- **AC-43** — The dashboard shall state that each agent's metrics are computed
  over that agent's own case set, and shall not present agents' metrics as a
  ranking.
- **AC-44** — WHEN a user opens one agent's eval detail, the system shall present
  metric tiles with each metric's delta against that agent's previous run, a
  trend over that agent's runs for all three metrics, and a run-history table
  supporting the two-run selection of AC-32.
- **AC-45** — The system shall present a statement of the largest metric change
  between an agent's two most recent runs, naming the metric, its direction, its
  magnitude and the configuration version; WHERE specific cases changed pass/fail
  state between those runs, it shall name them, and WHERE none did, it shall not
  assert a cause.
  *Verify: a metric move with no case pass/fail transition yields a statement
  naming the metric and magnitude only, with no causal clause.*

### Empty, degraded and failure states

- **AC-46** — WHERE an agent has no cases, every eval surface for that agent shall
  state that no cases exist and how to create one, and shall display no metric
  values.
- **AC-47** — WHERE an agent has cases but no completed run, the eval surfaces
  shall state that it has never been run, and shall display no metric values and
  no trend.
- **AC-48** — WHERE an agent has exactly one completed run, the system shall
  display that run's metrics without deltas and without a comparison affordance,
  and shall state that a second run is needed to compare.
- **AC-49** — IF a run cannot start — no cases, no provider key configured for
  the agent's provider, or a run already in flight — THEN the system shall state
  which of those applies and shall create no run record.

### Contracts, security and access

- **AC-50** — Every contract this feature adds or reshapes shall be present and
  identical in both `vendor/shared` copies, and the feature shall not increase the
  existing divergence between them.
  *Verify: a mechanical comparison of the two copies reports no new divergence in
  the files this feature touches.*
- **AC-51** — The system shall treat a case's stored diff, file list,
  pull-request metadata and any text carried over from its source finding as
  untrusted data, passing them to the model under the product's existing shared
  injection guard and never as instructions.
- **AC-52** — The system shall render all case-authored and model-authored
  text — case names, notes, expectation contents, finding titles and rationales,
  and system-prompt diffs — through the product's existing sanitised renderer,
  and shall not render supplied markup as markup.
  *Verify: a case whose name contains a script tag renders it as visible text.*
- **AC-53** — The system shall accept an expectation only after validating it
  against the expectation contract, and shall never evaluate, execute or
  interpolate a stored expectation as code or as a query.
- **AC-54** — WHERE an eval case or run belonging to another workspace is
  requested — for read, run, edit, delete or comparison — the system shall not
  disclose it and shall not act on it, over any surface.
  *Verify: a request for another workspace's case is refused before any case row
  is read.*

### Accessibility

- **AC-55** — Every metric, delta and pass/fail outcome shall be distinguishable
  without relying on colour alone, and the trend shall have a non-graphical
  equivalent conveying the same values.
- **AC-56** — Creating a case, running a set, selecting two runs, opening a case
  and triggering a comparison shall each be operable from the keyboard, and a
  change in a run's status shall be announced to assistive technology.

### Verification command

- **AC-57** — A `verify:l06` script shall exist and shall pass, mechanically
  checking at least: that this feature's migrations apply cleanly; that both
  `vendor/shared` copies of the affected contracts agree (AC-50); that the eval
  routes respond over their documented surface; and that the scoring unit
  suite — covering AC-17 through AC-22, including the zero-denominator cases of
  AC-20 — is green.

## Edge cases

- **Finding triaged, then re-triaged the other way.** The case's expectation is
  fixed at creation (AC-7). A reviewer who accepts, then dismisses, does not
  silently invert an existing regression case under an agent owner's feet.
- **The same finding turned into a case twice.** Must not produce two silently
  duplicate cases that then double-count in both numerator and denominator. See
  clarification 1.
- **Source PR force-pushed, review deleted, or repository removed.** The case is
  unaffected — it holds its own frozen input (AC-5, D8). This is the whole point
  of freezing.
- **Agent deleted while it still owns cases.** `eval_cases.owner_id` is
  polymorphic (`owner_kind` + `owner_id`, `schema/eval.ts:12-13`) with no foreign
  key to `agents`, so nothing cascades today. Orphaned cases would linger,
  unreachable and unrunnable. See clarification 6.
- **A `must_find` case the agent has never once matched.** Legitimate — it is a
  regression target the agent currently fails. It must render as a failing case,
  not as a broken case.
- **An agent that produces zero findings for every case.** Recall is 0; precision
  and citation accuracy have a zero denominator and are reported as not
  applicable (AC-20). Reporting precision as 1.0 for an agent that says nothing
  would be actively misleading.
- **An agent that produces findings only outside every expectation.** Under this
  spec's precision definition (AC-19, inherited from the brief) those findings are
  not counted as false positives, so precision stays 1.0 while recall falls. This
  is a deliberate consequence of the brief's definition, not an oversight — see
  clarification 8.
- **A finding spanning many lines, overlapping an expectation by one line.**
  Matches (AC-17's intersection rule). Consistent with how the grounding gate
  already treats ranges (`grounding.ts:41-46`).
- **A full-file-kind finding** (`secret_leak`, `lethal_trifecta`, `phantom`,
  `hook`). The grounding gate exempts these from hunk intersection
  (`grounding.ts:16,66-70`), so they survive grounding on file presence alone,
  while expectation matching still requires line intersection. A case built from
  such a finding may therefore be unmatchable by ordinary means — AC-6 is the
  guard that catches it at creation.
- **Cases added or deleted between two runs being compared.** Stated, and deltas
  computed over the intersection (AC-33, D5).
- **A run of eight-plus cases interrupted midway** — provider outage, server
  restart. The run must not be left permanently "in flight" blocking every
  subsequent run (AC-15 would otherwise deadlock the agent). See clarification 10.
- **Two agents run simultaneously.** AC-15's guard is per agent, so this is
  allowed; the combined provider load and cost are the reason AC-25 and AC-27
  exist.
- **A case whose frozen diff is very large.** The stored input is replayed to the
  model on every run forever, so a single oversized case silently taxes every
  future run of that set.
- **Hostile content in the frozen diff, a file path, or a finding title.**
  Treated as data (AC-51), rendered sanitised (AC-52). Note the amplification
  relative to a live review: a PR diff is reviewed once, whereas a stored case's
  diff is replayed on every run indefinitely.
- **A case whose expectation JSON is edited to something malformed or huge.**
  Rejected at the boundary with the failing field named (AC-13, AC-53).
- **An agent with no provider key configured.** Run refused with that stated
  reason, and no empty run record left behind (AC-49).

## Non-functional

- **Determinism and reproducibility.** This is the feature's primary quality
  attribute, not a nice-to-have: if two runs of an unchanged agent over an
  unchanged case set can differ for reasons other than model sampling, every
  number the feature displays is worthless. AC-10 states the invariant; D8 and D9
  are the two decisions that make it achievable.
- **Cost.** A run is *N* review executions, not one — and "run all agents" is
  *agents × cases*. Spend is stated before the action (AC-24, AC-25), attributed
  after it (AC-23, AC-26), rate-limited (AC-27), and never incurred by merely
  looking (AC-28, D11). Scoring itself is free by construction (AC-16).
- **Security — untrusted input to the model.** A stored case's diff, file paths
  and pull-request metadata originate from a pull request, which on any repository
  accepting outside contributions is attacker-influenceable. It travels under the
  product's existing shared injection guard as data (AC-51); no per-feature
  keyword scanning is introduced, consistent with `reviewer-core/CLAUDE.md`
  §Do-not-touch. The amplification noted in Edge cases — replayed on every run,
  indefinitely — is the reason this is called out rather than assumed inherited.
- **Security — untrusted output rendered in a browser.** Model-authored finding
  text is displayed in the case editor's actual-versus-expected view, and
  user-authored case names, notes and expectations are displayed throughout. All
  of it goes through the existing sanitised renderer with no raw markup (AC-52).
- **Security — a stored expectation is data, never a program.** The expectation is
  user-editable JSON consumed by a code scorer; it is schema-validated at the
  boundary and never evaluated, executed, or interpolated into a query (AC-13,
  AC-53).
- **Security — workspace scoping.** `eval_cases` is workspace-scoped
  (`schema/eval.ts:9-11`) but `eval_runs` reaches a workspace only transitively
  through its case; every read, run, edit, delete and comparison must resolve the
  caller's workspace before touching a row (AC-54).
- **Security — no new provider-facing data.** An eval run sends strictly less
  repository content than the live review it was derived from (D9): the same diff,
  minus the repo map, callers digest and project-context documents. This feature
  must not become the path by which more repository content reaches a provider.
- **Privacy of logs.** Run logging records case identifiers, counts, metrics,
  model, tokens and cost — never diff content, expectation content, or finding
  prose.
- **Performance.** Scoring is a pure in-memory comparison over findings and
  expectations and must not re-fetch a diff, re-read a repository checkout, or
  contact the host. Every read surface (AC-28) must render from stored run data
  alone. A run's latency is dominated by its *N* model calls and must not block
  the surface that triggered it.
- **Backwards compatibility.** An agent with no cases must render its editor
  exactly as today plus one new tab (AC-36, AC-46); no existing route response,
  finding action, review behaviour or agent-versioning behaviour changes (N7).
- **Accessibility.** Metrics, deltas and pass/fail states are legible without
  colour, the trend has a non-graphical equivalent, every action is
  keyboard-operable, and run status transitions are announced (AC-55, AC-56).

## Inputs (provenance)

| Input | Provenance |
|---|---|
| Source finding's file, line range, severity, category, title | `[reused: the persisted finding record produced by an earlier review run]` |
| Expectation type (must_find / must_not_flag) | `[deterministic: derived from the finding's existing accepted/dismissed timestamps — no new judgement]` |
| A case's frozen diff, file list and PR metadata | `[deterministic: captured once from the pull request's already-loaded diff at case-creation time, then immutable]` |
| Agent identity for a run (system prompt, model, strategy, linked skill bodies) | `[reused: the existing agent record and its stored configuration-version snapshots]` |
| The agent's findings for one case | `[new: N LLM call(s) per run — one review execution per case through the existing review path; the agent's configured strategy determines calls per case]` |
| Which findings survived citation grounding | `[reused: the existing citation-grounding gate, already computed inside every review execution — no additional call]` |
| Expectation matches, per-case pass/fail, recall, precision | `[deterministic: code-only file equality plus line-range intersection over the above]` |
| Citation accuracy | `[deterministic: kept-over-total computed from the grounding result already returned by each execution]` |
| Run cost and duration | `[reused: the product's existing per-run token accounting and cost estimation]` |
| Trend points, per-metric deltas, dashboard callout text | `[deterministic: computed over stored run rows — never model-authored (N1, D12)]` |
| System-prompt diff shown when comparing two runs | `[reused: the two stored agent configuration-version snapshots the runs were attributed to]` |

## Untrusted inputs

- **A case's frozen diff, including code content and file paths.** Originates
  from a pull request and is therefore contributor-controlled on any repository
  accepting outside contributions. It reaches the model on *every* run of that
  case, indefinitely — a longer exposure than the single live review it came
  from. Data, never instructions.
- **Pull-request metadata stored on a case** (title, body, and any other captured
  fields). Author-controlled free text that reaches the model. Data, never
  instructions.
- **Text carried over from the source finding** (title, rationale, suggestion).
  Model-authored over attacker-influenceable input, then displayed in the case
  editor. Untrusted for rendering.
- **Case name and notes.** User-authored, stored, and rendered on multiple
  surfaces. Untrusted for rendering.
- **The expectation payload.** User-editable structured data consumed by the
  scorer. Untrusted for validation: it must be schema-checked at the boundary,
  and must never be evaluated, executed, or interpolated into a query.
- **The agent's findings produced during a run.** Untrusted for both citation
  truth — which is exactly what the grounding gate and citation accuracy
  measure — and for rendering in the expected-versus-actual view.
- **An agent's system prompt as rendered in the compare diff.** Workspace-authored
  configuration displayed as text; it must render as text, never as markup.

## Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as PR review · FindingCard
    participant E as Agent editor · Evals tab
    participant API as Server
    participant DB as eval_cases / eval_runs
    participant R as Review engine (existing path)
    participant M as Model

    Note over U,F: 1 — build the dataset from real decisions
    U->>F: Accept (or Dismiss) a finding
    U->>F: "Turn into eval case"
    F->>API: create case from finding
    API->>API: expectation type from accept/dismiss; freeze diff + files + PR meta
    API->>API: refuse if expectation lines miss every hunk (AC-6)
    API->>DB: store case (immutable input, fixed expectation)

    Note over U,E: 2 — run the suite (the only path that spends)
    U->>E: Run eval set
    E->>API: start suite run for this agent
    API->>API: state case count + cost; guard in-flight run
    loop once per case
        API->>R: execute agent (versioned prompt/model/skills) over the case's frozen diff
        R->>M: review call(s)
        M-->>R: candidate findings
        R->>R: citation-grounding gate — kept / dropped
        R-->>API: kept findings + kept-of-total
    end

    Note over API: 3 — score, in code, zero LLM calls
    API->>API: match = same file AND line ranges intersect
    API->>API: recall · precision · citation accuracy · per-case pass/fail
    API->>DB: store run + agent version + covered case ids + cost

    Note over U,E: 4 — read, compare, decide (spends nothing)
    U->>E: open Evals tab / Eval Dashboard
    E->>API: read cases, runs, trend
    API-->>E: stored data only (0 LLM calls)
    U->>E: select exactly 2 runs → Compare
    API-->>E: metric deltas + system-prompt diff (+ case-set difference, if any)
```

## Resolved decisions (post-draft)

All ten items originally raised under `[NEEDS CLARIFICATION]` are resolved.
Two were the user's call; the rest follow directly from the brief's own
wording or this repo's existing conventions, so they were decided rather than
left open for planning:

1. **Case granularity / diff fragment** → **D16.** Frozen input is scoped to
   the finding's own file, not the whole PR. Duplicate-case handling →
   **D17** (idempotent: re-activating the action returns the existing case).
2. **Promote** → **out of scope this slice (N12)**, user decision. D15 stays
   as documented design for later; AC-35 is marked deferred, not renumbered.
3. **Errored case vs. run comparability** → **D20.** A run with errored cases
   stays comparison-eligible; the comparison narrows to cases common to both
   runs via AC-33's existing mechanism.
4. **`verify:l06` location / Docker** → **D21.** Lives in
   `server/package.json`, mirrors `verify:l03`'s hermetic-with-self-skip
   pattern for DB-backed checks. No second client-side script.
5. **Eight-case bar** → **D22**, user decision. Seven seeded fixture cases +
   one created live on camera from a real accepted/dismissed finding.
6. **Agent deletion** → **D18.** Application-level cascade: deleting an agent
   deletes its `eval_cases` and their `eval_runs` first (no DB-level FK exists
   on the polymorphic owner column).
7. **Skill-owned cases later** → unchanged, stays **N3** (out of scope); the
   polymorphic `owner_kind`/`owner_id` shape already accommodates it without
   any further design needed now.
8. **Precision formula** → kept exactly as **AC-19** states it (the brief's
   own definition, `1 − FP/total`), not textbook `TP/(TP+FP)`. No LLM-free way
   to define "plausible but unexpected" as a false positive, so the simpler,
   literal definition ships; the consequence noted in Edge cases stands.
9. **Cost/observability integration** → **out of scope this slice (N13)**;
   cost is visible only within the eval surfaces (AC-24–AC-27).
10. **Stuck in-flight run** → **D19.** 15-minute staleness timeout,
    reconciled on the next run-start request or server startup, before AC-15's
    guard is evaluated.
