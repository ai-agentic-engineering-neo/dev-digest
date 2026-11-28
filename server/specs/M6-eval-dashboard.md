# M6 — Eval dashboard (server)

Status: draft. Not part of the current M2 build. It records the designs so
that M2 keeps room for them.

## Problem

An agent or skill can change, through a new prompt version, a new model or an
edited skill body, but nobody can tell whether the change found more real
issues or flagged more noise. The tables `eval_cases` and `eval_runs` exist,
but nothing runs a case set as a whole, compares two versions, or turns a
tested version into the active one.

## Goals

- Run every eval case of an agent or a skill as one **suite run**, and persist
  the totals and metrics against the owner's version.
- Serve a workspace dashboard with one row per agent: model, last run's
  version, date, pass count, recall, precision, citation and a trend.
- Serve an agent's run history and a comparison of two runs: metric deltas,
  cost delta and the system-prompt diff.
- Promote a version of an agent (see Open questions).
- CRUD for eval cases, owned by an agent or by a skill.

## Non-goals

- Running evals in CI, or on a schedule.
- Generating gold sets automatically from accepted findings.
- Stats and performance (M7).
- Any change to the grounding gate or to score recomputation. Eval runs go
  through the same `reviewPullRequest` path.

## Behaviour

- **Case.** A case is either `must_find` or `must_not_flag`.
  - A `must_find` case expects one or more findings, each with a severity and category, for example `CRITICAL · security`.
  - A `must_not_flag` case asserts that the review is empty.
  - `expected_output` stores `{ kind, expected: [{ severity, category, file?, line? }] }`. It is validated by a new Zod schema.
- **Running one case.**
  - The server calls `reviewPullRequest` on `input_diff` and `input_meta`, using the owner's resolved config at its current version.
  - The run is scored against `expected_output`:
    - recall: expected findings that were matched;
    - precision: matched findings out of all findings returned;
    - citation accuracy: findings that survived grounding.
  - A `must_not_flag` case passes only when zero findings are returned.
  - The server writes one `eval_runs` row with its cost and duration.
- **Suite run.**
  - The server creates an `eval_suite_runs` row (`status: running`), then runs the cases one after another under a cost cap.
  - It links each `eval_runs` row to the suite run, then writes the totals: passed/total, mean recall, precision and citation, and summed cost.
  - It sets `status: done`.
  - If the provider fails, the status is `failed` and the cases that finished are kept.
  - If the cap is reached, the status is `capped`.
- **Run all agents.** One suite run is started per enabled agent that has cases. An agent without cases is skipped and reported.
- **Regression alert.** When a metric is worse by at least 1pt than the previous `done` suite run of the same owner, the server returns an alert string, for example "Precision dipped 2pts on v7 — …". This reuses `EvalDashboard.alert`.
- **Compare.**
  - The request takes two suite runs of the same owner.
  - The response holds each metric (before, after, delta), the cost delta, and both `system_prompt`s taken from `agent_versions.config_json`.
  - The client renders the diff.
- **Skill suite.** The skill runs on a base agent (see Open questions). Its version is recorded as `skill_versions.version`.
- **Empty states.**
  - With no cases, the response has `cases_total: 0` and empty runs, and the run endpoint returns 409.
  - With no API key, the run endpoint returns the existing missing-key error.

## Changes

- Module: `src/modules/eval/` (new), with the onion layout of `agents`: routes, service, domain (scoring), repository and ports. It is registered in `modules/index.ts`.
- Routes:
  - Eval cases:
    - `GET /eval-cases?owner_kind&owner_id` → `EvalCase[]`, each with its last run;
    - `POST /eval-cases` (`EvalCaseInput`);
    - `PATCH /eval-cases/:id`;
    - `DELETE /eval-cases/:id`;
    - `POST /eval-cases/:id/run` → `EvalRunResult`.
  - `POST /eval-suites/run {owner_kind, owner_id}` → `EvalSuiteRun`, returns 202, and the client polls.
  - `POST /eval-suites/run-all` → `EvalSuiteRun[]`.
  - `GET /eval-suites/:id` → `EvalSuiteRun`, including the per-case runs.
  - `GET /evals/dashboard` → `EvalAgentSummary[]` and the recent `EvalSuiteRun[]` across agents.
  - `GET /evals/agents/:agentId?days=30` → `EvalDashboard`, extended with `suite_runs`.
  - `GET /eval-suites/compare?a&b` → `EvalCompare`.
  - `POST /agents/:id/versions/:v/promote` → `Agent` (see Open questions).
- Tables:
  - New `eval_suite_runs`, with these columns:
    - `id`, `workspace_id`;
    - `owner_kind`, `owner_id`, `owner_version`;
    - `base_agent_id` and `base_agent_version`, nullable, for skills;
    - `status`, `started_at`, `finished_at`;
    - `cases_passed`, `cases_total`;
    - `recall`, `precision`, `citation_accuracy`;
    - `cost_usd`, `duration_ms`.
  - It is indexed on `(owner_kind, owner_id, started_at desc)`.
  - `eval_runs.suite_run_id` is added, nullable, as an FK with cascade.
  - `eval_cases` gains `created_at` and an index on `(owner_kind, owner_id)`.
  - The migration is created with `pnpm db:generate`.
  - `agent_versions` and `skill_versions` are reused as they are.
- Contracts (in both copies):
  - New `EvalExpected`, `EvalSuiteRun`, `EvalAgentSummary` and `EvalCompare`.
  - `EvalDashboard` gains `suite_runs`.
  - `EvalCase` gains `last_run`.
- Adapters or env vars: `EVAL_MAX_COST_USD` is the cap per suite run. It goes in `server/README.md` when built.
- Prompt slot: none new. Skills reach `reviewer-core` through `formatSkills`, and the case diff is fenced like any diff.

## Acceptance criteria

- [ ] A `must_find` case whose expected finding is returned passes, with recall 1. A `must_not_flag` case that returns one finding fails.
- [ ] A suite run persists its totals, its mean metrics and the summed cost, and every `eval_runs` row links to it.
- [ ] The dashboard returns one row per agent with cases, together with the latest suite run's version and metrics.
- [ ] Compare returns each metric (before, after, delta), the cost delta and both system prompts.
- [ ] An alert is returned when a metric drops against the previous run.
- [ ] A suite stops with `capped` once the cost cap is reached.
- [ ] Running a suite with no cases returns 409.

## Tests

- Unit (`domain.test.ts`):
  - scoring for `must_find` (matched and missed) and for `must_not_flag`;
  - mean aggregation;
  - the alert threshold.
- Integration (`eval.it.test.ts`):
  - case CRUD;
  - a suite run with a stubbed `LLMProvider` returning canned findings, checking the persisted totals;
  - compare between two seeded suite runs.
- No real provider is called. See [`TESTING.md`](../../TESTING.md).

## Related specs

- [`../../client/specs/M6-eval-dashboard.md`](../../client/specs/M6-eval-dashboard.md)
- [`M2-skills.md`](M2-skills.md), [`../../client/specs/M2-skills.md`](../../client/specs/M2-skills.md),
  [`../../reviewer-core/specs/M2-skills.md`](../../reviewer-core/specs/M2-skills.md)

## Open questions

- **What Promote means.** Copy the `agent_versions` snapshot for vN into
  `agents` as the active config, which bumps the version to a new v(N+1) equal
  to vN? Or add an `active_version` pointer? And what does "Promote v7" do
  when v7 is already the latest version?
- **Gold-set source.** Are cases written by hand only, seeded, or created from
  accepted or dismissed findings on real PRs? Who maintains the "20-trace gold set"?
- **How a skill eval runs.** Is the skill attached to which base agent: a fixed
  neutral reviewer, the first agent linked to it, or one the user picks? Is
  that agent's version recorded?
- **Matching rule.** Is an expected finding matched by severity and category
  only, or also by file and line overlap?
- **Cost caps.** Is the cap per suite, per run-all, or per day? Is it a
  default value? Does the server warn before running?
- **Concurrency.** Are cases run one after another or in parallel? Should a
  second run on the same owner be blocked while one is running?
- **Mocking the LLM in tests and e2e.** Should a stub provider for seeded runs
  be selected by env var, so e2e can run "Run eval" without a key?
- **Determinism.** Temperature 0, and a single run per case or the median of N runs?
