# INSIGHTS — server

Practical findings hit while working in this module. Append-only: correct a
stale entry with a new dated line, never edit or delete history silently.

Before writing here, check [CLAUDE.md](CLAUDE.md) — a finding that should
*always* apply belongs there as a standing rule; this file is for things too
specific, too contextual, or too unproven for that yet.

**Anti-vague test:** if someone who just read the code wouldn't be surprised,
don't write it. See the repo's `engineering-insights` skill for the full
workflow and quality bar.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-07-27 — `@devdigest/shared` is hand-copied into both `server/src/vendor/shared`
  and `client/src/vendor/shared`, not a real linked package — and the copies
  have already drifted: `AgentManifest`, the `sessionId` field on the
  OpenRouter payload, and the `'openrouter'` provider id exist in the server
  copy but not the client copy. Grep the client copy before assuming a shared
  contract change only needs to happen here.
  (`server/src/vendor/shared/contracts/eval-ci.ts:144-172`,
  `server/src/vendor/shared/adapters.ts:64-69,83` vs the equivalent
  `client/src/vendor/shared/` files, which lack them)

- 2026-08-04 — Growing a shared trace contract (e.g. `RunStats`) means
  updating fixtures in at least 3 separate places, not the 2 you'd find by
  grepping component tests: `server/test/contracts.test.ts` builds its own
  standalone `RunTrace.parse({...})` fixture, independent of
  `RunTraceDrawer.test.tsx`'s. Skipped it once while planning the `cost_usd`
  field and only caught it because the unit suite failed on a Zod
  `invalid_type` error, not from reading the plan.
  (`server/test/contracts.test.ts:160`)

- 2026-08-04 — No SQL `sum()`/`.groupBy()` call exists anywhere in
  `server/src/modules` — the established idiom for a per-PR aggregate (score,
  now cost) is an `IN`-query over the small PR-id list + JS `Map` grouping in
  the route handler itself, not a database-side aggregate. Follow this
  pattern rather than reaching for Drizzle's `sum()` (which also types as
  `string | null` even over a `double precision` column).
  (`server/src/modules/pulls/routes.ts:137-145`, mirroring the pre-existing
  `latestReviewByPr` map at `server/src/modules/pulls/routes.ts:119-128`)

## Tool & Library Notes

## Recurring Errors & Fixes

## Open Questions

- 2026-07-27 — No sync/codegen step keeps `src/vendor/shared` in step with
  the client's copy — is a checked-in diff script or a build-time copy step
  worth adding, or does the course intentionally keep this manual?

## Session Notes

- 2026-08-04 — `engineering-insights` did not auto-invoke during the whole
  `feat/review-cost` session (a multi-file feature with real findings — see
  above) despite matching its own "end of a non-trivial coding session"
  trigger in its `SKILL.md` description. It only ran because the user
  explicitly asked whether it had fired. Confirms the skill's own
  "Course arc" note in `references.md`: a description/manual trigger alone
  is not reliable enough without a `Stop` hook forcing it.
