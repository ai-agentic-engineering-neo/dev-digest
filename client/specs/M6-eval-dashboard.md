# M6 — Eval dashboard (client)

Status: draft. Not part of the current M2 build. In M2, the skill Evals tab
is an empty state that names M6, and "Run on evals" is disabled with an M6
tooltip.

## Problem

A user who changes an agent's prompt or a skill's body has no screen that
shows whether the reviewer got better or worse. There is no list of eval
cases, no trend, no way to compare two versions side by side, and no button
to keep the better one.

## Goals

- `/evals`: one row per agent showing model, last run (`vN · date · 17/20 pass`), a sparkline, and RECALL / PREC / CITE. Below it, the recent eval runs across all agents, and a **Run all agents** button.
- `/evals/[agentId]`: the agent eval page, with:
  - a regression banner;
  - metric charts;
  - a runs table with compare checkboxes and cost;
  - a Compare modal that has **Promote**.
- The skill **Evals** tab replaces the M2 empty state. It lists the cases, each as MUST FIND or MUST NOT FLAG, with a pass count (`17 / 20 passing`), run, edit and delete on each case, **Run all evals**, and **New eval case**.
- The skill page header button "Run on evals" is enabled and starts a suite run.

## Non-goals

- The Agent Performance and Stats pages (M7).
- Creating cases from findings in the PR view.
- Scheduling evals, or exporting results.

## Behaviour

- **Navigation.** A "Eval Dashboard" nav item is added under Skills Lab. The breadcrumb is `Skills Lab › Eval Dashboard › {agent}`, using the existing `eval.page.*` strings.
- **`/evals`.**
  - The header holds the subtitle and **Run all agents**. Clicking it starts the runs, disables the button with "Running…", and polls until every run is done.
  - Each agent row shows icon, name, a model badge, the last-run line, a `Sparkline` of recall, and three metric figures colored recall blue, precision green and citation amber. Clicking the row opens `/evals/[agentId]`.
  - The recent-runs list shows agent, date, `vN`, and three `BarRow`s with percentages and the pass count.
  - States: a skeleton while loading, `ErrorState` with a retry on error, and an empty state ("No eval cases yet…") that links to the agents list.
- **`/evals/[agentId]`.**
  - The page has an "All agents" link, the name, a model badge, and the subtitle "Regression harness · N runs on the M-case gold set".
  - It has an agent select (switching agents changes the route), a range select (30 days by default), and **Run eval**.
  - A banner is shown only when `alert` is non-null.
  - Three `MetricCard`s and a `LineChart` (recall, precision, citation) cover the range.
  - The runs table has a checkbox, date, version, three bars, the pass count and cost. **Compare** is enabled when exactly two rows are checked.
- **Compare modal.**
  - Title "Compare runs · vA → vB", with the older version first.
  - Four cards: recall, precision, citation and cost, each shown as `old → new` with a delta arrow. The delta is green when the change is better, so a cost increase counts as worse.
  - A system prompt diff, line by line, with legends for old and new.
  - **Close** and **Promote vB**. Promote asks for confirmation, calls promote, invalidates the agent and eval queries, and shows a toast. When the two runs belong to different owners, Promote is hidden.
- **Skill Evals tab.**
  - A case row shows a status icon (pass, fail, or never run), the mono name, a MUST FIND or MUST NOT FLAG badge, "expected N finding(s), got M" (or "never run"), and a tag on the right: `SEVERITY · category` or `assert empty`. The row also has run, edit and delete icon buttons.
  - Delete uses `ConfirmDialog`.
  - Edit and New open the case editor, using the existing `eval.caseEditor.*` strings, with diff and PR-meta inputs and the expected output.
  - Running a case or a suite disables its controls until the run finishes.
- **Accessibility.** Charts get a text summary. Checkboxes are labelled with the run's version. The modal uses `Modal` and `useDialogA11y`.

## Changes

- Routes: new `src/app/evals/page.tsx` and `src/app/evals/[agentId]/page.tsx`. The skill detail tab `?tab=evals` lives in `src/app/skills/[id]/`, which comes from M2.
- Components:
  - Under `src/app/evals/_components/`: `AgentEvalRow/`, `RecentRunsList/`, `RegressionBanner/`, `EvalRunsTable/`, `CompareRunsModal/` and `PromptDiff/`.
  - Under the skill page: `EvalsTab/`, `EvalCaseRow/` and `EvalCaseEditor/`.
  - `PromptDiff` is shared with the M2 Versions diff if M2 builds one.
  - `@devdigest/ui` is reused as it is: `Sparkline`, `LineChart`, `BarRow`, `MetricCard`, `Modal`, `Checkbox`, `Badge`. The nav entry is added in `nav.ts`.
- Hooks: new `src/lib/hooks/evals.ts`, with keys in `query-keys.ts`:
  - `useEvalDashboard`, `useAgentEvals(agentId, days)`;
  - `useEvalCases(ownerKind, ownerId)`, plus case create, update, delete and run mutations;
  - `useRunSuite`, `useRunAllAgents`, `useSuiteRun(id)` (which polls), `useCompareRuns(a, b)` and `usePromoteVersion`.
  - These hooks call the routes in the server spec.
- Strings: extend `messages/en/eval.json` with `dashboard.agentsHeading`, `runAll`, `compare.*`, `promote.*`, `banner.*`, `skillTab.*` (`passingCount`, `mustFind`, `mustNotFlag`, `assertEmpty`, `expectedGot`) and `range.*`. Existing keys are reused.
- Contracts: `EvalCase`, `EvalCaseInput`, `EvalRunRecord`, `EvalDashboard`, and the new `EvalSuiteRun`, `EvalAgentSummary`, `EvalCompare` and `EvalExpected`. They must match the server copy.

## Acceptance criteria

- [ ] `/evals` shows one row per agent with its last run and its three metrics. Clicking a row opens that agent's page.
- [ ] The agent page shows the banner only when the server returns an alert.
- [ ] Compare is enabled only when exactly two runs are checked. The modal shows the four deltas and the prompt diff.
- [ ] Promote asks for confirmation, then calls the promote endpoint once.
- [ ] The skill Evals tab shows `passed / total`, and a badge and tag that match each case's kind.
- [ ] A never-run case shows "never run" and has no pass or fail icon.
- [ ] The empty, loading and error states render on each page.

## Tests

- `CompareRunsModal.test.tsx`: the deltas and their signs, including cost as worse when it goes up; Promote calls the mutation after confirmation.
- `EvalRunsTable.test.tsx`: Compare is disabled with zero, one or three rows checked, and enabled with two.
- `EvalsTab.test.tsx`: the pass count; a MUST NOT FLAG row shows `assert empty`; delete asks for confirmation.
- e2e: a new `evals.flow.json` on seeded suite runs that opens `/evals`, then an agent, then Compare. It does not run a live eval.
  See [`TESTING.md`](../../TESTING.md).

## Related specs

- [`../../server/specs/M6-eval-dashboard.md`](../../server/specs/M6-eval-dashboard.md)
- [`M2-skills.md`](M2-skills.md), [`../../server/specs/M2-skills.md`](../../server/specs/M2-skills.md),
  [`../../reviewer-core/specs/M2-skills.md`](../../reviewer-core/specs/M2-skills.md)

## Open questions

- Is Promote shown only for the newer run of the pair, or for either?
- Does Promote need its own confirmation when the promoted version scores worse?
- Does the range select offer only 7, 30 and 90 days, or a custom range?
- Is the skill Evals tab per skill version, or does it always show the latest?
- Does "Run all agents" poll per suite, or is there one aggregate status?
- The design shows the Eval Dashboard nav item next to an Agent Performance entry (M7). Is that order kept?
