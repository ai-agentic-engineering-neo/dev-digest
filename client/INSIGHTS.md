# Insights — client

Verified, non-obvious lessons for agents and humans. Maintained by the `engineering-insights` skill.
Entry: `` - YYYY-MM-DD · trigger · rule — why · `evidence` `` (path + symbol, no line numbers; max 2 lines). Append-only, newest at the bottom of each section.
To correct an entry, append a new one with `(supersedes YYYY-MM-DD)` and prefix the old one with `[SUPERSEDED]`.

## What Works
<!-- Approaches that solved a problem where the default way fails or is worse. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. Always state the alternative. The most valuable section. -->

## Codebase Patterns
<!-- Conventions and architectural decisions with their reason, not documented elsewhere. -->

## Tool & Library Notes
<!-- Quirks of our pinned dependencies, CLIs, and setup. -->
- 2026-11-21 · RunHistory cost-line test failed on "9 119 tok" · RTL getByText normalizer collapses the thin-space ( ) thousands separator from formatTokenCount to a plain space — assert "9 119 tok", not the raw char · `client/src/lib/format-cost.ts formatTokenCount`

## Recurring Errors & Fixes
<!-- Start with the exact error text in backticks, then the cause and the fix. -->
- 2026-11-24 · `Module not found: Can't resolve './contracts/findings.js'` → 500 on every page after a runtime import of `Severity` · client must import `@devdigest/shared` types-only (`import type`) — Next webpack can't resolve the barrel's `.js` specifiers, while vitest + tsc stay green, so load a page to check; mirror needed values as a client const · `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/constants.ts SEVERITY_LEVELS`

## Session Notes
<!-- One dated line per substantial session: goal · outcome · open end. Keep the last 10. -->
- 2026-11-21 · M1 cost badge: cost on PR list / timeline / trace stats / verdict banner (specs/M1-cost-badge.md) · done; not yet eyeballed in a browser with real runs
- 2026-11-24 · M1 severity counters + filter (specs/M1-severity-filter.md): SeverityFilter pills in FindingsPanel, counts = run totals, AND with hide-low · done; 71/71 tests, typecheck green, checked in browser (dark + light, PR #482) · demo video + PR by user

## Open Questions
<!-- Unverified hypotheses and unexplained behaviour. Move them out once confirmed. -->
- 2026-11-24 · React warns `Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)` whenever a FindingCard's focus changes (j/k, filter change) · noise in FindingsPanel tests, not from new code; fix = replace the `border` shorthand with per-side props · `FindingCard/styles.ts`
