---
name: engineering-insights
description: "Append a non-obvious engineering lesson to the touched module's LEARNINGS.md (server/, client/, reviewer-core/, e2e/ — repo-intel shares server's). Reads the file first and extends an existing entry instead of duplicating it. Use at the end of a substantive session, or the moment something non-obvious surfaces mid-task."
when_to_use: "Finished a task that involved a real problem, fix, or discovery; hit a dead end worth recording; found surprising library, tooling, or framework behavior; or the user says 'log this', 'capture what we learned', 'update learnings', 'write it down'."
---

**Read the module's `LEARNINGS.md` in full before writing.** If the lesson is
already there, extend that entry — never add a second copy.

**Never overwrite.** Insert with `Edit`; never `Write` this file — that
replaces every existing entry. Anchor the edit on the section heading and put
the new entry directly under it, leaving the rest of the file byte-identical.
Add one entry per edit. Never reword, reformat, or delete an entry you didn't
just write — to correct an old one, add a new dated entry that supersedes it.

File under the matching section: What Works · What Doesn't Work · Codebase
Patterns · Tool & Library Notes · Recurring Errors & Fixes · Session Notes ·
Open Questions.

Record only what would change a future session's behavior: name the exact
file, function, or observed behavior, and date the entry. Skip general best
practice, one-off context, and anything obvious from reading the code. If
nothing clears that bar, write nothing and say so.

Level of specificity required: [examples.md](examples.md).
