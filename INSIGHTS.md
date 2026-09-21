# Insights — root (cross-module)

Lessons that span more than one module, or live in tooling, CI and root config.
Module-local lessons go in `<module>/INSIGHTS.md` instead.
Append-only — correct an entry with a dated note beneath it, never by rewriting it.
See `.claude/skills/engineering-insights/`.

## What Works

_No entries yet._

## What Doesn't Work

### A hook's `"once": true` did not suppress repeat firing in the Claude Desktop app harness (2026-09-18)

Added a `Stop` hook to `.claude/settings.json` with `"once": true` (per the documented schema: "hook runs once and is removed after execution") to nudge `/engineering-insights` at session wrap-up without nagging every turn. It still fired its `additionalContext` after every single assistant turn — across a session restart too, not just within one live process — so `once` bought nothing observable here. Root cause unconfirmed (no access to the harness's hook-execution internals from inside the session); could be host-specific (Claude Desktop's Code tab) rather than a general Claude Code bug.

**Rule:** don't rely on `"once": true` to make a `Stop` hook non-repetitive when running inside Claude Desktop. If a Stop-hook reminder must fire, prefer `SessionStart` (confirmed to fire exactly once per session here) over `Stop`, or skip the Stop hook if a `SessionStart` nudge already covers the "fires automatically" requirement — don't add both banking on `once` to keep Stop quiet. Removed the Stop hook entirely in this repo's `.claude/settings.json` after ~10 repeat firings in one session; `SessionStart` alone remains.

### `git add -A` while a subagent is running swallows its work into your commit (2026-09-20)

Committing a two-file docs change during a parallel refactor produced "158 files changed": a background agent was moving route folders with `git mv`, which stages the rename immediately, so the whole in-flight step landed inside an unrelated `docs(...)` commit. `git status` looked innocent beforehand — the renames read as ordinary staged entries, not as someone else's half-finished work. Recovered with `git reset --soft HEAD~1`, `git restore --staged client/src`, then a pathspec commit.

**Rule:** while any subagent is editing the repo, never `git add -A` / `git add <dir>`; commit with explicit paths (`git commit -m … -- path/a path/b`), which ignores the index entirely. If a commit comes back with a file count you did not expect, `reset --soft` and redo it rather than "fixing it later" — the renames are unrecoverable from the message alone. (commit `6a5ebd4`, split out of an accidental 158-file commit)

## Codebase Patterns

_No entries yet._

## Tool & Library Notes

### `e2e/` and `reviewer-core/` use npm, not pnpm — running the wrong one litters stray lockfiles (2026-09-18)

`client` and `server` use pnpm (`pnpm-lock.yaml`); `e2e` and `reviewer-core` use npm (`package-lock.json` — see each's `CLAUDE.md` "do not touch"). Running `pnpm typecheck`/`pnpm install` inside `e2e/` or `reviewer-core/` "works" (pnpm happily installs from `package.json`) but silently creates a `pnpm-lock.yaml` + `pnpm-workspace.yaml` next to the real npm lockfile — untracked files that look like legitimate new lockfiles in `git status` and would get committed if not caught.

**Rule:** before running any package-manager command in a module, check which lockfile already exists there (`ls <module>/*lock*`) — don't default to the monorepo's dominant pnpm. If stray `pnpm-lock.yaml`/`pnpm-workspace.yaml` show up in `git status` for `e2e/` or `reviewer-core/`, delete them; `package-lock.json` is the source of truth there. (`e2e/package-lock.json`, `reviewer-core/package-lock.json`)

### The built-in browser pane has no file-upload tool — inject the File yourself (2026-09)

Verifying the skill import end to end needed a real `.zip` in an `<input type="file">`.
The pane's toolset has no upload action (that is Claude-in-Chrome's `file_upload`), and
it cannot open `file://`, so there is no path from disk to the page. What works: base64
the file into a `javascript_tool` call, rebuild it with `new File([bytes], name)`, put it
on the input through a `DataTransfer`, and dispatch `new Event("change", {bubbles:true})`
— React's onChange picks it up.

**Rule:** don't conclude a file-upload flow is unverifiable in the pane; inject the File
through DataTransfer. Take the drawer's state from the DOM (`[role="dialog"]`) rather
than a screenshot — screenshots lag a React re-render and showed a stale dropdown three
times in a row (commit `4703d6d`)

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
