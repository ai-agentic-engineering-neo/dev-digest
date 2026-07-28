---
name: engineering-insights
description: "Capture non-obvious engineering lessons as append-only entries in the touched module's LEARNINGS.md (server/, client/, reviewer-core/, e2e/ — repo-intel shares server's). Use at the end of a substantive session, or as soon as something non-obvious surfaces mid-task."
---

Append (never rewrite) to `<module>/LEARNINGS.md`, filed under the matching
section: What Works · What Doesn't Work · Codebase Patterns · Tool & Library
Notes · Recurring Errors & Fixes · Session Notes · Open Questions. Each entry
must be concrete enough to act on cold — name the exact file/function/
behavior. Test: if it'd be obvious to anyone reading the code, don't write
it. Skip trivial edits; only log sessions with a real problem, fix, or
discovery.
