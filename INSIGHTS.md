# repo — INSIGHTS

Append-only log of non-obvious things learned. Read before working, write only what is new.
Entry: `YYYY-MM-DD — claim — why / what to do (`path` · `symbol`)`. No line numbers.

## What Works
<!-- Approaches that succeeded after alternatives were weighed or tried. -->

## What Doesn't Work
<!-- Dead ends and antipatterns, with the reason. Most valuable section. -->

## Codebase Patterns
<!-- Conventions and architecture decisions not obvious from a single file. -->

## Tool & Library Notes
<!-- Dependency / CLI quirks, versions. -->

- 2026-11-26 — Commit everything BEFORE running `/pr-self-review` — `diff-hash.sh` hashes committed, staged and unstaged diffs separately, so committing the same code afterwards makes `last.json` stale and the PR gate blocks (`.claude/skills/pr-self-review/scripts/diff-hash.sh`).
- 2026-11-26 — `/pr-self-review` diffs against LOCAL `main`; run `git fetch origin main:main` first, or already-merged work is reviewed again (22 agents instead of a few) (`.claude/skills/pr-self-review/SKILL.md`).

## Recurring Errors & Fixes
<!-- `exact error text` — cause — fix. -->

## Session Notes
<!-- ### YYYY-MM-DD — task, then 1–3 bullets of what was added. -->

### 2026-11-26 — PR self-review and ConfigTab fix
- Added the commit-before-review and stale local `main` traps.

## Open Questions
<!-- - [ ] YYYY-MM-DD — question — look at: … -->
