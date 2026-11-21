# e2e — learnings

Lessons captured while working in this module, written by the
`engineering-insights` skill. Append-only: add entries, never rewrite or delete
them; correct an entry by appending a new dated one that names it. Curated
facts about the module, where the module keeps them, are in `INSIGHTS.md`.

Entry format:
`- YYYY-MM-DD — <specific lesson and the action to take>. Evidence: path:line`

## What Works

<!-- Approaches and solutions that worked here. -->

## What Doesn't Work

<!-- Dead ends and antipatterns. The most valuable section; do not skip it. -->

## Codebase Patterns

<!-- Conventions and structure that are not obvious from one file. -->

- 2026-11-21 — The runner loads only files ending in `.flow.json` from `specs/`, so markdown specs can live in the same folder; a flow saved under any other extension is silently never run. Evidence: e2e/run.ts:55

## Tool & Library Notes

<!-- Quirks of dependencies and tooling. -->

## Decisions

<!-- A decision and the reason for it. -->

## Recurring Errors & Fixes

<!-- An error seen more than once, with its fix. -->

## Session Notes

<!-- One dated line per work session. -->

- 2026-11-21 — Added CLAUDE.md, INSIGHTS.md, docs/ and written-spec files beside the flows; no flow or runner code changed.

## Open Questions

<!-- What is still unresolved. -->
