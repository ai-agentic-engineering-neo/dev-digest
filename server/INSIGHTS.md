# Insights — server

Verified, non-obvious lessons for agents and humans. Maintained by the `engineering-insights` skill.
Entry: `` - YYYY-MM-DD · trigger · rule — why · `evidence` `` (path + symbol, no line numbers; max 2 lines). Append-only, newest at the bottom of each section.
To correct an entry, append a new one with `(supersedes YYYY-MM-DD)` and prefix the old one with `[SUPERSEDED]`.

## What Works
<!-- Approaches that solved a problem where the default way fails or is worse. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. Always state the alternative. The most valuable section. -->
- 2026-11-21 · A failed fire-and-forget job crashed the API (unhandled rejection) ·
  JobRunner marks `done` as handled; callers that need the result must `await done`. · `server/src/platform/jobs.ts`
- 2026-11-22 · Settings Test connection said "OK — 441 models" for a URL saved as the OpenRouter key · listModels is no key check: OpenRouter GET /api/v1/models is public (200 with any Bearer), and Test connection IS the
  save action, so any value gets persisted — validate via GET /api/v1/key (401 on a bad key) instead · `server/src/modules/settings/routes.ts test-connection`

## Codebase Patterns
<!-- Conventions and architectural decisions with their reason, not documented elsewhere. -->

## Tool & Library Notes
<!-- Quirks of our pinned dependencies, CLIs, and setup. -->

## Recurring Errors & Fixes
<!-- Start with the exact error text in backticks, then the cause and the fix. -->
- 2026-11-22 · `401 Missing Authentication header` on every openrouter review run · the stored OPENROUTER_API_KEY was not an sk-or-v1- key (a pasted URL); ~/.devdigest/secrets.json wins over .env —
  check the stored value shape, then paste the real key into Settings and click Test connection · `server/src/adapters/secrets/local.ts LocalSecretsProvider.get`

## Session Notes
<!-- One dated line per substantial session: goal · outcome · open end. Keep the last 10. -->
- 2026-11-22 · M1 cost badge server side: agent_runs.cost_usd (migration 0010) + cost on runs/trace/PR-list routes · done; openrouter Test connection false positive still unfixed

## Open Questions
<!-- Unverified hypotheses and unexplained behaviour. Move them out once confirmed. -->
