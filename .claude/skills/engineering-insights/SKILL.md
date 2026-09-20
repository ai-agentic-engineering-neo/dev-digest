---
name: engineering-insights
description: "Captures non-obvious things learned while working in this repo — gotchas, dead ends, decisions with rationale, and codebase/tool conventions — as dated entries appended to the touched package's INSIGHTS.md (server/, client/, reviewer-core/, or e2e/). Use proactively the moment something surprising or non-obvious surfaces mid-session (a fix that took real effort, a misleading first assumption, a library quirk), and again as a deliberate end-of-session pass — invoke explicitly via /engineering-insights, or let this description trigger it before wrapping up a substantive change. Not for routine or expected changes."
---

# Engineering Insights

Root `CLAUDE.md` already tells you to read each package's `INSIGHTS.md`
first. This skill is the write-back half: capture what you learned so the
next session (yours or a teammate's) doesn't relearn it the hard way.

## The anti-banality test

Before writing an entry, ask: **would this be useful to someone who wasn't
in this session, reading it cold?** If it only restates something obvious
from the code or from `CLAUDE.md`'s fixed map, don't write it.

- Bad: "Promises can be tricky in async code."
- Good: "`Promise.all()` over the repo-intel batch indexer times out past
  ~30 files — switch to `Promise.allSettled()` in batches of 10."
- Bad: "Zod validation is important for the API."
- Good: "`fastify-type-provider-zod` rejects `z.date()` request bodies
  silently as 400 with no body — always accept an ISO string and
  `z.coerce.date()` it server-side instead."

If you can't make the entry that concrete, it's not worth writing yet —
keep working, or fold it into a more concrete insight once you have one.

## The 4 categories

Tag every entry with exactly one, in the heading:

- **`[Pattern]`** — something that worked, worth repeating.
- **`[Mistake]`** — something that didn't work, a dead end, an antipattern.
  This is the most commonly *skipped* category and the most valuable — if
  you tried something, it failed, and you moved on, that is exactly what
  belongs here.
- **`[Decision]`** — a choice made among real alternatives, with the
  rationale (not just "we did X" but "we did X over Y because Z").
- **`[Context]`** — a codebase convention, tool/library gotcha, or
  architecture note that doesn't fit `CLAUDE.md`'s fixed map (too narrow,
  too situational, or still evolving).

## Entry format

Append to the **top** of the target package's `INSIGHTS.md`, directly below
the intro paragraph / template comment, above all existing entries (newest
first — do not reorder or restructure existing entries, do not create
per-category sections).

```
## YYYY-MM-DD — short title [Category]
What happened, what was tried, what actually worked or didn't, and why.
Cite the code: `path/to/file.ts:123`.
```

- One `##` heading per entry, one paragraph (a few sentences) underneath.
  Keep it tight — this is a log, not a doc.
- Date is the current session date, not when the underlying event
  originally happened.
- Title is a short, specific label (not "Bug fix" — "Drizzle migration
  hangs on concurrent index" or similar).
- **Cite a real `path/to/file.ext:LINE`** (or `:START-END` for a short
  range) for at least the primary code the entry is about — not just a bare
  file name or symbol mentioned in prose. Verify the line against the
  file's *current* contents right before writing (re-read/grep it) rather
  than reusing a number from earlier in the session — code shifts. Exception:
  a pure process/tooling gotcha with no single anchoring source line (a
  package-manager or CLI behavior, say) may name the closest relevant file
  with no line and say so explicitly — this should be rare, not the default.

## Which package's INSIGHTS.md

Match against the file paths touched this session and root `CLAUDE.md`'s
map (this is repo-wide, not per-package): `server/src/vendor/shared` and
`server/src/modules/repo-intel` are **inside `server/`**, not separate
targets — an insight about either goes to `server/INSIGHTS.md`. Otherwise:

- Touched only `server/**` → `server/INSIGHTS.md`
- Touched only `client/**` → `client/INSIGHTS.md`
- Touched only `reviewer-core/**` → `reviewer-core/INSIGHTS.md`
- Touched only `e2e/**` → `e2e/INSIGHTS.md`
- Touched multiple packages: **do not** default to writing everywhere. File
  the insight under whichever package it's actually about. Only write to
  more than one file if the insight is genuinely, independently true for
  each of those packages (e.g. "the same Fastify plugin registration
  gotcha bit both `server` modules" is one `server` entry; "the shared Zod
  contract changed and both `server` and `client` needed a workaround for
  it" may be two separate, package-specific entries — one per side of the
  workaround, not a copy-paste of the same text).
- There is no root-level `INSIGHTS.md` — don't create one.

## Discipline: append-only, dedup, soft cap

- **Append-only.** Never delete or rewrite another entry's content when
  adding a new one. If a new entry directly contradicts an old one (e.g. an
  approach previously logged as a `[Pattern]` turns out to be a
  `[Mistake]`), add a new entry that says so explicitly and references the
  old title — don't silently edit or remove the outdated one. Contradicting
  entries left unresolved are worse than no entry; always close the loop.
- **Dedup check.** Before writing, skim the existing entries in the target
  file (they're short — this is cheap) for the same gotcha already
  recorded. If found, skip writing, or add one line to the existing entry
  only if you have materially new information — don't create a near-duplicate.
- **Soft cap.** If the target file is approaching roughly 150–200 entries,
  say so to the user and suggest a pruning pass (merge duplicates, cut
  entries that have aged into obviousness) rather than writing #201
  unprompted.

## When to trigger (and the honest caveat)

Two moments, both matter:

1. **Proactively, mid-session** — the moment something surprising or
   non-obvious is found (a fix that took real back-and-forth, an assumption
   that turned out wrong, a library behaving unexpectedly). Don't wait
   until the end and try to reconstruct it from memory — write it down
   close to when it happened.
2. **Deliberately, end-of-session** — before wrapping up a substantive
   change, do a pass over what was learned. Invoke this explicitly by
   typing `/engineering-insights`, or let this skill's description trigger
   it on its own.

Caveat: nothing currently *forces* either of these to fire — this skill
relies on the model noticing and on the user remembering to invoke it. A
later iteration adds a session-end hook to make capture automatic; until
then, treat missed captures as expected and worth a manual nudge.

See `examples.md` for full worked entries across all four categories.
