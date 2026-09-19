---
name: pr-self-review
description: Use before opening a pull request (before `gh pr create`), when the user says "self-review", "review my changes before PR", "перед PR", or invokes /pr-self-review. Reviews all local changes (branch vs main + uncommitted) by mapping changed files to the project's skills (UI skills on client files, backend architecture skills on server/reviewer-core files), runs deterministic guards, and BLOCKS the PR when a confirmed critical finding exists.
---

# PR Self Review

Reviews what would land in the PR, locally, before it is opened. A hook (`scripts/gate.sh`, registered in `.claude/settings.json`) denies `gh pr create` / `gh pr merge` from Claude unless a fresh `PASS` verdict exists for the exact current code. Details: `docs/cc-plans/2026-09-19+pr-self-review-skill.md`.

Files: [skill-map.md](references/skill-map.md) (file → skills) · [severity.md](references/severity.md) · [agent-prompt.md](references/agent-prompt.md). State lives in `.claude/.pr-self-review/` (gitignored: `verdict.json`, `report.md`, `cache.json`).

## Workflow

`S=.claude/skills/pr-self-review/scripts`; `mkdir -p .claude/.pr-self-review`.

1. **Changes:** `$S/changed-files.sh`. Empty → write PASS verdict (step 9) and stop.
2. **Guards:** `$S/guards.sh` → JSON array of critical findings (lock files, migrations journal, vendor/shared drift, `pnpm arch`, `pnpm typecheck`). Deterministic, not verified again.
3. **Map to skills:** apply [skill-map.md](references/skill-map.md) to the file list. Note files matched by no skill → "not reviewed by any skill" in the report.
4. **Cache:** `cache.json` = `{"<skill>|<sha of skill's SKILL.md>|<git hash-object file>": [findings]}`. Per skill, only files with no cache entry are reviewed now.
5. **Review:** for every skill with uncached files launch one `Agent` (`model: sonnet`) using the review prompt in [agent-prompt.md](references/agent-prompt.md). **All in one message, in parallel.** Store results in the cache.
6. **Verify:** for each LLM-produced critical, launch a verify agent (same file). Refuted → downgrade to major.
7. **Waivers:** `.claude/pr-self-review-waivers.json` = `[{"file","rule","reason"}]`. A critical matching `file`+`rule` is waived: doesn't block, listed with its reason. Create/edit waivers ONLY on the user's explicit request; `reason` is mandatory.
8. **Report:** merge guards + findings, dedupe by `file:line+rule`, sort critical → major → minor. Print a table in chat, write `report.md`. Include waived items and unreviewed files.
9. **Verdict:** `BLOCKED` if ≥1 non-waived critical, else `PASS`. Write
   `jq -n --arg s "$STATUS" --arg f "$($S/fingerprint.sh)" --argjson c $CRIT --argjson w $WAIVED '{status:$s,fingerprint:$f,critical_count:$c,waived_count:$w,created_at:(now|todate)}' > .claude/.pr-self-review/verdict.json`
   Any file edit afterwards makes the verdict stale (fix → re-run; cache keeps it cheap).
10. **Next:** `BLOCKED` → show criticals with fixes, do NOT open the PR. `PASS` and invoked before a PR → `gh pr create` against the own fork (`otkachuk777/dev-digest`, base `main`), adding a `## Self-review` section to the body: major/minor counts, waivers with reasons, unreviewed files.

## Rules

- Review only; never auto-fix, never edit code during this skill.
- Never regenerate `.dependency-cruiser-known-violations.json` to make `pnpm arch` pass.
- The hook only guards commands Claude runs; a manual `gh` by the user is their deliberate override.
- Sanity check of the mechanism: `bash $S/gate.test.sh`.
