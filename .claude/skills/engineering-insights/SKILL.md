---
name: engineering-insights
description: Reads and maintains per-module engineering insights (INSIGHTS.md in server/, client/, reviewer-core/, e2e/). Use at the start of every task, right after the user's request and before any other action, to read the INSIGHTS.md of the module the task touches; and at the end of the work to record substantial non-obvious findings (dead ends, library quirks, decisions with reasons, recurring errors) that are not already in that file. Also use when the user says /engineering-insights, "wrap up", "what did we learn" or "запиши інсайт".
---

# Engineering insights

Each module has its own `<module>/INSIGHTS.md`: `server/` (repo-intel lives here), `client/`, `reviewer-core/`, `e2e/`. If no module fits, say so; do not create a file.

## 1. Before you start (mandatory)
After the user's request and before any other action, work out which module(s) it touches and Read the **whole** `<module>/INSIGHTS.md`. Treat it as high-confidence guidance unless the user says otherwise. If the module only becomes clear later, read it before the first edit there.

## 2. At the end (always check, write only if substantial)
1. Re-read the module's `INSIGHTS.md` (it may have changed).
2. List what this session found that passes the filter. Drop anything already in the file, including the same idea in other words. Nothing left → write nothing and say "nothing new".
3. Add at most 5 entries, each in the right section, in the line format below.
4. Finish with one line: what was added, and where.

**Filter.** Record it only if the next agent would save 5+ minutes and it is not obvious to someone reading the code. Skip general knowledge, one-off failures, what README/CLAUDE.md already say, trivial edits, and code that is changing fast. A user correcting your approach is the strongest signal: record it first.

| Finding | Section |
|---|---|
| Approach that worked | What Works |
| Dead end, antipattern, repeated mistake | What Doesn't Work · Recurring Errors & Fixes |
| Convention or decision (give the *why*) | Codebase Patterns |
| Dependency or tool quirk | Tool & Library Notes |
| Left unresolved | Open Questions |
| Session summary, 1–3 bullets under `### YYYY-MM-DD` | Session Notes |

**Line format**, readable cold: `- YYYY-MM-DD — <what, concrete> — <path + symbol, no line numbers> — <what to do>`
- Bad: `async code can be tricky`
- Good: `- 2026-11-20 — PromptCache defaults to now = () => 0, so entries never expire — server/src/platform/model-router.ts — pass a real clock if you wire it.`

## Never overwrite what is there
- Edit `INSIGHTS.md` with the **Edit** tool only, never Write (Write replaces the whole file).
- Insert directly under the section heading, newest first: `old_string` = the heading line (e.g. `## What Works`), `new_string` = that heading plus the new line. Never put an existing entry in `old_string`.
- Before editing, `cp <file> "${TMPDIR:-/tmp}/insights.before"`; after, `diff` it against the file. Only added lines (`>`) are allowed; any `<` line means something was erased, so restore from the copy and retry.
- Never edit or delete existing lines. To correct one, add `Supersedes YYYY-MM-DD: …`.
- More than ~100 entries in a file: do not prune it yourself, tell the user.
