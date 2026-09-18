---
name: engineering-insights
description: Captures non-obvious engineering knowledge from this session — what worked, what failed, codebase/tool quirks, recurring bugs and fixes, open questions — into the current module's INSIGHTS.md. Use at the end of a substantial session (>30 min, something was solved, decided, or discovered) or right after hitting a gotcha. Trigger on "record this insight", "log this gotcha", "update insights", "wrap up this session", or /engineering-insights.
---

Identify which module this session touched (`client/`, `server/`, `reviewer-core/`, or `e2e/`) and open its `INSIGHTS.md`.

For each non-obvious finding — a working approach, a failed approach, a codebase/tool quirk, a recurring bug and its fix, or an unresolved question — append one line under the matching heading in the form `YYYY-MM-DD — <finding> (file:line)`. Add one dated line under `Session Notes` summarizing the session as a whole.

Apply the cold-read test: if another agent reading the line alone wouldn't know exactly what to do, name the file, command, or root cause until it would. Skip generic knowledge, trivial config-only edits, one-off issues, and anything already documented elsewhere. Write each entry knowing it came from an LLM-summarized wrap-up, not verified fact — a human will periodically spot-check it, so keep entries concrete enough to check.

Append only: read the file first, then add new lines to the end of the matching section — never rewrite, reorder, or delete anything already there, and never regenerate the whole file. If a new finding contradicts an existing line, don't silently add a conflicting one — append a note flagging the conflict for review instead. If the file has grown past ~200 entries, propose splitting it into domain-scoped sibling files (e.g. `INSIGHTS-Auth.md`, `INSIGHTS-Database.md`) rather than keep appending to one flat file. If nothing non-obvious happened, do nothing and say so.
