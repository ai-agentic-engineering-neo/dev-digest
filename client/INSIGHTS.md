# client — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

## What Doesn't Work

- **2026-08-01** — `position: absolute` popovers inside a PR-list row get clipped by the list container's overflow, so hover cards there must use `position: fixed` anchored via `getBoundingClientRect()` on mouseenter. Evidence: `client/src/app/repos/[repoId]/pulls/styles.ts` (`findingsPreview`).

- **2026-08-01** — The "all-longhand" border trick in FindingCard does not fully silence React's style warning: `borderColor` is itself a shorthand for the four `border-*-color` longhands, so a rerender that changes `borderColor` while `borderLeftColor` is set still logs "Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)" — any test that re-renders FindingCard (focus moves, list filters) emits this stderr noise despite the comment claiming otherwise. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:7-13`.

## Codebase Patterns

## Tool & Library Notes

- **2026-07-29** — Path aliases are declared twice and neither file reads the other: adding one to `tsconfig.json` without also adding it to `vitest.config.ts` type-checks and builds fine but fails at test time with an unresolved import. Evidence: `client/vitest.config.ts:8-13` vs `client/tsconfig.json` `paths`.

- **2026-07-29** — Vitest only collects `src/**/*.test.{ts,tsx}`, so a test file placed outside `src/` is silently never run rather than reported as missing. Evidence: `client/vitest.config.ts:18`.

- **2026-08-01** — `SeverityBadge` renders its label as `Critical`/`Warning`/`Suggestion` and only uppercases via CSS `textTransform`, so RTL assertions on `textContent` (e.g. `getByText("CRITICAL")`) fail even though the UI shows "CRITICAL". Evidence: `client/src/vendor/ui/primitives/tokens.ts:10-13`, `client/src/vendor/ui/primitives/Badge.tsx:76`.

## Recurring Errors & Fixes

## Session Notes

- **2026-08-01** — Added severity counter chips + click-to-filter to `FindingsPanel` (feat/severity-findings-counters); counts derive from already-fetched findings, no new API/LLM calls. Verified with vitest and agent-browser against the live app.

## Open Questions
