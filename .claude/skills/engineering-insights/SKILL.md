---
name: engineering-insights
description: Captures a non-obvious engineering insight (a working pattern, an antipattern/dead end, a decision with its reason, or a recurring error and fix) found while working in this repo, and files it into the touched package's INSIGHTS.md. Use at the end of a session that learned something substantial, or immediately when something surprising comes up — skip when nothing non-obvious happened.
---

Read the target `INSIGHTS.md` first — skip if the same insight is already there.
Append (never rewrite) one dated line under the matching section: What Works ·
What Doesn't Work · Codebase Patterns · Tool & Library Notes · Decisions ·
Recurring Errors & Fixes · Session Notes · Open Questions.
File it in whichever package the session touched: `server/INSIGHTS.md`,
`client/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`, or `e2e/INSIGHTS.md`.
Stale entry? Append a new dated line correcting it — don't edit or delete the old one.
Bar: if it'd be obvious to anyone reading the code, don't write it.
