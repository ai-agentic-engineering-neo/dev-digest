---
name: engineering-insights
description: Records non-obvious engineering findings into the INSIGHTS.md of the module being worked on (server, client, reviewer-core, e2e). Use when a session hits a gotcha, a failed approach, a user correction, a dependency quirk, an error whose root cause wasn't obvious, or a decision with a non-obvious reason; also on "what did we learn", "capture insights", "wrap up", and ALWAYS before finishing a task that involved debugging or a non-trivial change.
hooks:
  PreToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: node "$CLAUDE_PROJECT_DIR/.claude/skills/engineering-insights/scripts/guard-insights.mjs"
---

# Engineering insights

Goal: the next session in this module doesn't re-learn what this one learned.
MUST run before finishing any task with debugging or a non-trivial change. "Nothing notable" is
a valid result only after checking the signals below — not an excuse to skip.
Capture right away when it happens; later you lose the why.

## Signals worth capturing
- user corrected you (highest priority)
- an approach failed and you switched
- "it turned out that…" — root cause differed from the obvious guess
- a library/tool/env behaved unexpectedly
- a convention or decision that the code alone doesn't explain

## Admission test — ALL must hold, else skip
- not obvious to someone reading the code or README/docs
- verified (fix worked / failure reproduced); unverified → Open Questions
- would save a future session 5+ minutes or change what it does
- not a one-off (network blip, typo, personal style)

## Where
`<module>/INSIGHTS.md` for the code you touched: `server/`, `client/`, `reviewer-core/`, `e2e/`.
Several modules → each one gets its own entry. Read the file first.

## Never lose existing text
- MUST NOT use Write, `>`, or `sed -i` on an existing INSIGHTS.md.
- Insert with Edit only: `old_string` = the section heading line, `new_string` = the same
  heading line + newline + your entry. Nothing else in the file changes.
- File missing → create it with the 7 headings. Section missing → insert it before
  `## Open Questions` the same way (or at file end, with the last line as anchor kept intact).
- A guard hook blocks edits that would remove text; if blocked, fix the edit — never work around it.

## How
- Insert under the matching section (newest first): What Works · What Doesn't Work ·
  Codebase Patterns · Tool & Library Notes · Recurring Errors & Fixes · Session Notes
  (`### YYYY-MM-DD`, long sessions only) · Open Questions.
- One line: `- YYYY-MM-DD — <what, imperative> — <why / fix> (path/to/file.ts › symbol)`.
  ≤2 sentences, concrete names/commands/numbers, no line numbers.
  - ❌ `be careful with async`
  - ✅ `- 2026-11-22 — db:migrate silently no-ops on Windows — compare import.meta.url with pathToFileURL(argv[1]).href, not a hand-built file:// URL (server/src/db/migrate.ts › entrypoint check)`
- Already there → don't repeat. Outdated/wrong → MUST NOT edit or delete; insert
  `- YYYY-MM-DD — SUPERSEDES <date> entry — …`.
- Workaround for bad tooling → also tell the user the root cause worth fixing.
- Same gotcha hit again although it's recorded → suggest promoting it to `<module>/CLAUDE.md`.
- File over ~150 lines → suggest the user consolidate it.

Finish with one line per entry written: `<file> › <section>: <entry>`, or "no insights" + why.
