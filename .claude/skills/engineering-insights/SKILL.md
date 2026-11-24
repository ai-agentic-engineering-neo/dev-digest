---
name: engineering-insights
description: Captures non-obvious engineering insights (patterns, mistakes, decisions, context) by appending them to the INSIGHTS.md of the module being worked on. Use at the end of a task, and whenever a non-obvious discovery, dead end, surprising library behaviour, or design decision with a reason appears during a session.
---

# engineering-insights

Append-only memory for the next session in the same module. Goal: the next agent reads the entry and knows what to do, with no follow-up questions.

1. **When.** Capture as you go (right after a non-obvious discovery, dead end, or decision), and wrap up before the final answer: scan the session for anything missed. Check `Mistake` first; it is the rubric most often skipped and the most valuable. Skip trivial edits (typo, rename, formatting).
2. **Filter.** If it would be obvious to anyone reading the code, do not write it. `grep` the target file first; do not duplicate an entry, and do not restate what CLAUDE.md or README already say.
3. **Where.** Route by the files the task touched:
   - `server/**` → `server/INSIGHTS.md` · `client/**` → `client/INSIGHTS.md` · `reviewer-core/**` → `reviewer-core/INSIGHTS.md` · `e2e/**` → `e2e/INSIGHTS.md`
   - a submodule with its own `INSIGHTS.md` (e.g. `repo-intel`) → that file
   - several packages, or `@devdigest/shared` drift → root `INSIGHTS.md`
4. **Format.** Append to the end of the file. Never edit or delete existing entries; to fix a wrong one, add a new dated entry with `Corrects: <date — title>`.
   ```
   ## YYYY-MM-DD — [Pattern|Mistake|Decision|Context] short title
   1–3 sentences: what to do / not do, and WHY.
   Evidence: path/to/file.ts:42
   ```
   - `Pattern`: a non-obvious approach that worked · `Mistake`: dead end, antipattern, recurring error + fix · `Decision`: choice + reason + rejected alternative · `Context`: quirk, constraint, "why it is this way".
5. **Concrete, not vague.**
   - ❌ "tests can be flaky" → ✅ "A test importing `test/helpers/pg.ts` must be named `*.it.test.ts`, otherwise CI runs it in the unit job. Evidence: `server/CLAUDE.md`".
   - ❌ "watch the review strategy" → ✅ "Default strategy is `single-pass` despite older map-reduce comments. Evidence: `server/src/modules/reviews/constants.ts`".
6. **Never.** No secrets, keys, tokens, or personal data in entries. Do not edit CLAUDE.md yourself; if an entry is something Claude would err without, suggest promoting it to that package's CLAUDE.md "Gotchas" and let the user decide. If a file passes ~50 entries, suggest a prune instead of pruning.
7. **Report.** End with one line per entry: file + title. If nothing qualified, say so and write nothing.

Entries are drafts for human spot-check; the user reviews them in `git diff`.
