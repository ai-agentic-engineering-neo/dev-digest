---
name: engineering-insights
description: Read and update the per-module INSIGHTS.md logs (server/, client/, reviewer-core/, e2e/). Use before starting any task in one of these modules or when debugging something non-obvious there — read that module's INSIGHTS.md first. Use again whenever a non-obvious gotcha, debugging dead end, library quirk, or design rationale is discovered, and at the end of a substantial session, to append dated entries under the right section without duplicating existing ones. Invoke manually as /engineering-insights to review or record insights. Not for content that belongs in a README, docs/, or specs/ file.
---

# Engineering Insights

Four `INSIGHTS.md` files — one per module — capture non-obvious knowledge:
gotchas hit in practice, dead ends, "why it's built this way". This skill says
when to read them and how to add entries. See `examples.md` for ❌/✅ pairs.

## Module map

| Work touches | INSIGHTS.md |
|---|---|
| Fastify API, Drizzle, repo-intel (`server/src/modules/repo-intel`) | `server/INSIGHTS.md` |
| Next.js studio UI | `client/INSIGHTS.md` |
| Review engine (prompt assembly, grounding, structured output) | `reviewer-core/INSIGHTS.md` |
| Browser flows, hermetic runner | `e2e/INSIGHTS.md` |

- repo-intel is part of server/ — its insights go to `server/INSIGHTS.md`.
- Work outside the four modules (repo root, `scripts/`, `docs/`) has no
  INSIGHTS.md — don't create one.

## Before working in a module — read

Before starting a task that touches a module, open that module's `INSIGHTS.md`
and skim the entries relevant to the task. Multi-module task → read each
touched module's file. All sections still `- _none yet_` → nothing to learn
yet; proceed.

## Capturing insights — write

Two triggers:

1. **As you go** — the moment something non-obvious is confirmed: a fix works,
   a dead end cost real time, a tool quirk surfaced. Don't wait for session end.
2. **Wrap-up** — at the end of a substantial session (>30 min with a problem
   solved, a decision made, or a discovery). Trivial sessions (config tweaks,
   typo fixes, mechanical edits) → skip.

## Entry format

```
- YYYY-MM-DD — <one actionable sentence>. (<file>:<line> or dir/PR ref)
```

Place at the top of the chosen section, directly under its
`<!-- newest on top -->` marker. A section's first entry replaces its
`- _none yet_` (that's not pruning). Date = today.

## Sections

| Section | What goes here |
|---|---|
| What Works | Confirmed approaches that paid off and are worth repeating |
| What Doesn't Work | Dead ends and approaches that failed — and why |
| Codebase Patterns | Non-obvious project structure or convention rationale |
| Tool & Library Notes | Version-specific quirks of tools this repo uses |
| Recurring Errors & Fixes | Error → actual fix, when the message misleads |
| Session Notes | Decisions/context that fits no section above — one dated bullet, not a diary |
| Open Questions | Unresolved mysteries worth revisiting (ref = the file that raised them) |

## Quality bar

Litmus test: **if it'd be obvious to anyone reading the code — don't write
it.** An entry must be actionable cold: a reader who missed the session knows
what to do or avoid.

- ❌ `- 2026-09-16 — Promises can be tricky. (server)` — vague; no action, no context.
- ✅ `- 2026-09-16 — pnpm ≥10 silently blocked esbuild's postinstall; the "command not found" looks like a client bug but the fix is approving the build in client/pnpm-workspace.yaml allowBuilds. (client/pnpm-workspace.yaml:1)`

Nothing substantial learned → write nothing. Signal over volume.

## Before writing — four rules

1. **Dedup**: read the target section first; if an equivalent entry exists
   (even worded differently), skip.
2. **Append-only**: never rewrite, reword, or prune existing entries — pruning
   is a periodic human task, never part of capture.
3. **Redirect**: README/docs/specs material goes there instead (e2e: flow specs).
4. **One insight → one file**: the module where it bites. If it genuinely spans
   modules, pick where it bites hardest and name the other module inside the
   entry; never duplicate across files.

The Contract at the top of each INSIGHTS.md is authoritative for entry format.
