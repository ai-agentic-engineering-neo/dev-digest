# Insights — repo root

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it, never edit it away.

**Scope:** this file holds only findings that cross package boundaries — the
shared contracts, the toolchain, CI, and the dev scripts. Anything scoped to a
single package lives in that package's file:
[`server`](server/INSIGHTS.md) · [`client`](client/INSIGHTS.md) ·
[`reviewer-core`](reviewer-core/INSIGHTS.md) · [`e2e`](e2e/INSIGHTS.md).

**Lifecycle:** when an entry hardens into a standing rule, move one line of it
into `CLAUDE.md` as a `NEVER`/`ALWAYS` directive and delete the entry here;
bulky reference material goes to `docs/` instead. This file is the staging
area, not the destination.

Sections are fixed — add to the one that fits, never invent a new heading.
Entry format: `.claude/skills/engineering-insights/reference/entry-format.md`.

## Decisions

### 2026-09-17 — Severity counters exclude dismissed findings

**What:** every per-severity count — the PR list's `findings_counts`, the
findings panel's chips, the timeline's run chips — skips findings with a
`dismissed_at`. Accepted findings still count.

**Why:** a counter answers "what still needs attention", and the repo had
already settled that question elsewhere: `ReviewRunAccordion.tsx:56` computes
its blockers as `severity === "CRITICAL" && !f.dismissed_at`. A second, looser
rule next to it would have made two numbers on the same screen disagree.

**Rejected:** counting everything the model produced. Simpler to aggregate (one
`IN`-query, no `isNull`) and it keeps the list row stable, but it contradicts
the blockers count sitting two lines below it on the detail page.

**Consequence worth knowing:** the panel still LISTS a dismissed finding, struck
through, while the counter above it excludes it. That asymmetry is deliberate —
the decision stays visible and reversible — and it is why `severityCounts()`
(`client/src/components/severity-counts/helpers.ts`) filters but
`visibleFindings()` does not.

## What Works

- **2026-09-16** — `main` is trimmed, but the lessons' code is still in git.
  Before building a lesson feature, look for a prior implementation:
  `git log -S '<identifier>' --oneline --all`. The Run Cost feature came back
  from the pair `93119a5` (added it) and `d45ab0d` (removed it) — together they
  held the schema change, the route aggregate, the component and the i18n keys.
  Cheaper and more faithful than re-deriving it from the design mockups.

## What Doesn't Work

## Codebase Patterns

- **2026-09-16** — No route anywhere in `server/src/modules/` declares
  `schema.response`, so the `@devdigest/shared` contracts are compile-time only
  on read paths — a response that violates its Zod schema is served, not
  rejected. Consequence when adding a field to a contract that describes a
  PERSISTED document (`RunStats` lives inside the `run_traces.trace` jsonb):
  use `.nullish()`, not `.nullable()`. `nullable()` still requires the key, so
  documents written before the field existed stop type-checking, while rows in
  a nullable DB column are fine with `.nullable()`.
  `server/src/vendor/shared/contracts/trace.ts`

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

- **2026-09-17** — Findings-by-severity (PR list column + panel filter +
  timeline chips). Written fresh, but `git log -S severityCounts --all` still
  paid off: `7641b48`/`97b6edc`/`0953fdc` served as the design spec.

- **2026-09-16** — Run Cost (server + client + shared contracts): recovered the
  reverted implementation from git history, re-threaded `costUsd` end to end.

## Open Questions
