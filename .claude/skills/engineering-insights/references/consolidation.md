# Consolidation ritual (monthly, human-led)

Why: an agent-written log decays. Past ~200 entries signal drowns in noise, near-duplicates multiply, and entries about
refactored or deleted code become wrong. Contradictory entries get "reconciled" by the model, sometimes incorrectly.

Run when: monthly, or when the skill flags a file over ~150 entries / a bloated section. The **decision is the user's**;
the agent may propose, not apply silently.

## Steps
1. List candidates: entries mentioning files, commands or versions that no longer exist (verify each against the code).
2. Merge near-duplicates into one entry; keep the earliest date and refresh the evidence.
3. Resolve `Open Questions`: answered ones move into the matching section (usually `Codebase Patterns` or
   `Recurring Errors & Fixes`) and are removed from `Open Questions`.
4. Promote stable, always-relevant rules to `CLAUDE.md` (a "Gotchas" line) - and keep the detail in INSIGHTS.
5. Trim `Session Notes` older than ~3 months to one line each, or drop them if nothing there is still useful.
6. Move old, still-true-but-rarely-needed entries to `INSIGHTS-archive.md` next to the file (do not delete knowledge outright); split a file over ~200 entries into a scoped file (e.g. `INSIGHTS-migrations.md`) and link it from `CLAUDE.md`.
7. Where entries conflict or you are unsure, mark them `[REVIEW NEEDED]` for the human instead of choosing silently.
8. Commit the result so a bad consolidation can be rolled back.
