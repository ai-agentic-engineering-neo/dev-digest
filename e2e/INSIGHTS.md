# Insights — e2e

Non-obvious, actionable lessons for this module — treat as high-confidence guidance.
Agents append via the `engineering-insights` skill (dated, atomic, append-only);
humans consolidate at ~100 entries.

## What Works
<!-- Approaches, patterns and solutions that proved effective -->

## What Doesn't Work
<!-- Dead ends and anti-patterns: the wrong approach and the right one -->

## Codebase Patterns
<!-- Conventions, architecture decisions, naming -->

- **2026-09-23 · `specs/` is executable** — unlike other packages, `e2e/specs/` holds
  runnable `*.flow.json` files. Written test plans go in `test-plans/`.

## Tool & Library Notes
<!-- Quirks and gotchas of dependencies -->

- **2026-09-23 · Assertions are waits** — `wait --text` / `wait --url` time out and exit
  non-zero, which fails the step; that is the assertion mechanism.

## Recurring Errors & Fixes
<!-- Error message / symptom → fix -->

- **2026-09-23 · First-repo redirect** — flow 02 follows the home redirect to the first
  repo, so any extra imported repo in the DB breaks it. Use the hermetic runner.

## Session Notes
<!-- Dated 1–2 sentence summaries of meaningful sessions -->

## Open Questions
<!-- Unresolved items worth investigating -->
