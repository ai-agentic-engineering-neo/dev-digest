---
name: engineering-insights
description: "Captures practical engineering findings from a finished coding task — non-obvious dependencies, fixes, measured facts, gotchas — into the INSIGHTS.md of whichever module was touched (client/, server/, reviewer-core/, e2e/), each entry dated with a file:line citation. Use at the end of a non-trivial coding session (a real bug, decision, or discovery — not a trivial edit), when the user says 'wrap up', 'record insights', 'capture learnings', or asks what was learned this session. Append-only — corrects stale entries with a new dated line, never silently overwrites or deletes history."
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Engineering Insights

Turns a finished coding session into a durable, file-scoped memory: what worked,
what didn't, what surprised you — written where the *next* session in that
module will actually see it. Not a chat transcript, not documentation, not a
CLAUDE.md replacement — a running lab notebook per package.

## When to use

- End of a task that produced a real fix, a non-obvious discovery, a measured
  fact (a timeout, a limit, a benchmark), or a decision made between tradeoffs.
- Explicit trigger: "wrap up", "record insights", "capture learnings",
  `/engineering-insights`, or "what did we learn this session".
- **Skip** trivial sessions: typo fixes, formatting, renames, anything where
  nothing would surprise someone who just read the diff.

## Workflow

1. **Identify the touched module(s).** DevDigest is 4 standalone packages —
   `client/`, `server/`, `reviewer-core/`, `e2e/`. Look at which top-level
   package the files edited/read this session live under. A session can span
   more than one — write **separate** entries into **each** module's own
   `INSIGHTS.md`. Never create a cross-module or root-level insights file.
   Root-only changes (README, `scripts/`, `docker-compose.yml`) aren't scoped
   to a package — skip this skill for those.

2. **Open (or create) `<module>/INSIGHTS.md`.** If it doesn't exist yet, copy
   the skeleton from [template.md](template.md) — same fixed sections every
   time, so every module's file reads the same way.

3. **Draft candidate entries**, then filter every one through the anti-vague
   test below. If nothing survives, write nothing — a session producing no
   entry is a correct outcome, not a failure to force one.

4. **Classify each surviving finding under exactly one fixed section** (see
   below). **Append** — never rewrite an existing line. If a new finding
   corrects an older entry, add a new dated line noting the correction
   ("~~superseded~~ — see 2026-08-02 below"); don't delete or silently edit
   the old one. The file is an audit trail, not a snapshot.

5. **Every entry needs three things**: a date, a one-line finding, and a
   `path/to/file.ts:42`-style citation it's grounded in. No citation, no
   entry — this file is for verified findings, not opinions or guesses.

6. Optionally add one short dated line under **Session Notes** — only if it
   carries context none of the category entries capture alone (what was
   attempted, whether it shipped). Don't restate the category entries here.

## Anti-vague test

Before writing any line: **"Would this surprise someone who just read the
code?"**

- No → don't write it. If a linter, the type-checker, or the module's own
  `README.md`/`CLAUDE.md` already covers it, it doesn't belong here either.
- Yes → write it as a terse, actionable instruction for a future session, not
  a narrative of what you did.

See [examples.md](examples.md) for real vague-vs-useful pairs, including two
pulled from this repo.

## Fixed sections (same order in every module's file)

| Section | What goes there |
|---|---|
| **What Works** | A pattern that worked and is worth repeating. |
| **What Doesn't Work** | An approach that looked reasonable and failed — the antipattern to avoid next time. |
| **Codebase Patterns** | A convention specific to this module that isn't derivable from reading a single file (a shared-state rule, an implicit contract between files). |
| **Tool & Library Notes** | A dependency's quirk or limit — ideally a measured number (a size cap, a timeout, an undocumented flag). |
| **Recurring Errors & Fixes** | An error hit more than once, with its fix. |
| **Open Questions** | Something unresolved the next session should pick up. |
| **Session Notes** | Short, dated, session-level context — not a chat replay. |

## Hygiene

- **Cap ~200 entries per file.** Past that, signal drowns in noise. When a
  module's `INSIGHTS.md` approaches the cap, propose splitting by sub-domain
  (e.g. `server/INSIGHTS.md` → a `repo-intel`-specific split) instead of
  quietly trimming.
- **This is a draft under human review, not ground truth.** A wrong or stale
  entry is worse than a missing one — if you're not confident, say so in the
  entry or leave it out.
- **Never duplicate** what's already in `<module>/README.md`,
  `<module>/CLAUDE.md`, or what a linter/type-checker already enforces. If a
  finding is really a standing rule the agent must always follow, it belongs
  in that module's `CLAUDE.md`, not here — this file is for things too
  specific, too contextual, or too unproven for a standing rule yet.

## Reading it back

At the start of a task in a module, skim **that module's** `INSIGHTS.md` only
(not the whole repo's) before making changes there. Treat it as high-
confidence guidance — but verify a cited `file:line` still says what the
entry claims; code moves, and a stale citation means the finding may be stale
too.

## Wiring into CLAUDE.md (optional, do once per module)

Once a module has a `CLAUDE.md` (see the repo-wide CLAUDE.md structure), add:

```markdown
## Session protocol
- Before work: skim this module's INSIGHTS.md; confirm you've read it and
  name the top 2-3 relevant points before starting.
- After a non-trivial task: run the engineering-insights skill to update it.
```

A manual end-of-session trigger is not reliable by itself — the honest
expectation is that this needs a `Stop` hook to fire consistently (a later
step, not part of this skill). See [references.md](references.md).

See [template.md](template.md) for the blank `INSIGHTS.md` skeleton and
[examples.md](examples.md) for entry quality examples.
