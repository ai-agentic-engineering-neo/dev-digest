# client — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

- **2026-09-16** — Treating in-flight runs as server state (`/pulls/:id/runs/active`) rather than component state is what makes a running review survive reload, navigation, and a second tab; SSE only supplies the live log on top of it. Evidence: `client/src/lib/hooks/reviews.ts:28-34`.

## What Doesn't Work

- **2026-09-16** — The "all-longhand" border trick in `FindingCard` does not fully silence React's style warning: `borderColor` is itself a shorthand for the four `border-*-color` longhands, so a rerender that changes it while `borderLeftColor` is set still logs a conflicting-property warning and any test that rerenders the card emits that stderr noise. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:7`.

- **2026-09-16** — Sending `content-type: application/json` on a body-less POST/PUT makes Fastify reject the request with "Body cannot be empty when content-type is application/json", which is why `apiFetch` sets the header only when a body is actually present — adding it unconditionally breaks every no-body mutation (refresh, resync, cancel). Evidence: `client/src/lib/api.ts:27-30`.

## Codebase Patterns

- **2026-09-16** — Routes are keyed by PR *number* while every PR API is keyed by the row uuid, so the detail page resolves number → id through the cached pulls list before fetching anything; a component that fetches straight from the route param will 404. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:32-36`.

## Tool & Library Notes

- **2026-09-16** — Path aliases are declared twice and neither file reads the other: adding one to `tsconfig.json` without also adding it to `vitest.config.ts` type-checks and builds fine but fails at test time with an unresolved import. Evidence: `client/vitest.config.ts:8-12` vs `client/tsconfig.json:22`.

- **2026-09-16** — Vitest only collects `src/**/*.test.{ts,tsx}`, so a test file placed outside `src/` is silently never run rather than reported as missing. Evidence: `client/vitest.config.ts:18`.

- **2026-09-16** — `SeverityBadge` renders its label as `Critical`/`Warning`/`Suggestion` and only uppercases via CSS `textTransform`, so an RTL assertion on text content such as `getByText("CRITICAL")` fails even though the UI shows "CRITICAL". Evidence: `client/src/vendor/ui/primitives/tokens.ts:10-12`, `client/src/vendor/ui/primitives/Badge.tsx:75`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
