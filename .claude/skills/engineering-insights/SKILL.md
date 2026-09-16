---
name: engineering-insights
description: Captures non-obvious engineering knowledge from this session — what worked, what failed, codebase/tool quirks, recurring bugs and fixes, open questions — into the current module's INSIGHTS.md. Use at the end of a substantial session (>30 min, something was solved, decided, or discovered) or right after hitting a gotcha. Trigger on "record this insight", "log this gotcha", "update insights", "wrap up this session", or /engineering-insights.
---

Identify which module this session touched (`client/`, `server/`, `reviewer-core/`, or `e2e/`) and open its `INSIGHTS.md`.

For each non-obvious thing that happened — a working approach, a failed approach, a codebase/tool quirk, a recurring bug and its fix, or an unresolved question — append one line under the matching heading. Add one dated line under `Session Notes` summarizing the session.

Apply the cold-read test: if another agent reading the line alone wouldn't know exactly what to do, name the file, command, or root cause until it would. Skip generic knowledge, one-off issues, and anything already documented elsewhere.

Append only — never edit or delete existing lines. If nothing non-obvious happened, do nothing and say so.
