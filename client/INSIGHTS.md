# Insights — @devdigest/web

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it, never edit it away.

**Scope:** only what applies to `@devdigest/web`. Findings that cross package boundaries
go in the repo-root `INSIGHTS.md`.

**Lifecycle:** when an entry hardens into a standing rule, move one line of it
into `CLAUDE.md` as a `NEVER`/`ALWAYS` directive and delete the entry here;
bulky reference material goes to `docs/` instead. This file is the staging
area, not the destination.

Sections are fixed — add to the one that fits, never invent a new heading.
Entry format: `.claude/skills/engineering-insights/reference/entry-format.md`.

## Decisions

## What Works

## What Doesn't Work

- **2026-09-17** — `<SeverityBadge compact>` renders an icon plus the count and
  nothing else — `Badge.tsx:80` drops the label in compact mode. So a compact
  chip has no accessible name, no tooltip, and no text for RTL to query: tests
  that `getByText("Warning")` fail, and a screen reader hears only a number.
  Any compact cluster must supply its own `title`/`aria-label`; ours does it in
  `components/severity-counts/SeverityCounts.tsx`.

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
