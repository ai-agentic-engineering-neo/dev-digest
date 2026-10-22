---
name: engineering-insights
description: Read and record module-scoped engineering insights in INSIGHTS.md. Use at the START of every task, after the user's first prompt, to read the INSIGHTS.md of the module(s) the request concerns — and at the END of every session to append anything substantial and new that was learned (a dead end, a convention, a library quirk, a recurring error and its fix, an open question).
---

# Engineering insights

Module → file (deepest match wins): `server/src/modules/repo-intel/`, `client/`, `server/`, `reviewer-core/`, `e2e/` → that folder's `INSIGHTS.md`; cross-package or unclear → root `INSIGHTS.md`.

**Start (mandatory, before any other work):** once the user's request is known, read the `INSIGHTS.md` of every module it concerns, and follow it as high-confidence guidance.

**End of session (mandatory check):**
1. Re-read the target `INSIGHTS.md` first. If the lesson is already there, or nothing substantial and new was learned, write nothing (not even Session Notes) and say "No new insights."
2. Otherwise append one atomic bullet per lesson under one section — What Works · What Doesn't Work · Codebase Patterns · Tool & Library Notes · Recurring Errors & Fixes · Session Notes · Open Questions — as `- **YYYY-MM-DD · Short title** — what to do/avoid, where (file/symbol), why.`
3. Substantial = a fresh agent would act differently after reading it cold. Not: obvious from the code, a general best practice ("be careful with async"), a one-off, or already in CLAUDE.md/README/docs. What Doesn't Work names the wrong approach AND the right one.
4. Append-only: never edit, reword, re-wrap, reorder or delete existing entries or headings; correct a stale one with a new "Supersedes <date · title>: …" entry. At ~100+ entries, tell the user the file needs consolidation.
5. How to write safely — never use Write (it replaces the whole file):
   - snapshot first: `cp <file> "$TMPDIR/insights.before"`
   - insert with Edit: `old_string` = the next `## ` heading, `new_string` = your bullet + blank line + that same heading. For Open Questions (last section) append at end of file: `printf '%s\n' '- **…**' >> <file>`.
   - verify: `diff "$TMPDIR/insights.before" <file> | grep '^<'` must print nothing (only added lines). If it prints anything, restore with `cp "$TMPDIR/insights.before" <file>` and retry.
6. End with one line: which file(s) and section(s) you appended to.
