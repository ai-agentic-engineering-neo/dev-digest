# client — insights

Non-obvious lessons learned while working in `client/`. Maintained by the `engineering-insights` skill.
Append-only: new lines go at the end of their section; corrections are new dated entries.
Format: `- YYYY-MM-DD — <what is true / what happened> → <what to do instead> (path → symbol)`.
Add an entry only if forgetting it would make an agent (or a human) repeat the mistake.

## What Works
<!-- Approaches that proved effective here -->

## What Doesn't Work
<!-- Dead ends and antipatterns — the most valuable section -->

## Codebase Patterns
<!-- Conventions and architecture decisions, with the reason -->
- 2026-11-04 — `Severity` in `src/vendor/ui/primitives/tokens.ts` includes `INFO`, but the Zod contract (`@devdigest/shared` findings) has only CRITICAL/WARNING/SUGGESTION → don't assume UI tokens match the contract.
- 2026-11-04 — `RepoIntelState` in `src/lib/hooks/repo-intel.ts` is a deliberate local type (repo-intel types aren't in shared) → check it against server `modules/repo-intel/types.ts` when the index-state route changes.
- 2026-11-04 — SSE uses `new EventSource(API_BASE + '/runs/:id/events')` in `hooks/reviews.ts` — the one sanctioned bypass of `api.ts` (fetch wrapper can't stream SSE).
- 2026-11-04 — `Gallery` (`src/components/showcase/Showcase.tsx`) is rendered by `src/test/smoke.test.tsx` with NO `NextIntlClientProvider` → components added to `/showcase` must not call `useTranslations`; take translated strings as props (src/components/run-cost-badge → RunCostBadge `tokenUnit`).

## Tool & Library Notes
<!-- Dependency / tooling quirks -->
- 2026-11-04 — On this Windows box `pnpm typecheck`/`pnpm test` fail with "Access is denied" (pnpm 12 shim) → run the bins directly: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`, `node node_modules/vitest/vitest.mjs run` (same in server/).

## Recurring Errors & Fixes
<!-- Symptom → root cause → fix -->

## Session Notes
<!-- Wrap-up: one dated line per substantive task -->
- 2026-11-04 — Shipped Run Cost Badge UI (PR-list COST column, timeline tokens·cost, trace COST tile) → specs/run-cost-badge.md.

## Open Questions
<!-- Unresolved items, known gaps -->
