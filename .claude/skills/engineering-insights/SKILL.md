---
name: engineering-insights
description: Record practical findings from a coding session into the INSIGHTS.md of the module worked in (server, client, reviewer-core, e2e). Two triggers — capture as you go, the moment something non-obvious happens (a surprising behaviour, hidden dependency, dead end, measured fact, fix with an unclear cause), and a wrap-up at the end of a substantive session (over ~30 min) that had a problem, decision or discovery. Skip trivial config edits. Also runs on manual /engineering-insights. Entries are append-only, filed under fixed sections, with a date and file:line evidence.
---

# Engineering Insights

Write down what the session taught you that the code and git history do not
already say. The next session in the same module reads that module's
`INSIGHTS.md` before debugging; a good entry saves it the same detour.

The file is named `INSIGHTS.md` in every package. Do not rename it.

## 0. When to write (double trigger)

1. **Capture as you go.** The moment something non-obvious happens — a failed
   approach, a surprising behaviour, a hidden dependency, a fix whose cause wasn't
   evident — append the entry right then. Don't wait for the end; by then you
   will have lost the detail.
2. **Wrap-up at the end.** After a substantive session (roughly over 30 minutes)
   in which there was a problem, a decision or a discovery, do one pass: add a
   Session Notes entry and any findings you haven't yet captured.
3. **Manual.** The user can invoke `/engineering-insights` at any time to force a
   wrap-up pass.

**Skip** the wrap-up for trivial work — a config tweak, a rename, a one-line fix
with no surprise. What matters is signal quality, not volume: a session with
nothing to teach produces no entry.

Auto-triggering from this description is unreliable, so it's a best effort. If you
notice a session is ending without a wrap-up, do it before your final message.

## 1. Pick the file

Knowledge lives next to the code it describes, so the next session in a module
reads that module's lessons, not another's. Write to the `INSIGHTS.md` of the
package the finding is **about**:

| Finding concerns | File |
|---|---|
| `server/` (API, DB, jobs, SSE, git/GitHub) | `server/INSIGHTS.md` |
| `client/` (Next.js UI) | `client/INSIGHTS.md` |
| `reviewer-core/` (diff → prompt → LLM → findings) | `reviewer-core/INSIGHTS.md` |
| `e2e/` (browser flows) | `e2e/INSIGHTS.md` |

Each package has its own file. A task spanning packages may produce entries in
several files; a cross-package wiring finding (path aliases, the two
`@devdigest/shared` copies) goes in the package where it bites. Never create a
root-level `INSIGHTS.md`.

## 2. The cold-read test (main quality rule)

An entry must be **actionable cold**: a later agent reads it and knows what to do,
with no follow-up questions.

- Name the concrete thing (function, file, flag, number), the consequence, and the
  action to take instead.
- **Skip test:** if it would be obvious to anyone reading the code, don't write it.

| Bad (noise, not a lesson) | Good (actionable cold) |
|---|---|
| "Promises can be tricky" | "`Promise.all()` over the ingest pipeline times out after 30 items — use `Promise.allSettled()` in batches of 10 here." |
| "be careful with async" | "Checkout state goes through the Zustand `cartStore.ts`, because 3 components share the cart; local state doesn't work here." |

The good form states **what to do, where, and why** (the cause or the measured
limit). If you can't say what the reader should do differently, don't write it.

## 3. Fixed sections

`INSIGHTS.md` is not free text. Every file has exactly these sections, in this
order; file each entry under the one that fits:

1. **What Works** — approaches and solutions that worked.
2. **What Doesn't Work** — dead ends and anti-patterns, with the reason. This is
   the most valuable section and the one most often skipped: when you tried
   something that failed, record it here.
3. **Codebase Patterns** — conventions and architectural decisions in this module.
4. **Tool & Library Notes** — quirks of dependencies and tooling.
5. **Recurring Errors & Fixes** — errors seen more than once, plus the fix.
6. **Session Notes** — dated summary of a session (a few lines, not a diary).
7. **Open Questions** — what remains unresolved.

If a section is missing from the file, add it (empty headings are fine) in the
order above. Don't invent other sections.

## 4. Entry format

Append the entry at the end of its section:

```markdown
### YYYY-MM-DD · <short finding title>
- **Finding:** <what is true, why it's non-obvious, and what to do instead>
- **Evidence:** `path/to/file.ts:42` (add more, or a command + observed output for measurements)
- **Status:** verified | unverified
```

- **Date** is today's absolute date from the environment, never relative.
- **Evidence is mandatory.** `file:line` for code; for a measured fact, the command
  and the number. Name the symbol too (`parseDiff()` at `reviewer-core/src/diff.ts:88`)
  because line numbers rot. No evidence → don't write the entry.
- **Status** is `verified` only if you reproduced it or a test/typecheck proves it
  this session; otherwise `unverified`.
- Never put secrets, tokens or key values in an entry.

## 5. Append-only

Only add entries; never overwrite, reword or delete existing ones.

- If an earlier entry is now wrong or stale, append a new entry saying so
  (`Finding: supersedes <date · title> — <what changed and why>`), and file the
  correction under the same section.
- If an earlier entry is confirmed *with new evidence* (a different file:line, a
  new measurement, a changed Status), append a short entry with that evidence
  rather than editing its Status. Re-confirming with nothing new is not worth an entry.

### Check for duplicates before every write

Before appending **any** entry (including mid-session captures and wrap-up):

1. Read the target `INSIGHTS.md` in full — every section, not only the one you
   plan to write to.
2. Compare by meaning, not wording: is the same cause, rule or limit already
   documented, in any section, under any title?
3. If it is, **do not add it.** Write nothing, or only the new-evidence or
   superseding entry described above if you truly have something new.
4. If it's only partly covered, append just the missing part and refer to the
   earlier entry (`see <date · title>`) instead of restating it.
5. Re-check right before writing if you read the file earlier in a long session,
   since other work may have added entries since.

Skipping a duplicate is the correct outcome; say so in your final message
("already documented in `server/INSIGHTS.md`") rather than re-adding it.

## 6. When to write nothing

If the session taught nothing that passes the cold-read test, write nothing. Don't
restate the diff, `CLAUDE.md`, or docs; don't log task progress or style
preferences. Appending (not rewriting) also keeps entries from different people
or sessions from causing merge conflicts or erasing earlier lessons.

## 7. Wrap-up

Name the `INSIGHTS.md` files you touched in one line of your final message.
