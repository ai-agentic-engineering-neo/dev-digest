# Insights — repo-wide

Dated discoveries and decisions that explain *why* the code looks the way it does.
Not loaded by default. Promote an entry to a CLAUDE.md "Gotchas" line only if dropping it would make Claude err.

## 2026-11-24 — Comment tags like T1.3 / T3 / S11 / A2 / F1 / L02 / L04
Internal course ticket ids. There is no index of them in the repo — treat them as history, not as a spec to look up.

## 2026-11-24 — Ghost "CI agent-runner"
`.gitignore` and comments in reviewer-core/server mention `agent-runner/` and an `@vercel/ncc` bundle. The folder does not exist in the starter; it returns in M6 (Export to CI).

## 2026-11-24 — Git history is squashed
The first commit is a "squashed snapshot"; `git blame` rarely explains intent. Prefer READMEs and these insights.

## 2026-11-24 — Two `@devdigest/shared` copies have drifted
`diff -rq server/src/vendor/shared client/src/vendor/shared` shows 5 differing files (e.g. the client `LLMProvider.id` lacks `'openrouter'`). There is no sync script; server is the source of truth.

## 2026-11-24 — Repo tooling noise
`.claude/skills/` holds third-party reference skills (loaded lazily by Claude Code). `skills-lock.json` lists skills not present in the folder (`architecture-patterns`, `github-workflow-automation`). `.omc/` is local tool state.
