---
name: engineering-insights
description: Record non-obvious lessons into the touched package's INSIGHTS.md (server/, client/, reviewer-core/, e2e/). Use at the END of a substantial task (wrap-up, >30 min, a problem solved or something discovered) AND the moment something surprising happens mid-task (capture as you go). Also invoked manually as /engineering-insights. Skip trivial config edits.
---

# engineering-insights

1. Pick the package(s) the task touched: `server/` (incl. `src/modules/repo-intel`), `client/`, `reviewer-core/`, `e2e/`. Write to `<package>/INSIGHTS.md` — each package only its own lessons.
2. Put each entry under the matching fixed section: What Works · What Doesn't Work · Codebase Patterns · Tool & Library Notes · Recurring Errors & Fixes · Session Notes · Open Questions. Don't skip "What Doesn't Work" — dead ends are the most valuable.
3. **Append only.** Add a bullet at the top of the section; never rewrite or delete existing ones (only a monthly review prunes). If a new entry contradicts an old one, keep both and add `⚠ conflicts with <date> entry` — a human resolves it.
4. Entry = `- YYYY-MM-DD — <concrete, actionable fact: where, what fails, what to do instead>`. Name files, functions, limits. Bad: "async is tricky". Good: "`groundFindings` drops findings on renamed files — pass the new path from `diff-loader.ts`".
5. Test before writing: "would anyone reading the code already know this?" → yes → don't write it. Trivial edits → nothing.
6. Session Notes: one dated line summarising the session (what changed, what's left). Open Questions: what stayed unresolved.
7. If a section passes ~200 entries, stop and propose splitting it (e.g. `INSIGHTS-db.md`) instead of appending.
8. Show the user the added lines at the end — the file is a draft under review, not the truth.
