---
name: pr-self-review
description: "Self-review of ALL local changes (branch commits + staged + unstaged + untracked) before a pull request: routes every changed file to the matching project skills (frontend-architecture, react/next best practices, onion-architecture, fastify, drizzle, postgres, zod, security, performance reviewer), runs deterministic checks (secrets, contract drift, i18n keys, typecheck, lint, tests touched), verifies CRITICAL findings and writes a report that gates `git push`, `gh pr create` and `gh pr merge`: one CRITICAL blocks. Use before opening or updating a PR, before pushing, when the guard says 'BLOCKED by pr-self-review', or when the user says 'self review', 'review my changes', 'check before PR', 'ready to open a PR?', 'pre-PR check'."
argument-hint: "[--base <ref>] [--quick] [--no-cache] [--publish-status]"
---

# PR Self Review

Reviews the local diff with the skills that own each file, then decides
**pass** or **blocked**. One CRITICAL means blocked: the guard
(`scripts/guard_pr.py`) refuses `git push`, `gh pr create` and `gh pr merge`
until a fresh review passes.

All state lives in `.devdigest/self-review/` (git-ignored):
`<branch>.plan.json`, `<branch>.checks.json`, `<branch>.json` (the report),
`<branch>.pr.md`, `<branch>.dismissals.json`, `findings/`, `cache/`.
`<branch>` is the branch name with `/` replaced by `__`.

`S=.claude/skills/pr-self-review/scripts` below. Run everything from the repo root.

## Workflow

### 1-2. Plan

```sh
python3 $S/route_skills.py [--base <ref>] [--mode quick] [--no-cache]
```

It prints, per group (`ui`, `backend`, `security`, `performance`), how many files
need review, how many are cached and which sources apply. It also prints
warnings: PR too big, or a skill missing from `routing.json`. Read the plan JSON
from the `PLAN` line.

- No files in any group and no warnings → go to step 3. Checks still run.
- `unmapped-skill` warning → tell the user and propose a `routing.json` entry.
  Don't silently ignore it.
- `size` warning → suggest splitting the PR. Continue the review anyway.

### 3. Deterministic checks

```sh
python3 $S/run_checks.py            # mode comes from the plan
```

These are secrets, contract drift, i18n keys and touched-tests. In `full` mode
it also runs typecheck and lint for the touched packages. They are cheap and
exact. Run this step in parallel with step 4.

### 4. Skill review (parallel subagents)

For every group that has `files` (not only `cached_files`), launch one
`general-purpose` subagent with the template in
[references/reviewer-prompt.md](references/reviewer-prompt.md). Send all
Agent calls **in one message** so they run in parallel.
Each one returns `{"group", "findings": [...]}`. Save each answer as
`.devdigest/self-review/findings/<group>.json` (the `FINDINGS_DIR` line of
step 1). That folder is git-ignored and cleared by every new plan. Never put
findings anywhere else in the repo: an untracked file changes `diff_hash` and
makes the report stale at once.

Ground rules (the template repeats them):
- Only **changed lines** count. Legacy code is never a finding.
- The package `AGENTS.md` overrides the generic skill. `INSIGHTS.md` lessons are
  extra checks.
- Severity follows [severity-map.md](severity-map.md).

### 5. Verify CRITICAL

Subagents always return `"verified": false`. For every CRITICAL candidate, run
the verify pass from `references/reviewer-prompt.md`: re-read the code and
confirm it. Set `"verified": true` in the findings file only for confirmed ones.
Unverified CRITICALs are downgraded to WARNING by the report script. That is
intended, because a false block costs more trust than a missed warning.

### 6. Report

```sh
python3 $S/write_report.py build --findings .devdigest/self-review/findings/*.json
```

The script:
- drops off-diff findings;
- merges checks and cached findings;
- applies dismissals;
- writes the report and `<branch>.pr.md`;
- prints the verdict.

It refuses to run if the tree changed since step 1. Re-plan in that case.

### 7. Tell the user

Keep it short:
1. **Verdict** with counts.
2. **Every CRITICAL** with its `id`, file:line, rule, why and fix.
3. Top WARNINGs, at most 5.
4. Warnings from the plan.

When blocked, offer to fix the CRITICALs. After fixing, re-run from step 1.
The cache makes it cheap: only changed files are reviewed again.

When the user disagrees with a finding, dismiss it **only on their
explicit say-so**, with their reason:

```sh
python3 $S/write_report.py dismiss --id <id> --reason "<why it is not a problem>"
```

Then, if the reason is a reusable lesson (a false positive pattern, a project
convention), offer to record it with the `engineering-insights` skill. Next
reviews then read it from `INSIGHTS.md`.

### 8. Opening the PR (when verdict = pass)

- Build the PR body from the user's summary/test plan plus
  `.devdigest/self-review/<branch>.pr.md`. Then run
  `gh pr create --body-file <file>`. The guard lets it through.
- `--publish-status`: after the commit is pushed, run
  `python3 $S/publish_status.py`. It posts the `pr-self-review` commit status
  on HEAD. With branch protection requiring that status, GitHub itself refuses
  the merge on failure.

## Modes

| Mode | What runs | When |
|---|---|---|
| `full` (default) | all groups, all severities, typecheck + lint | before opening / updating a PR |
| `quick` | all groups but CRITICAL candidates only, no typecheck/lint | fast loop while fixing |

The guard accepts a report from either mode. Prefer `full` before `gh pr create`.

## Gate (how blocking works)

| Layer | Where | Blocks |
|---|---|---|
| Claude Code `PreToolUse` hook | `.claude/settings.json` → `guard_pr.py` | `git push`, `gh pr create`, `gh pr merge` run by Claude |
| git `pre-push` hook | `scripts/git-hooks/pre-push` → `auto_review.py` (enable: `git config core.hooksPath scripts/git-hooks`) | `git push` from any terminal; **runs the review itself** when needed |
| GitHub commit status | `publish_status.py` + branch protection | the merge button |

The gate passes only if:
- a report for the current branch exists,
- its `diff_hash` equals the current tree (any edit after the review invalidates it),
- its verdict is `pass`.

Committing reviewed changes does not invalidate the report, because the hash
covers the content against merge-base, not the commit layout. Branch deletes,
`--tags` and `--dry-run` pushes are never gated.

`python3 $S/guard_pr.py --check` shows the gate status.

## Automatic run before every push

Nobody has to ask for the review.

- **Claude runs `git push` / `gh pr create`.** The `PreToolUse` guard blocks it
  and tells Claude to run this skill now without asking. If the verdict is
  `pass`, Claude retries the same command.
- **A person runs `git push`.** The `pre-push` hook calls `auto_review.py`:

| Report state | What happens |
|---|---|
| fresh + pass | push goes through instantly |
| fresh + blocked | push refused, CRITICALs listed (same diff = same verdict, no re-run) |
| missing / stale | runs this skill headless (`claude -p "/pr-self-review"`), then gates on the new report |
| only branch deletes / tags | not gated |

The headless run is read-only. It may only:
- use Read/Grep/Glob/Agent/Skill;
- write to `.devdigest/self-review/**`;
- run the skill's scripts and read-only git commands.

It cannot edit code, dismiss findings, commit or push. If the `claude` CLI is
missing or the run fails, the push is refused with instructions.

Env knobs:
- `PR_SELF_REVIEW_AUTO=0`: only gate, don't run the review;
- `PR_SELF_REVIEW_MODE=quick`;
- `PR_SELF_REVIEW_TIMEOUT` (default 1800s);
- `PR_SELF_REVIEW_BUDGET_USD`;
- `PR_SELF_REVIEW_MODEL`.

Emergency bypass: `git push --no-verify`.

## Don't

- Don't set `"verified": true` without re-reading the code.
- Don't dismiss a finding on your own judgement. Dismissals are the user's call.
- Don't edit the report JSON by hand. Use `write_report.py`.
- Don't route by guessing. If a file needs a new skill, change `routing.json`
  (and `tests/`) so the rule is explicit.

## Changing the routing

`routing.json` has three parts:
- `groups`: source → checklist focus + context files;
- `routes`: glob (+ optional `contains` regex) → sources;
- `skip_skills`: skills that are not reviewers.

Every skill in `.claude/skills/` must be in a group or in `skip_skills`,
otherwise the plan warns. After editing it, run the tests:
`python3 -m unittest discover -s .claude/skills/pr-self-review/tests`.
