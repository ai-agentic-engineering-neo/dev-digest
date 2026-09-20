---
name: engineering-insights
description: Use when starting any task in server, client, reviewer-core or e2e, and when finishing one that produced a non-obvious finding.
---

# Engineering Insights

1. Before your first action, read the `INSIGHTS.md` of every module the prompt concerns; treat entries as high-confidence guidance. If a file has entries, summarize the top 3 relevant ones, one line each. If it has none, say nothing about it.
2. Capture as you go: when the user confirms a fix, or you hit a dead end or decision worth keeping, note it. Before your final reply, record findings that pass Record only if. If nothing is new, add nothing.
3. Re-read the module's `INSIGHTS.md` before writing. Skip a fact already there; if you have newer facts, append a new dated line that supersedes the old one. If a new fact contradicts an entry, append a line whose end, after `Applies to`, reads `REVIEW NEEDED: contradicts <date> entry`; omit it if the user has you delete the old line this session.
4. Append one line at the end of the matching section, in each module the finding applies to and no other. A finding that spans modules goes in each of them; one that fits no module goes in no file, so tell the user instead.
5. Never rewrite, reorder, reword or remove existing lines or sections. Cleanup happens only when the user explicitly asks; then follow [MAINTENANCE.md](MAINTENANCE.md).
6. Entries are drafts: tell the user what you added so they can spot-check.

## Sections
| Section | Holds |
|---|---|
| What Works | An approach that worked; reuse it. |
| What Doesn't Work | A dead end or anti-pattern, and what to do instead (the most valuable). |
| Codebase Patterns | A convention, behavior or architectural decision, with its reason. |
| Tool & Library Notes | A dependency, tool or environment quirk. |
| Recurring Errors & Fixes | An exact error message and its fix. |
| Session Notes | One dated line per file that gained entries; exempt from Record only if; no `Applies to`. |
| Open Questions | An unresolved item; no proof needed, and `Applies to` names the area when no file fits. |

## Record only if
All of: **specific** (names a file, symbol, command or limit), **proven** (cites `file:line`, or the exact command or file when no single line fits), **reusable**, **actionable** (changes what an agent does), and not already in the code, README or official docs.
Obviousness test: if anyone reading the code would already know it, do not write it. Skip generic programming knowledge, one-off issues and trivial fixes.

## Entry format
`- YYYY-MM-DD Fact, the action to take, and why. Applies to path/file.ext:LINE.` Paths are relative to the module root.

Illustration only (not a real file):
- Bad: "Be careful with async."
- Good (What Doesn't Work): "- 2000-01-01 `Promise.all()` in the ingest pipeline times out past 30 items; use `Promise.allSettled()` in batches of 10. Applies to `src/modules/indexer/ingest.ts:88`."
