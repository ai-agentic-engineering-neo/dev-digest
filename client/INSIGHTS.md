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
