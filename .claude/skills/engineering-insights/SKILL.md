---
name: engineering-insights
description: Captures non-obvious engineering insights (user corrections, dead ends, non-obvious root causes, decisions with their reason, tool quirks) into the INSIGHTS.md of the package being worked on (client, server, reviewer-core, e2e, mcp). Use proactively the moment such a signal is confirmed during any task, and always as a wrap-up at the end of every task — writes only new, substantive insights, otherwise leaves the file untouched. Also use on /engineering-insights, "/engineering-insights review", or phrases like "wrap up", "what did we learn", "record this insight", "запиши інсайт", "підсумуй сесію".
---

# Engineering insights

Goal: the next session in this package must not repeat today's mistakes. Write for a reader arriving
cold — after reading one entry they know exactly what to do or avoid.
Modes: **capture** (default, below) · **review** (`/engineering-insights review`, see the last section).

## When to run

1. **Capture as you go** — right after one of these signals is *confirmed* (priority order):
   1. The user corrected you (wrong assumption, wrong approach, "no, here we do X").
   2. You abandoned an approach because it didn't work.
   3. A bug's root cause was non-obvious (cost time, misleading error, hidden coupling).
   4. You had to work around a tool / library / environment quirk.
   5. The same problem or question came up a second time.
2. **Wrap-up — MANDATORY at the end of every task.** Running it is required; writing is not.
   Re-scan the session for the signals above that weren't captured yet. Nothing new → **do not touch
   the file at all** (no Session Notes line, no rewording) and tell the user "no new insights".

## What NOT to record

Write an entry only if it passes both tests: (a) not obvious to anyone reading the code, and
(b) it would change what the next session does or save it 5+ minutes. Never record:
- a replay of the chat or of steps taken — record the conclusion, not the process;
- general best practices (true in any project) — noise;
- one-off situations that won't recur;
- anything already in that package's `README.md`, `docs/`, `CLAUDE.md`, or root `CLAUDE.md`;
- personal preferences of the user — those go to the user's own memory, not a shared file;
- hypotheses: unconfirmed → **Open Questions** only, never into the other sections.

## Where to write

`<pkg>/INSIGHTS.md` of the package whose files the insight is about:
`client/`, `server/` (includes `server/src/modules/repo-intel`), `reviewer-core/`, `e2e/`, `mcp/`.
Touched several packages → one entry in each, worded for that package. Root-only change (scripts,
docker) → the package whose behavior it affects; if none, report it instead of writing.
File missing → create it from [TEMPLATE.md](TEMPLATE.md).

## Sections (pick exactly one per entry)

| Section | What goes there |
|---|---|
| What Works | Approaches that proved effective here |
| What Doesn't Work | Dead ends and antipatterns — **most valuable, most often skipped** |
| Codebase Patterns | Conventions, architecture decisions **with the reason** |
| Tool & Library Notes | Dependency / tooling quirks (Drizzle, Next, Fastify, pnpm, …) |
| Recurring Errors & Fixes | Error message or symptom → root cause → fix |
| Session Notes | Wrap-up only, and only if this session added entries in other sections: one dated line summarizing the task |
| Open Questions | Unresolved items, unconfirmed hypotheses, known gaps to fix later |

## Entry format

`- YYYY-MM-DD — <what is true / what happened> → <what to do instead> (path/to/file.ts:LINE → symbolName)`

One line, concrete names (files, functions, commands, numbers). Point to code by **package-relative
`file:line` AND the function / symbol**: `file:line` lets the next developer jump straight there
(clickable in the IDE); the symbol is the fallback once the line drifts after a refactor. Take the line
from the current code (grep -n) right before writing — never guess it. Line refers to the symbol's
declaration (or the exact statement the insight is about). No single code location (tooling/env
insight) → name the command or config file instead.

- ❌ `Promises can be tricky` · ❌ `be careful with async` · ❌ `(src/ingest/run.ts)` — no line, no symbol
- ✅ `Promise.all() on the ingest pipeline times out after ~30 items → use Promise.allSettled() in batches of 10 (src/ingest/run.ts:48 → runIngest)`
- ✅ `checkout state always goes through Zustand (src/store/cartStore.ts:12 → useCartStore) — 3 components share the cart; local state breaks it`

## Procedure (capture)

Copy this checklist into your reply and tick it off:

```
- [ ] 1. Gate — any confirmed signal not captured yet? No → stop, file untouched
- [ ] 2. Re-read the whole target INSIGHTS.md
- [ ] 3. Draft ≤5 candidates, ranked by signal
- [ ] 4. Dedup + contradictions
- [ ] 5. Append survivors (append-only)
- [ ] 6. Report: written / skipped
```

1. **Gate.** Apply both tests from "What NOT to record". Nothing passes → stop, touch nothing.
2. **Re-read the whole target `INSIGHTS.md` right before writing** — even if it was read at session
   start (it may have changed since). Never write from memory of the file.
3. **Draft at most 5 candidates per run**, ranked by the signal order in "When to run" (user
   corrections highest). Each candidate = exact line + target section + `path:line → symbol`. More than 5
   → keep the top 5, the rest go to the report as skipped.
4. **Dedup.** Compare by meaning, not wording, across all sections — and against the docs listed in
   "What NOT to record". Already covered → drop it. **Contradicts an existing entry?** Never edit or
   delete the old line; the candidate becomes `CORRECTION of <date> entry: …` saying which is right and why.
5. **Append** the survivors at the end of their sections, no approval prompt. Never rewrite or reorder
   other lines. Nothing survived → write nothing.
6. **Report** to the user: file + section + exact lines written, then each **skipped** candidate with
   its reason (duplicate / obvious / one-off / over the limit / unconfirmed) — so the user can say
   "record that one anyway". Or "no new insights". Entries are a draft for human spot-check.
   File now has more than ~100 entries → suggest review mode (don't prune on your own).

## Non-destructive write contract (hard rule, both modes)

- **Insert with an anchored `Edit`** — anchor on the target `## Section` heading (plus its last entry)
  and add the new line after it. **Never use `Write` on an existing `INSIGHTS.md` /
  `INSIGHTS-archive.md`** — it replaces the whole file and silently destroys prior content.
  `Write` is allowed only to create a missing file from [TEMPLATE.md](TEMPLATE.md).
- **Preserve verbatim** the `# <pkg> — insights` header, the preamble, every `##` heading and its
  `<!-- -->` hint, and every existing entry. Never reformat, reorder, or "tidy up" the file.
- An `Edit` fails or the anchor isn't found → re-read the file and retry; never fall back to `Write`.

## Review mode (`/engineering-insights review [pkg]`)

Cadence: suggest it about once a month, or when a file passes ~100 entries.
The only mode allowed to change existing lines — and only after the user approves. No pkg → all four.
1. Read the file(s) and the package docs. Find: duplicates, contradictions (incl. CORRECTION pairs to
   collapse), vague entries, stale ones (code/symbol/library version no longer exists — verify with
   search), hypotheses in Open Questions that are now confirmed or refuted.
2. Show a table: entry → problem → proposed action (merge / rewrite / move section /
   archive / mark `[REVIEW NEEDED]`). Change nothing yet.
3. Apply only the actions the user approved. Never delete: removed entries move to
   `<pkg>/INSIGHTS-archive.md` with the date archived and the reason.
4. Report what changed.
