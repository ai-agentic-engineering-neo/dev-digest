---
name: pr-self-review
description: >-
  Self-review of all open local changes before a pull request is opened. Routes
  the working diff into domain buckets, runs only the deterministic gates those
  buckets need (typecheck, eslint, dependency-cruiser, vitest), then launches one
  review subagent per non-empty bucket — backend files get `onion-architecture`,
  UI files get `frontend-ui-architecture`, DB files get `drizzle-orm-patterns`,
  and so on — and merges every finding into one report. Use before
  `gh pr create`, `gh pr merge` or `git push`, and on "self review", "check my
  changes", "am I ready to open a PR", "review before I push", or when the
  PreToolUse gate has denied a command for want of a fresh passing report. One or
  more CRITICAL findings is a hard local stop.
when_to_use: >-
  Before every pull request on this repo, and on demand via `/pr-self-review`.
  Also whenever the hook has denied `gh pr create` / `git push`.
allowed-tools: Read, Grep, Glob, Bash, Task, Skill, Write
version: 1.0.0
metadata:
  tags: pr-review, self-review, pre-push-gate, diff-routing, subagents, gates, blocking, workflow
  authored: local
  researched: 2026-09-18
---

# PR Self Review

Everything this repo knows about itself is already written down — 14 skills,
five `CLAUDE.md` files, two `dependency-cruiser` configs, two eslint configs.
None of it is applied unless someone loads the right skill at the right moment.
This skill closes that gap: it maps *the files you changed* onto *the rules that
govern them*, proves the machine-checkable half, and refuses to let a PR open
over a CRITICAL finding.

Companion files:
- `reference/routing.json` — the machine source of truth: path → bucket → skills → gates.
- `reference/routing.md` — the same table for humans, plus how to extend it.
- `reference/severity-rubric.md` — what is CRITICAL *here*. A closed list.
- `reference/subagent-prompt.md` — the verbatim reviewer prompt.
- `examples.md` — ✅/❌ pairs from real files in this repo.
- `scripts/` — the deterministic half. The hook reads what they write.

## What this guarantees, and what it does not

**Guarantees.** Every changed file is routed or named. Every gate the change
touches is run or explicitly recorded as skipped. Every CRITICAL blocks
`gh pr create` / `gh pr merge` / `git push` from this session.

**Does not.** It does not replace CI — `*.it.test.ts` needs Docker and usually
does not run locally. It does not see a PR opened from a human's own terminal;
the hook only intercepts this session's Bash calls. And a passing report is
per-machine: `.claude/pr-self-review/` is gitignored.

## Step 1 — Collect

```sh
.claude/skills/pr-self-review/scripts/collect-diff.sh
```

Writes `changeset.json` and `diff.patch`. "Open changes" means the union of
committed-vs-`origin/main`, staged, unstaged and untracked — untracked matters
here, config files have shipped that way before.

**Say in one line what you collected**: file count, buckets, agents. A silent
collect gets skipped, and that line is the only proof the routing ran.

```
43 files → backend, database, frontend, workflow-docs. unrouted: none.
```

If `unrouted` is not empty, name those files in your summary. They are reviewed
against the hard rules only, and a path that keeps appearing there needs a row
in `reference/routing.json`.

## Step 2 — Prove the deterministic half first

```sh
.claude/skills/pr-self-review/scripts/hard-rules.sh   # "Do not touch", contract parity, …
.claude/skills/pr-self-review/scripts/run-gates.sh    # typecheck · lint · arch · tests
```

Order matters for two reasons: a gate failure is cheaper to find than a model
finding, and the results get handed to the reviewers as *"already known, do not
re-report"*, which is what stops four agents all reporting the same type error.

A gate that **cannot run** — no Docker, missing config, missing binary — is a
WARNING, never a CRITICAL. It is a coverage hole, not a proven failure.

## Step 3 — Fan out

Read `reference/subagent-prompt.md` and launch **one `Task` per agent** named in
`changeset.json` → `.agents`, **all in a single message** so they run in
parallel. Each gets only its own files, only the skills its routing row names,
and only its own slice of the diff:

```sh
.claude/skills/pr-self-review/scripts/patch-slice.sh <agent>
```

An agent handed the whole diff reviews files that are not its job and produces
duplicates the merge step then throws away.

Skip the fan-out entirely when `changeset.json` → `.stats.degraded` is `true`
(over 150 files or 15 000 review lines). Say so; the report records it.

Write each agent's JSON reply verbatim to
`.claude/pr-self-review/agents/<agent>.json`. Do not edit the findings — the
next step grounds, dedupes and scores them, and it must be reproducible.

## Step 4 — Build the report

```sh
.claude/skills/pr-self-review/scripts/build-report.sh
```

Merges everything, then in order: drops findings that cite a line outside the
diff, drops agent findings that duplicate a gate, downgrades a CRITICAL the
agent was under 0.85 confident about, and downgrades anything already in
`baseline.json`. The verdict — `pass` iff zero CRITICAL — is computed here and
nowhere else, because the hook trusts that one field.

## Step 5 — Report the outcome

State the verdict, the counts, and every CRITICAL as `file:line — title`. Point
at `.claude/pr-self-review/report.md`.

On `pass`, offer the generated PR body:

```sh
.claude/skills/pr-self-review/scripts/pr-body.sh
gh pr create --body-file .claude/pr-self-review/pr-body.md
```

On `block`, **do not attempt the PR**. Fix the findings, then re-run from Step 1
— the report is keyed to the diff hash, so any edit invalidates it.

## The escape hatch

Appending `# psr-skip` to the command allows it through, and the hook records it
in `overrides.log` and in `report.json.override`, which `pr-body.sh` then prints
in the PR description. That is the point: the bypass is available and it is
never silent.

Legitimate: the gate is wrong and you have said why. Not legitimate: you are in
a hurry.

## Maintenance

- A skill in `.claude/skills/README.md` with no row in `reference/routing.json`
  is a hole — the run reports it.
- Regenerate the baseline with `scripts/baseline.sh` on a clean tree, in its own
  commit. A baseline folded into a feature commit hides new debt.
- When the same `psr_rule` keeps firing across sessions, that is an
  `INSIGHTS.md` entry under `## Recurring Errors & Fixes`, or a `NEVER` line in
  `CLAUDE.md`. Run the `engineering-insights` skill rather than adding a rule
  here.

## Failure modes — do not improvise

| Symptom | What it means | Do |
|---|---|---|
| `Docker is not running` on `server:test-it` | expected on most machines | nothing; it is a WARNING |
| a gate is `skipped` for a missing config | the config is untracked | `git add` it, say so |
| `unrouted` is non-empty | `routing.json` has a hole | name the files, add a row |
| the hook denies a command you just cleared | you edited a file after the report | re-run from Step 1 |
| `report.json is unreadable` | a script died mid-write | delete it and re-run |
