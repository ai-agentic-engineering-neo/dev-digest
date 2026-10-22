---
name: pr-self-review
description: "Self-review all local changes (commits on the branch + staged + unstaged + untracked) against main before opening a pull request. Routes every changed file to the project skills that own it — UI skills on client files, backend architecture skills on server files — runs deterministic checks (typecheck, layer greps, contract drift, secrets), and blocks the PR when any critical finding remains. Use before `gh pr create`, when a pr-self-review hook blocks a command, or when asked to self-review, pre-review, check changes before a PR, or 'перевір зміни перед PR'. Args: quick (default) | full, --base <ref>."
disable-model-invocation: true
metadata:
  version: 1.0.0
  updated: 2026-10-16
---

# PR self-review

Review the local diff with the skills that own each file, then give a verdict:
**PASS** · **BLOCKED** (≥ 1 critical in the changed lines) · **INCOMPLETE** (an agent result is missing).
BLOCKED and INCOMPLETE mean: do not open or merge the PR.

Scripts live in `.claude/skills/pr-self-review/scripts/` (below: `$S`). Run them from the repo root
with `node`. Run state goes to `.claude/pr-self-review/` (gitignored).

| File | Role |
|---|---|
| [routing.json](routing.json) | Which skill reviews which globs — the only place to change routing |
| [references/severity-rubric.md](references/severity-rubric.md) | What is critical, per skill; suppression syntax |
| [references/reviewer-prompt.md](references/reviewer-prompt.md) | Reviewer and verifier agent prompts |

## Modes

- **quick** (default; always when triggered by a `gh pr create` attempt): no `fullOnly` skills, no unit
  tests, agents report critical + major only.
- **full** (when the user asks for a full/thorough review): every routed skill, unit tests, all severities.

## Workflow

1. **Collect.** `node $S/collect.mjs --mode <quick|full> [--base <ref>]`
   Prints the agent groups, cached results, warnings (large diff, unmapped skills). Read
   `.claude/pr-self-review/run/plan.json` for group details. If there are no changes, stop.

2. **Static checks.** `node $S/static-checks.mjs` (add `--tests` for tests in quick mode).
   Typecheck of touched packages + grep rules on **added lines only** + migration / contract-drift /
   secret checks. Takes up to a minute.
   - **Quick mode, static check found a blocking critical:** skip step 3, run
     `node $S/gate.mjs merge --skip-agents`, then go to step 5. Fix those first; the full review
     runs on the next pass.

3. **Skill agents.** For every group in `plan.groups`, launch one Agent (`general-purpose`,
   `run_in_background: true`, at most `plan.maxParallelAgents` at a time) with the **Reviewer** prompt
   from `references/reviewer-prompt.md`, filled from the group (`skill`, `skillPath`, `files`,
   `context`, `output`) and the plan (`mode`, `mergeBase`). Each agent writes its JSON to the group's
   `output`. Wait for all of them. Groups served from cache need no agent.

4. **Merge and verify.** `node $S/gate.mjs merge`
   It normalizes findings, drops criticals without verbatim evidence or with confidence < 0.7 to
   major, marks findings outside changed lines as pre-existing, applies suppressions, dedupes, and
   lists the model criticals to verify. For those, launch **Verifier** agents (≤ 5 findings each), then
   write their combined answers to `.claude/pr-self-review/run/verify.json` as
   `{"<id>": {"verdict": "confirmed|downgrade|rejected", "severity": "...", "note": "..."}}`.
   Do not verify criticals yourself in the main context, and never write `verify.json` entries the
   verifiers did not return.

5. **Record.** `node $S/gate.mjs record` — writes the verdict to `last-run.json` (bound to the
   current diff hash), the report to `run/report.md`, and caches results so the next run only
   reviews files that changed. If it says files changed during the review, rerun from step 1.

6. **Report to the user.** Show the verdict, the critical table and the major findings (file:line,
   problem, fix) from `run/report.md`; summarize minor/nit and pre-existing as counts. Mention the
   warnings.

7. **Act on the verdict.**
   - **BLOCKED / INCOMPLETE:** do not run `gh pr create` or `gh pr merge`. Offer to fix the criticals;
     after fixing, rerun this skill (cached files are skipped).
   - **PASS:** the PR may be opened. If `routing.json` → `gate.publishStatus` is `true`, after
     `gh pr create` (when the branch is pushed and the tree is clean) run
     `node $S/gate.mjs publish-status` so the required `pr-self-review` GitHub check turns green.

## Rules

- Findings in lines the diff did not touch never block — report them under "pre-existing".
- A critical must quote code that exists in the file. The scripts enforce it; don't work around it.
- Never edit `last-run.json`, `merged.json` or `cache.json` by hand, and never lower a severity
  outside the verifier pass. To accept a finding deliberately, the user adds an inline
  `pr-self-review-ignore <rule>: <reason>` comment (see the rubric) and reruns.
- Do not change routing, rubric or thresholds to get a PASS.
- A new project skill must be added to `routing.json` (or `notReviewers`); `collect.mjs` warns otherwise.

## Gate (what enforces the verdict)

| Layer | Where | Blocks |
|---|---|---|
| Claude Code `PreToolUse` hook | `.claude/settings.json` → `gate.mjs check --hook` | `gh pr create` unless the last run PASSed on the exact current diff; `gh pr merge` unless the PR's `pr-self-review` status is success |
| git `pre-push` (opt-in) | `.githooks/pre-push` → `gate.mjs check --soft`; enable with `git config core.hooksPath .githooks` | a push whose exact diff has a BLOCKED verdict; warns when no/stale review |
| GitHub required check (opt-in) | `gate.publishStatus: true` + branch protection on `main` requiring `pr-self-review` | merging in the GitHub UI without a PASS status |

The status is self-reported from a developer machine: it prevents mistakes, not deliberate bypass.
