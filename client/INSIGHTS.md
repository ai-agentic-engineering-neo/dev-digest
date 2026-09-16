# Insights — client

Non-obvious findings and gotchas. Add an entry whenever something surprised
you, so the next agent/session doesn't relearn it.

## Codebase Patterns

- **2026-09-17** — `client/src/components/<name>/` (cross-route shared
  components not tied to one page, e.g. `diff-viewer/`, `page-shell/`,
  `app-shell/`, `run-cost-badge/`) use kebab-case directory names — unlike
  route-local `_components/<Name>/` under `app/`, which use PascalCase.

## What Doesn't Work

- **2026-09-17** — A naive `abs.toFixed(6)` for rounding a USD-cost string
  mis-rounds real binary-float inputs at exact `x5` boundaries (e.g.
  `0.0000135` is actually stored as `...499999999995`, so `toFixed(6)` rounds
  DOWN instead of up). Fix: round via a scaled integer
  (`Math.round(abs * 1e6)`) instead of `toFixed`. Even that needs an explicit
  `>= 1e6` carry check — a value just under 1 (e.g. `0.9999999`) can round up
  to exactly `1e6` and silently render as `"$0.100"` instead of `"$1.00"`,
  because `padStart(6, "0")` can't shrink an already-7-digit string. Caught
  by an independent code review, not by the original test suite (which only
  covered values ≤ 0.013). See `client/src/lib/cost.ts`.
