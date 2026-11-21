---
name: engineering-insights
description: Reads and records non-obvious engineering lessons in the INSIGHTS.md of the module a task touches or asks about (client, server, reviewer-core, e2e, or the repo root for cross-module). Use at the START of every task — right after the user's request, before any other work or answer — to load that module's insights. Use again at the END of the task to record lessons, but only substantive ones not already in the file. Also use the moment an approach fails or turns out to be a dead end, an error needed real debugging, a tool/library/CI quirk surprises, a convention or design decision is found that the code alone doesn't make obvious, or the user corrects the agent.
---

# Engineering Insights

Each module keeps its own `INSIGHTS.md`. Run the three phases in order — phases 1 and 3 are REQUIRED.

## 1. Read — start of the task, before anything else
- Pick the module(s) from the paths and topic of the request (see Routing). Read their `INSIGHTS.md` + the root `/INSIGHTS.md`.
- Apply what is relevant and cite it briefly (`server/INSIGHTS.md → <title>`). Module unclear → read the root file now, the module file once you touch its first file.

## 2. Notice — during the task
When a rubric below fires, note the candidate and keep working. Do not write yet — the fix isn't verified.

| Rubric (trigger) | Section |
|---|---|
| A non-obvious approach worked (verified by test/build/run) | What Works |
| An approach failed or was a dead end · the user corrected you | What Doesn't Work |
| A convention or design decision the code alone doesn't reveal | Codebase Patterns |
| A dependency, tooling, or CI quirk | Tool & Library Notes |
| An error that needed real debugging (exact text → cause → fix) | Recurring Errors & Fixes |
| Session produced ≥1 insight above → dated 1–3 bullet summary | Session Notes |
| Unresolved, or seen but not verified | Open Questions |

## 3. Write — end of the task
1. **Quality gate** — every check must pass, else drop the candidate:
   not obvious to someone reading the code/README/CLAUDE.md · actionable cold (names a file, symbol, command, or error text and says what to do) · verified this session (else → Open Questions) · saves 5+ minutes next time.
2. **Re-read the target file right before writing.** Already there, even worded differently → skip. A real refinement → new entry with `Supersedes: <date · title>`.
3. **Nothing substantive and new → write NOTHING** (no Session Notes either). Tell the user: `Insights: nothing new`.
4. Otherwise insert each entry at the top of its section and report: `Insights: +2 → server/INSIGHTS.md (Recurring Errors & Fixes, Codebase Patterns)`.

Entry format (examples: `references/examples.md`):
```
### YYYY-MM-DD · short title
**What:** … **Why it matters:** … **Where:** `path` (`symbol`)
```

## Append-only — never overwrite
- NEVER use `Write` on an existing `INSIGHTS.md`; never rewrite, reorder, or "tidy" it.
- Only `Edit` as a pure insertion: `old_string` = the `## <Section>` line + its `<!-- … -->` line; `new_string` = that exact text unchanged + a blank line + the new entry.
- Never change or delete existing entries — including your own from this session.
- Missing file → create it from `references/template.md` (the only allowed `Write`).
- After writing, run `git diff -U0 -- '*INSIGHTS.md' | grep '^-[^-]'` — it must print nothing. If it prints lines, restore them immediately.

## Routing
Package of the files the lesson is about: `server/` (incl. `src/modules/repo-intel/`) · `client/` · `reviewer-core/` · `e2e/` → that package's file · spans several modules, or `scripts/`, `docs/`, root → `/INSIGHTS.md`.

## Gotchas
- No secrets, no line numbers (they rot) — cite path + symbol.
- Don't duplicate the module's `CLAUDE.md` Gotchas; never write into `CLAUDE.md` or this skill — if a lesson looks like a standing rule, suggest promoting it to the user.
- A file over ~40 entries (`grep -c '^### '`) → tell the user it's time to prune. Pruning is a human's job.
