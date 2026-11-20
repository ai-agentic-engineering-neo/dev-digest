---
name: engineering-insights
description: INSIGHTS.md (root + per-module lessons files). Use at the start of every task (read root INSIGHTS.md and the touched modules' files first); when you hit a dead end, a library quirk, a recurring error or a non-obvious convention (capture it); and before the final reply of a task that changed or investigated code (wrap-up).
---

# Engineering Insights

Lessons live in two tiers, like `CLAUDE.md`: root `INSIGHTS.md` for cross-module lessons, `<module>/INSIGHTS.md` for `server/`, `client/`, `reviewer-core/`, `e2e/`. Read them before work, record only what a cold reader of the code would not know.

## Scope

Every insight lives in exactly one file.

- **Root `INSIGHTS.md`** — acting on it involves 2+ modules, or repo-level tooling: `scripts/`, `docker-compose.yml`, `.github/`, package-manager versions, `.env` relationships between modules.
- **`<module>/INSIGHTS.md`** — it applies inside that module alone.

A module entry never restates or links a root entry: the root file is always read. When a module entry turns out to apply to a second module, **move** it to root and delete it from the module file.

## Steps

### 1. Resolve modules

Map every path the prompt names or the task will touch to its module. Root, `scripts/` or `.github/` work → the modules whose code it affects, if any.
Done when you have the list: root `INSIGHTS.md` plus each resolved `<module>/INSIGHTS.md`.

### 2. Read

For each file: if it is missing, create it from [Template](references/TEMPLATE.md) with `<module>` substituted (`cross-module` for root). Then read the whole file before your first plan or edit — root first.
Treat entries as high-confidence guidance. When an entry contradicts the code, the code wins: note the entry for correction in wrap-up.
Done when every resolved file has been read end to end.

### 3. Capture during work

Keep a running list of candidates whenever a section trigger below fires. Record the evidence at the moment you see it (`file:line`, the command, the exact error text) — it is gone by wrap-up.

### 4. Wrap-up — before the final reply

1. Re-read each file; it may have changed during the session.
2. Pass every candidate through the gate. It must pass all six:
   - **Not obvious** — someone reading the code would not see it. If it would be obvious to anyone reading the code, drop it.
   - **Cold-actionable** — an agent reading only this entry knows what to do, without follow-up digging.
   - **Evidenced** — cites `file:line`, a command, or an error text.
   - **New** — no entry in *any* insights file already says it: `grep -n '<key term>' INSIGHTS.md */INSIGHTS.md`. When a similar entry exists, extend or correct it in place; when it sits in the wrong file per Scope, move it.
   - **Not already documented** — absent from the module's `CLAUDE.md`, `docs/`, or root `CLAUDE.md`.
   - **Placed** — target file chosen by Scope.
3. Apply corrections: rewrite or delete entries the session proved wrong; move answered Open Questions into their proper section.
4. Write the survivors into their sections. In each file that gained or changed an entry, add one Session Notes line.
5. End the final reply with one line per file: `INSIGHTS <root|module>: <what was added/changed/moved>` or `INSIGHTS <root|module>: nothing new`.

Done when every candidate is written, merged, or consciously dropped, and the reply carries the INSIGHTS line.

## Sections

| Section | Belongs here | Trigger |
|---|---|---|
| What Works | An approach that solved a non-trivial problem here, and the context it worked in | A fix or design landed after a less obvious path |
| What Doesn't Work | A dead end, with why it failed — the most valuable section, and the one most often skipped | You reverted, abandoned, or rewrote an approach |
| Codebase Patterns | An unwritten convention or architectural decision, with its reason | You matched existing code and the "why" was not written down |
| Tool & Library Notes | A dependency quirk, version-specific behaviour, CLI gotcha | A library or tool behaved differently from its docs or your expectation |
| Recurring Errors & Fixes | Exact error text → cause → fix | Same error seen twice, or an error whose cause was far from its message |
| Session Notes | `- YYYY-MM-DD — <what was done> → <entries produced>` | Only alongside another entry |
| Open Questions | An unverified hypothesis or unresolved oddity | You suspect something but could not confirm it |

## Entry format

```
- **<imperative rule>** — <why / context>. Evidence: <file:line | command | error text>. (YYYY-MM-DD)
```

One bullet per insight. Lead with the rule so the entry is findable by grep.

## Quality bar

The test: an agent reads it cold and *knows what to do*.

| Bad (noise) | Good (actionable) |
|---|---|
| "Promises can be tricky" | "**Use `Promise.allSettled()` in batches of 10 for the ingest pipeline** — `Promise.all()` times out past 30 items." |
| "Careful with async" | "**Keep checkout state in the Zustand store (`cartStore.ts`)** — three components share the cart; local state desyncs them." |

Gate example: "`instanceof ZodError` fails across duplicate zod instances, match by shape (`server/src/app.ts:149`)" is a good insight, and it fails **Not already documented** — `server/CLAUDE.md` Gotchas already carries it. Drop it.

## Hygiene

- Hypotheses live in Open Questions until verified; What Works holds only confirmed results.
- Entries hold no secrets, tokens, or customer data.
- When a file passes ~150 lines: merge duplicates, delete entries for removed code, and promote stable, frequently relevant entries to the matching `CLAUDE.md` Gotchas — root entries to root `CLAUDE.md`, module entries to the module's (replace the entry with a one-line link to its new home).
- After a dependency upgrade touching a Tool & Library Note, re-verify that note.
