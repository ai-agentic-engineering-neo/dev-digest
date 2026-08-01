# client — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

- **2026-07-29** — Path aliases are declared twice and neither file reads the other: adding one to `tsconfig.json` without also adding it to `vitest.config.ts` type-checks and builds fine but fails at test time with an unresolved import. Evidence: `client/vitest.config.ts:8-13` vs `client/tsconfig.json` `paths`.

- **2026-07-29** — Vitest only collects `src/**/*.test.{ts,tsx}`, so a test file placed outside `src/` is silently never run rather than reported as missing. Evidence: `client/vitest.config.ts:18`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
