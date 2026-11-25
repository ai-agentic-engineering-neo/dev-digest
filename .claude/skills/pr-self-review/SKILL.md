---
name: pr-self-review
description: Reviews ALL local changes that are not on main yet (branch commits + staged + unstaged + untracked) before a pull request is opened — runs lint/typecheck/tests for the touched packages, then the repo's own skills on the files they cover (UI skills on client/, onion/backend skills on server/ + reviewer-core/), verifies every CRITICAL, and writes a PASS / BLOCK / INCOMPLETE verdict that the PR gate hook enforces. Use before `gh pr create`, before /ship, when the PR gate hook refuses a PR or a push, or when asked to self-review. Triggers - "self review", "pr self review", "review my changes before the PR", "is this ready for a PR", "/pr-self-review", "self-review перед PR", "перевір мої зміни", "чи можна відкривати PR".
argument-hint: "[--base <ref>] | waive <F-id> <reason>"
---

# pr-self-review

Local gate before a PR: **any confirmed, unwaived CRITICAL → BLOCK → do not open the PR.**
WARNING and SUGGESTION never block. Rubric: `references/severity-rubric.md`.

`S=.claude/skills/pr-self-review/scripts` — run every command from the repo root.
Artifacts: `.devdigest/cache/pr-self-review/runs/<hash16>/` per diff, verdicts in `…/verdicts/`.

## `/pr-self-review waive <F-id> <reason>`
Only when the user asks for it, with their reason, for a blocking CRITICAL they judge wrong:
`node $S/verdict.mjs waive <F-id> "<reason>"`. Never waive on your own initiative; never invent
the reason. Show the new verdict. A waiver is tied to the exact diff — any edit drops it.

## Review — follow in order

1. **Collect.** `node $S/collect.mjs [--base <ref>]` (default base `origin/main`).
   - Exit 2 = a skill in `.claude/skills/` is missing from `skill-map.json`: stop, tell the user
     which skill, propose its mapping (paths + priority) — do not review without it.
   - "Nothing to review" → report that and stop.
   - Note the run dir it prints (`…/runs/<hash16>/`) → `RUN` below.
2. **Deterministic checks.** `node $S/checks.mjs --plan $RUN/plan.json --fail-fast`
   (run it in the background if the summary lists client or server — tests take minutes).
   Exit 3 = CRITICAL found → skip steps 3–5 (fail-fast), go to step 6.
   Exit 4 = a check could not run (usually missing `node_modules`) → tell the user the install
   command; do not install on your own; continue — the verdict will be INCOMPLETE.
3. **Build units.** `node $S/units.mjs --run $RUN` — one unit = one skill × its files
   (≤ 1500 changed lines, at most 8 units by priority: architecture → security → others).
4. **Review in parallel.** In ONE message spawn one Agent per unit:
   `subagent_type: "general-purpose"`, `model: "sonnet"`, description `review <id> <skill>`,
   prompt: `Read and follow <the unit's prompt path>.` (the path units.mjs printed).
   Each agent writes `$RUN/units/<id>.findings.json`. Do not review the files yourself, and do
   not pass your own opinion of the change — the reviewers must not be anchored.
5. **Verify CRITICALs.** `node $S/units.mjs criticals --run $RUN`. For every listed finding
   that is not `(answered)`, in ONE message spawn one Agent:
   `subagent_type: "general-purpose"`, `model: "opus"`, description `verify <F-id>`,
   prompt: `Read and follow <its prompt path>.` Each writes `$RUN/verify/<F-id>.json`.
   Units reported as `missing`/`invalid`/`failed`: re-spawn that unit's reviewer once; if it
   fails again, leave it — the verdict says INCOMPLETE.
6. **Verdict.** `node $S/verdict.mjs` → exit 0 PASS · 3 BLOCK · 4 INCOMPLETE.
   It refuses a run whose diff no longer matches the working tree: if files changed during the
   review, start again from step 1.
7. **Report** to the user, in their language:
   - the verdict and counts;
   - every blocking CRITICAL: id, `file:line`, title, the fix — and offer to fix them;
   - WARNINGs briefly (one line each); SUGGESTIONs only as a count;
   - anything INCOMPLETE and what would complete it;
   - the report path (`verdicts/<hash>.md`); its "PR summary" block goes into the PR body.
   On BLOCK say plainly that the PR must not be opened yet. On INCOMPLETE the PR gate also
   refuses — fix the cause and re-run.

After fixing findings, run the whole review again from step 1 — the diff hash changed, so the
old verdict no longer counts. Unchanged units reuse nothing: this is deliberate, a fix can break
another rule.

## The gate (`hooks/pr-gate.mjs`, PreToolUse on Bash)
Refuses `gh pr create`, and `git push` when the current branch has an open PR, unless
`verdicts/<diffHash>.json` for the exact current diff says PASS. When it refuses, run this
skill (or fix the listed CRITICALs) and retry the same command. The diff is computed against
`origin/main` without fetching; a review done with another `--base` needs
`PR_SELF_REVIEW_BASE=<ref>` in Claude Code's environment. `PR_SELF_REVIEW_GATE=off` there
disables the gate — that is the user's switch, never set it yourself.

## Optional git pre-push hook (level 2)
Covers pushes from any tool, not only Claude. Install only when the user asks:
`node $S/install-git-hook.mjs` (`--status`, `--uninstall`). It never overwrites another
pre-push hook or writes into a hook manager's `core.hooksPath`. For a branch with an open PR it
needs a PASS for the pushed COMMIT — so commit everything, then review the clean tree. It never
runs the review itself. `git push --no-verify` bypasses it; that is the user's call, not yours.

## Rules for you as the orchestrator
- Never edit `findings.json` / `verify/*.json` / verdict files by hand, never write a PASS
  verdict yourself, never delete a run to get around a BLOCK.
- Never use `--no-verify`, `git push --force` or a direct `gh` call to get around the gate.
- The deterministic checks are the source of truth for lint/type/test; reviewers do not repeat
  them.
