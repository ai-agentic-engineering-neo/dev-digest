---
name: engineering-insights
description: Captures non-obvious engineering insights from the current session and appends them to the INSIGHTS.md of each package where they were found (server, client, reviewer-core, e2e). Use at the end of every session or task that changed code in a package, before giving the final answer, or immediately after discovering something non-obvious (a surprising behavior, a dead end, a fix for a confusing error).
---

# Engineering insights

Turns what this session learned into notes the next session reads cold. Each package keeps its
own log — `server/INSIGHTS.md`, `client/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`,
`e2e/INSIGHTS.md` — because knowledge lives next to its code: a session in `client/` reads
client lessons, not everyone's. Repo Intel (`server/src/modules/repo-intel`) belongs to `server`.

Two hard rules:

- **Append-only.** Only insert new lines. Never edit, reorder or delete an existing line — not
  even to fix a typo or update an outdated entry. A correction is a *new* dated entry whose
  Insight starts with `Supersedes: "<old title>"`.
- **No duplicates.** One fact lives in one place. If it is already written down (in the target
  INSIGHTS.md or in that package's `AGENTS.md`), do not write it again.

## When to run

- **End of task** — before the final answer of any task that changed files in a package. Do
  not skip it; "nothing new" is a valid outcome, a skipped run is not.
- **Capture as you go** — right after a non-obvious discovery (an error whose cause wasn't what
  it looked like, an approach that failed for a reason worth remembering). Mid-task capture is
  more accurate than reconstructing at the end.
- Trivial sessions (typo, rename, pure Q&A with no surprises) usually produce nothing — say so
  and stop.

## Procedure

### 1. Find the target packages

```sh
node .claude/skills/engineering-insights/scripts/touched-packages.mjs
```

It lists the packages this session edited (from the transcript), marks files changed since the
last run of this skill, and adds `git status` changes (which may predate the session). An insight
found while only *reading* a package still belongs to that package.

### 2. Harvest candidates

Review the session for:

- errors you hit and what actually fixed them (quote the error text);
- approaches that failed, and why — dead ends are the most skipped and most valuable entries;
- behavior that contradicted the code, docs or your first guess;
- decisions made, with the reason (the code shows *what*, not *why*);
- tool / library / environment quirks;
- questions you could not resolve.

When the skill already ran this session, harvest only what came after that run.

### 3. Quality gate — keep only what passes all of these

- **Not obvious from the code.** "If it would be obvious to anyone reading the code — don't
  write it." No restating file layouts, dependency lists, API signatures or generic best practice.
- **Actionable cold.** An agent reading only this entry knows what to do, without chasing context.
- **Specific and evidenced.** Names the exact function / route / file, with `path:line` evidence.
- **Verified.** It was confirmed in this session (a test ran, an error reproduced, code was read).
  Guesses go to *Open Questions*, not to the other sections.
- **No secrets, no chat replay.** Extract the lesson; never paste keys, tokens or the conversation.

| ❌ Vague — noise, not a lesson | ✅ Useful — actionable cold |
|---|---|
| "Promises can be tricky" | "`Promise.all()` on the ingest pipeline times out after ~30 items — use `Promise.allSettled()` in batches of 10" |
| "Be careful with async" | "Checkout state always goes through Zustand (`cartStore.ts`) — the cart is shared by 3 components, local state breaks it" |
| "Fastify body validation is weird" | "A body-less POST reaches the Zod validator as `null`, so `Schema.default({})` fails — use `Schema.nullish().transform((b) => b ?? {})`" |

### 4. Deduplicate

For every candidate, before writing:

1. Read the **whole** target `INSIGHTS.md` and the *Gotchas* / *Do not touch* sections of that
   package's `AGENTS.md`.
2. Same fact already there (any wording, any section) → **skip it**.
3. Refines or contradicts an existing entry → write a **new** entry with
   `Supersedes: "<old title>"` and only the new information. Leave the old entry untouched.
4. Concerns several packages → the full entry goes only to the package that holds the evidence;
   each other affected package gets a one-line pointer entry:
   `### YYYY-MM-DD — <title>` + `See \`server/INSIGHTS.md\` → "<title>".`
5. Two candidates say the same thing → merge them into one entry.

Titles must be unique within a file (dates don't count) — make the title name the specific fact.

### 5. Pick the section

| Section | What goes there |
|---|---|
| What Works | An approach or solution that worked and is worth repeating |
| What Doesn't Work | A dead end or anti-pattern: what was tried and why it failed |
| Codebase Patterns | A convention or architectural decision the code doesn't explain, with its reason |
| Tool & Library Notes | A quirk of a dependency, tool, CLI or the environment |
| Recurring Errors & Fixes | An error message that comes back + its fix |
| Session Notes | One dated line per session that added entries (step 7) |
| Open Questions | Something unresolved — what is known, what isn't, where to look next |

### 6. Append the entry

Format (one entry = one heading):

```md
### YYYY-MM-DD — short specific title
**Context:** what you were doing · **Insight:** what turned out to be true ·
**Evidence:** `path/to/file.ts:42` · **Apply when:** trigger for reusing it
```

Insert it at the **end of its section** with the Edit tool: `old_string` = the heading of the
*next* section (e.g. `## Tool & Library Notes`), `new_string` = the entry, a blank line, then that
same heading. For *Open Questions* (the last section) append at the end of the file. Never use
Write on an INSIGHTS.md, never touch lines outside the insertion point.

### 7. Session note

In each package that received entries, append one line to *Session Notes*:

```md
- YYYY-MM-DD — <task in a few words>: <titles added, comma-separated>
```

### 8. Verify

```sh
node .claude/skills/engineering-insights/scripts/verify.mjs
```

It fails if a baseline line (git index, else HEAD) was changed or removed, a section is missing
or out of order, or two entries share a title. Fix the cause — never "fix" it by rewriting old
lines. A warning above ~200 entries means the file needs a human review; report it, don't prune.

### 9. Report

Tell the user, per package, which entries were added to which section (or "nothing new"), and
any warnings. Entries are a draft for a human spot-check — an LLM summary can be wrong. Do not
commit; the user reviews `git diff`.
