---
name: engineering-insights
description: Reads and appends per-package engineering insights in INSIGHTS.md (server/, client/, reviewer-core/, e2e/). Use at the start of any task that touches a package — read its INSIGHTS.md before planning; the moment a non-obvious fact is verified (a fix that worked, a dead end, a library quirk, a recurring error); and at the end of a substantial task to append only new, significant insights. Triggers on "/engineering-insights", "wrap up", "what did we learn", "record this insight", "update insights", finishing a bug fix or feature.
allowed-tools: Bash(python3 .claude/skills/engineering-insights/scripts/append_insight.py *)
---

# engineering-insights

`<package>/INSIGHTS.md` is per-package memory: high-confidence guidance for the next agent,
and a draft under human review. **You only ever add to it.** Rubrics and examples: [reference/rubrics.md](reference/rubrics.md).

## 1. READ — every task, before planning or editing
1. From the user's request, decide which package(s) it touches (routing: rubrics.md › Package routing).
   Unclear yet → read the file as soon as the package is known, before the first edit there.
2. Read each `<package>/INSIGHTS.md` in full.
3. In one line, say which entries apply to this task, or `INSIGHTS: nothing relevant`. Then follow them.

## 2. CAPTURE — during work
When something passes the gate (step 3.2), keep a one-line draft of it. Fixes count only once confirmed working.

## 3. WRAP-UP — end of a substantial task (auto, or on `/engineering-insights`)
1. **Re-read** the target `INSIGHTS.md` — it may have changed since READ.
2. **Gate** each draft (all must hold, details in rubrics.md): non-obvious even after reading code/docs ·
   recurs · saves 5+ min · verified this session. Unverified → `Open Questions`.
3. **Dedupe.** Already in the file, even worded differently → drop it. Adds a genuinely new fact to an
   existing entry → write a new bullet that says what's new; never edit the old one.
   Contradicts an entry → append the new one with `⚠ conflicts with <date> entry`; a human resolves it.
4. **Append** each survivor with the script — never with Edit/Write on INSIGHTS.md:
   ```bash
   python3 .claude/skills/engineering-insights/scripts/append_insight.py add <package> "<Section>" "<where>: <fact> → <action>"
   ```
   It adds a dated bullet at the top of the section and refuses to change any existing line.
   Exit 3 = similar entry exists: re-check it; if it truly says something else, rephrase to the distinct fact and retry.
5. `Session Notes`: add one line only if you appended something else or made a lasting decision.
6. **Verify:** `python3 .claude/skills/engineering-insights/scripts/append_insight.py verify <package>` must print `OK`.
7. **Report:** the exact lines added (file › section), or `Insights: nothing new worth recording — <reason>`.
   Writing nothing is the normal outcome of an ordinary task.

## Never
- Rewrite, reorder, merge, reformat or delete existing entries — pruning is a human review, not this skill.
- Write the same fact into two packages' files.
- Record generic knowledge, one-off issues, or what README/CLAUDE.md already say.
- Keep appending when a section passes ~30 bullets: tell the user and propose a split (e.g. `INSIGHTS-db.md`).
