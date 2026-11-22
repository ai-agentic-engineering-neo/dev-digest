---
name: engineering-insights
description: Read and maintain the per-module INSIGHTS.md. At the START of any task (right after the user's prompt, before working) read the INSIGHTS.md of the module the task is about; at the END write down only significant, non-obvious findings that are not already there - dead ends, recurring errors and fixes, tool/OS quirks, undocumented conventions, open questions. Write nothing if nothing significant happened.
when_to_use: Start of every coding, debugging or investigation task (read step). During the task when you hit "that didn't work because", "turns out that", a workaround, a gotcha, the same error again. End of a task or session that changed or investigated code (write step). Do NOT write for trivial edits (typos, formatting) or facts already in code, README, CLAUDE.md or INSIGHTS.md.
---

# Engineering Insights

Two obligations, in this order: **read before working, write (only if significant) after.** Each module has an `INSIGHTS.md` with fixed sections; never free text.

## 0. Read first (mandatory, before any work)

Hooks in `.claude/settings.json` back this skill up (`.claude/hooks/`): `UserPromptSubmit` injects the relevant `INSIGHTS.md` files into context (a block starting `[engineering-insights]`), and `Stop` asks once per session, if there are code changes, for the wrap-up, and a `PreToolUse` guard keeps `INSIGHTS.md` append-only. If the files are already in your context via that block, do not re-read them - just do step 5. Hooks only guarantee the *prompt*; deciding what is significant and not a duplicate is still your job.

As soon as the user's request is clear - before the first edit or investigation step:

1. Decide which module(s) the request is about or will touch: `server/`, `client/`, `reviewer-core/`, `e2e/`, or cross-cutting (`scripts/`, Docker, CI, tooling, `vendor/shared`).
2. Read that module's `INSIGHTS.md`. Always also read the root `INSIGHTS.md` when the task is cross-cutting or touches more than one module.
3. Let it shape the work: avoid the recorded dead ends, reuse what worked, apply known fixes, respect open questions. Do not re-investigate what is already recorded.
4. If the module is unclear until you start working, read it the moment it becomes clear.
5. **Make the read visible with one line** to the user, e.g. `Прочитав server/INSIGHTS.md - враховую: <1-2 релевантні записи>` (or `нічого релевантного`). Do not dump the file. This lets the user verify that the read happened; a skipped read is the most common failure of such loops.

## 1. What counts as an insight (rubrics: event → section)

| What happened | Section |
|---|---|
| A non-obvious approach worked | `What Works` |
| An approach/hypothesis failed, dead end, antipattern | `What Doesn't Work` - **most valuable, never skip it** |
| Found a convention/architecture decision missing from code and docs | `Codebase Patterns` |
| Dependency, tool, version or OS quirk | `Tool & Library Notes` |
| Same error a second time, plus its fix | `Recurring Errors & Fixes` |
| Could not resolve or confirm something | `Open Questions` |
| Significant block of work finished | `Session Notes` (dated, only if significant) |

If an event fits two sections, pick the one a future reader would search first; never write it twice.

## 2. Significance bar (write only if ALL are true)

- **Significant:** it would have prevented a wrong change, a dead end, or roughly 10+ minutes of rediscovery.
- **New:** it is not already in `INSIGHTS.md`, `CLAUDE.md`, README or obvious from the code. (Verified in step 3 - an existing entry means do not write.)
- **Concrete:** you can state symptom, cause and action, with evidence.

Not significant: typos, formatting, routine edits, generic advice ("use async/await carefully"), anything restating existing docs, secrets, tokens, personal data, user-specific absolute paths. **If nothing passes the bar, write nothing and say nothing** - an empty outcome is correct and common.

## 3. Writing procedure (end of task/session, or the moment a significant finding is confirmed)

1. **Read the target `INSIGHTS.md` again** (it may have changed, and you must check for duplicates).
2. Search for the same or a near-identical finding. If it exists: do **not** add it as a new entry. Instead **comment on it** (see "Commenting on existing entries" below) - but only if your work gave it something new.
3. Route by module: nearest `INSIGHTS.md` to the files you changed or investigated; cross-cutting → root; cause in module A and symptom in B → write in A, add a one-line pointer in B.
4. Add the entry under the right heading, keeping headings exactly as in `references/insights-template.md`. **Never overwrite or remove existing text** (hard rule, enforced by `.claude/hooks/insights-guard.mjs`):
   - Use the **Edit** tool as a pure insertion: `new_string` must contain `old_string` unchanged, plus your addition. Anchor on the next section heading (to append at the end of a section) or on the last line of the entry you comment on.
   - A template placeholder line (`_..._`) may be replaced by the first real entry; nothing else may be altered.
   - Never use **Write** on an existing `INSIGHTS.md`, never `>`, `sed -i`, `rm`, `mv`, `Set-Content`. `>>` is allowed only to append at the very end of the file.
   - Do not "fix" typos, reformat, reorder, rename headings or update the "Остання ревізія" date in someone else's text. Corrections go in as dated `Update` lines (step 2).
   - If the guard blocks you, do **not** try another tool to get around it - tell the user. Only the user may allow a rewrite (consolidation) by creating `.claude/hooks/ALLOW_INSIGHTS_REWRITE`.
5. **Verify nothing was lost:** before editing, note the entry count (`grep -c '^- \*\*' <file>`); after editing, re-read the file and confirm the count grew only by what you added and that earlier entries are unchanged.
6. Tell the user in one line what was recorded and where (path + section).

If the file is missing or lacks the 7 sections, create/repair it from `references/insights-template.md`.

### Commenting on existing entries (the read → comment loop)

In automatic mode you first read the file (step 0), then work with it in mind, then **comment on the entries you actually relied on**, directly under that entry, as `Update YYYY-MM-DD: ...`. Comment only when your work did one of these:

- **Confirmed** it in a new context (other module, version, OS, or a case that could have disproved it) - say what was checked.
- **Narrowed or extended** it (a condition, a limit, a second cause, a better workaround).
- **Refuted or outdated** it (code changed, fix landed, workaround no longer needed) - say why; keep the original text, never delete or silently rewrite.
- **Resolved** an `Open Questions` item - add the answer; the human moves it during consolidation.

No comment if you merely read the entry and it changed nothing, or if you would only be repeating it. Same significance bar as for new entries; a comment is one short line plus evidence. Several comments in one pass are fine, but a pass that comments only to look busy is noise.

## 4. Entry format (atomic, readable "cold")

```
- **<short title>** · YYYY-MM-DD · confirmed|suspected
  Symptom → cause → what to do. Evidence: <file path / command / error text>.
  Update YYYY-MM-DD: <only when new evidence or a correction exists>
```

One finding per entry, 1-3 lines, exact API/condition/workaround. `Session Notes` use `### YYYY-MM-DD` headings and appear only for significant sessions. `Open Questions` carry a date and the next step. Write entries in Ukrainian; keep section headings, code and error text in English.

## 5. End-of-task pass

When a task that touched code ends: walk the 7 rubrics against the bar in step 2 and write **0-5** new entries, plus `Update` comments on the existing entries you relied on (see above). Zero of both is the normal result for routine work. If the `Stop` hook sends you back with a wrap-up reminder, do this pass; if nothing passes the bar, finish silently (the hook reminds only once per session, so you will not be blocked again).

## 6. Keep the file healthy

If `INSIGHTS.md` passes ~150 entries (a heuristic - sources range from ~80 to ~500 lines) or one section bloats, tell the user and suggest consolidation per `references/consolidation.md`. Do not prune on your own. The file is a draft the user reviews; git can roll back a bad write.

Deliberate deviation from common advice: some guides say "update the file every session, even if nothing new was found". Here the rule is the opposite - **no significant new finding means no write.**

## References

- `references/insights-template.md` - the empty 7-section skeleton
- `references/examples.md` - good vs bad entries from this repo
- `references/consolidation.md` - monthly cleanup ritual
- `references/sources.md` - what was read, what was taken or rejected, and why
