---
name: engineering-insights
description: "Captures non-obvious engineering discoveries — gotchas, decisions with their reasoning, recurring errors and fixes, dead ends, codebase/tool quirks — made while working in this repo, and appends them to the touched module's insights.md (client, server, reviewer-core, or e2e). Use at the end of any session that involved real debugging, a design decision, or a surprising discovery, and proactively the moment such a discovery happens mid-session, before it's forgotten. Do not use for routine, self-evident, or purely mechanical changes."
---

# Engineering Insights

A capture-as-you-go + end-of-session loop that turns things learned during a
task into a durable, per-module log (`insights.md`) instead of letting them
evaporate when the session ends. This is DevDigest's local implementation of
the "Learnings.md" pattern: a file the previous session leaves notes in for
the next one to read.

Read `client/CLAUDE.md`, `server/CLAUDE.md`, `reviewer-core/CLAUDE.md`, and
`e2e/CLAUDE.md` for context — each already points to its module's
`insights.md` as required reading before deep-diving. This skill is the write
side of that loop.

## When to run this

- **End of session**, if the session involved a non-trivial bug fix, a
  debugging session with a non-obvious root cause, an architectural or
  design decision, or any discovery that contradicted an initial assumption.
- **Mid-session, immediately**, the moment something genuinely surprising is
  discovered — don't wait for session end and risk losing it to context
  compaction.
- **Skip it** for mechanical changes (renames, formatting, dependency bumps
  with no surprises), or anything a competent reader would infer just from
  reading the resulting code. If it isn't worth a teammate's time to read,
  it isn't worth writing.

## Step 1 — find the target file(s)

One `insights.md` per module, append-only:

| Touched | File |
|---|---|
| `client/**` | `client/insights.md` |
| `server/**` | `server/insights.md` |
| `reviewer-core/**` | `reviewer-core/insights.md` |
| `e2e/**` | `e2e/insights.md` |
| repo-wide (root config, `scripts/`, CI, docker-compose) | no dedicated file — if it's truly cross-cutting and worth keeping, propose a root `CLAUDE.md` edit instead; don't invent a root `insights.md` |

Use the files actually touched or investigated this session to decide which
module(s) apply. A session can write to more than one file if it genuinely
crossed module boundaries — don't force everything into one file to save a
step.

## Step 2 — filter: the "vague vs useful" test

Before writing anything, apply this test: **if it's obvious to anyone who
reads the code, don't write it.** An entry earns its place only if it saves a
future session from re-discovering something the hard way.

| Vague (reject) | Useful (keep) |
|---|---|
| "Promises can be tricky here." | "`Promise.all()` in the ingest pipeline times out after ~30 items — switch to `Promise.allSettled()` in batches of 10 (`server/src/modules/pulls/ingest.ts:88`)." |
| "Be careful with async state." | "Checkout-flow state always goes through the `cartStore` Zustand store, never component state — three unrelated components read it (`client/src/app/.../cartStore.ts`)." |
| "The auth code is confusing." | "Auth middleware must be registered via `router.use(auth)` *before* any route it protects — placing it after silently no-ops (`server/src/modules/auth/plugin.ts:22`)." |

Every kept entry needs a concrete anchor: a file path (with a line number
when it points at specific code), a command, an error string, or a decision
and the reason behind it. No anchor, no entry — either find one or drop it.

Also check the entry doesn't already live in the module's `CLAUDE.md` or
`README.md`. If it's durable, load-bearing knowledge (not a one-off gotcha),
say so and propose a `CLAUDE.md` edit instead of, or in addition to, the log
entry — `insights.md` is for things too situational or unproven to promote
yet.

## Step 3 — categorize and write

Each `insights.md` is organized into fixed sections. If a target file
doesn't have them yet (the starter files ship with just the intro
paragraph), add the section scaffold below before appending — don't
reflow or delete the existing intro, just extend it.

```markdown
# Insights — <module>

Non-obvious things learned while working in this module — discovered gotchas,
dead ends, decisions and the reasoning behind them, "why is it done this way"
answers. Captured by the `engineering-insights` skill. Append-only: never
rewrite or delete a past entry — a correction is a new dated entry that
references the old one. Check this file before deep-diving in this module.

## What Works

## What Doesn't Work

## Decisions

## Recurring Errors & Fixes

## Codebase Patterns & Tool Notes

## Open Questions

## Session Notes
```

Section guide — pick the single best fit, don't duplicate an entry across sections:

- **What Works** — an approach, pattern, or workaround that worked and is worth reusing.
- **What Doesn't Work** — something tried and abandoned, and why, so it isn't retried.
- **Decisions** — a design/architecture choice made this session, with the reasoning and the alternative that was passed over.
- **Recurring Errors & Fixes** — a specific error message or symptom paired with its fix; write it so a future session can pattern-match on the error text.
- **Codebase Patterns & Tool Notes** — a structural fact about how this codebase, a library, or a tool actually behaves here (vs. how it's documented to behave).
- **Open Questions** — something surfaced but not resolved this session; a flag for whoever picks it up next.
- **Session Notes** — a short dated narrative for a substantial session that doesn't reduce cleanly to the categories above (e.g. "spent an hour on X, root cause was Y, see Decisions for the fix"). Use sparingly — most sessions should produce zero or one of these plus a couple of categorized entries, not a wall of prose.

Entry format — one line where possible, dated, with the anchor inline:

```markdown
- **2026-09-15** — <the actual claim, specific and actionable> (`path/to/file.ts:42`).
```

## Step 4 — hygiene

- Append only. If something recorded earlier turns out wrong or stale, add a
  new dated entry that says so and references the old one — don't edit or
  delete history.
- If a section is growing long (rule of thumb: ~40+ entries, or the file is
  clearly harder to scan than it used to be), say so to the user instead of
  silently pruning — a monthly human review should consolidate or retire
  stale entries, this skill never deletes on its own.
- After writing, tell the user in one or two lines what was captured and
  where (`module/insights.md`, which section) — this runs proactively, so
  stay visible about it rather than editing silently.
