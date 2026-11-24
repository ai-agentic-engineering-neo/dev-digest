---
name: engineering-insights
description: Captures non-obvious engineering lessons into the INSIGHTS.md of the module a task touched, creating the file if it is missing. Use at the end of a task or session (wrap-up), and during work the moment something non-obvious happens - a dead end, a surprising root cause, a library or tool quirk, a decision with a reason, or an error seen twice. Also use when the user says "wrap up", "save what we learned", "note this", or runs /engineering-insights.
---

# Engineering insights

Append what this session learned to the touched module's `INSIGHTS.md`, so the
next session in that module starts with it. `INSIGHTS.md` is the one file a
module keeps this knowledge in: read it before working there, write to it here.

1. **Find the module.** It is the nearest ancestor of the touched files that
   has a `package.json` (`server`, `client`, `reviewer-core`, `e2e`). Files
   under `server/src/modules/repo-intel/` use that folder instead. A task that
   touched several modules writes to each one's file.
2. **Create if missing.** If `<module>/INSIGHTS.md` does not exist, create it
   from [`template.md`](template.md), keeping every section heading and
   replacing `<module>` in the title with the folder name.
3. **Filter.** If it would be obvious to anyone reading the code, do not write
   it. Skip trivial edits. Recording nothing is a valid result.
4. **Write it actionable cold.** A reader with no context must know what to do
   without re-investigating: what happens, where, and what to do instead.
   `- YYYY-MM-DD — <specific lesson and the action to take>. Evidence: path:line`
   The path is relative to the repo root; open the file and check the line.
5. **Append only.** Add the entry at the end of one section, after any
   existing entries. Pick the first that fits: a failed approach → What
   Doesn't Work; an error seen more than once → Recurring Errors & Fixes; a
   choice with its reason → Decisions; a dependency quirk → Tool & Library
   Notes; a convention → Codebase Patterns; otherwise What Works. Never
   rewrite, reorder or delete existing entries; to correct one, append a new
   dated entry that names it. Do not repeat an entry that is already there, and
   never record secrets.
6. **Leave Key Facts to people.** That first section holds the curated,
   lasting facts about the module and is the only part that is edited in
   place. Do not add to it or change it on your own. If a lesson has become a
   lasting fact, say so in your report; add it there only when the user asks,
   as `### YYYY-MM-DD — short title` with **What happened**, **Why** and
   **Rule**.
7. **On wrap-up,** also append one dated line to `Session Notes` in each file
   that received an entry (none in a module with nothing to record), then
   tell the user which file received which entries.

Bad: "Promises can be tricky." / "Be careful with async."
Good: "`Promise.all()` on the ingest pipeline times out after 30 items — in
this module use `Promise.allSettled()` in batches of 10."
