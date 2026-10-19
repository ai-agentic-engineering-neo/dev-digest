---
name: engineering-insights
description: Records non-obvious engineering lessons into the INSIGHTS.md of the module the work touched (client, server, reviewer-core, e2e; root INSIGHTS.md if cross-package). Use when a fix is confirmed after a surprising cause, an approach turned out to be a dead end, a library/tool behaved unexpectedly, the same error recurred, an undocumented convention was discovered, or a question stayed unresolved — and when the user says "wrap up", "what did we learn", or "/engineering-insights".
---

# Engineering insights

1. File: `<module>/INSIGHTS.md` of the code you changed or debugged; root `INSIGHTS.md` only if the lesson spans packages. Read it first — never duplicate an existing entry.
2. Section: What Works · What Doesn't Work · Codebase Patterns · Tool & Library Notes · Recurring Errors & Fixes · Session Notes · Open Questions. Never skip What Doesn't Work — dead ends are the most valuable.
3. Filter — write only if a future session would act differently because of it (saves 5+ min). Skip: generic knowledge, one-off fixes, anything already in code/README/CLAUDE.md, secrets. Record only after the fix is confirmed; unverified hunches go to Open Questions.
4. One insight per bullet, actionable cold — what to do/avoid, where, why:
   ❌ "Promises can be tricky"  ✅ "Promise.all() on ingest times out after ~30 items — use Promise.allSettled() in batches of 10"
5. Format: `- YYYY-MM-DD · <ALWAYS/NEVER/do X> — <why> (<path:line | command>)`. Session Notes: one dated line per session.
6. Append-only: new entries go at the top of their section; never edit or delete old ones. A wrong entry gets a new dated one: "supersedes YYYY-MM-DD …". If the file passes ~100 entries, tell the user it needs a consolidation pass — don't prune yourself.
7. Tell the user in one line what you added and where.
