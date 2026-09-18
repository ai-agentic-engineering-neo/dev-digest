# client/ — Insights

Running log of gotchas, tricky bugs, and rationale for non-default decisions in
this module. Linked from [CLAUDE.md](./CLAUDE.md) — not inlined there because
this list is expected to grow and change often (volatile by design).

Format: newest first within each section. One entry = one decision or one
gotcha. Keep entries short; link to code/PR/commit for the full story instead
of re-explaining it here.

---

## What Works

## What Doesn't Work

## Codebase Patterns

### 2026-09-17 — Cost/token formatters live in `lib/format.ts`, not colocated per-feature
`formatCost`/`formatTokens` started folder-local to `RunTraceDrawer/helpers.ts`
(its only consumer). Once the PR-list COST column and the Agent-runs timeline
needed the same formatting, both moved to `src/lib/format.ts` so a run reads
identically on every surface; `RunTraceDrawer/helpers.ts` now just re-exports
them. Check `lib/format.ts` before adding a new local copy of either.

### 2026-09-17 — `formatCost`: `null` and `0` are different facts, not a rounding choice
Unknown cost (no completed run yet, or an unpriced model) renders `—`; a
genuinely free run renders `$0.00` — collapsing the two loses real
information. Below $1 the formatter grows past 2 decimals only as far as
needed to clear a `$0.00` rounding, since real per-run costs here are often a
few hundredths of a cent (`toFixed(2)` alone would show almost every run as
free). See `client/src/lib/format.test.ts` for the pinned values.

### 2026-09-16 — Always import UI via the `@devdigest/ui` barrel
Reaching into a layer file directly (e.g. `src/vendor/ui/primitives/Button.tsx`)
works today but breaks the point of vendoring: the barrel (`index.ts`) is the
only surface the showcase smoke test (`src/test/smoke.test.tsx`) and future
re-vendoring passes actually guarantee. Importing around it causes silent drift
that only surfaces when the vendored copy is refreshed.

### 2026-09-16 — Shared contracts must be mirrored by hand
`src/vendor/shared` here is a separate, hand-copied instance of
`@devdigest/shared` from `server/src/vendor/shared` — there's no workspace or
symlink. A schema change made in one and not the other desyncs request/response
contracts with no compiler error until a runtime mismatch shows up.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions

---

<!-- Add new entries above this line within the relevant section, newest first. -->
