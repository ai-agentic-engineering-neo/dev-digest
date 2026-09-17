# e2e/ — Insights

Running log of gotchas, tricky bugs, and rationale for non-default decisions in
this module. Linked from [CLAUDE.md](./CLAUDE.md) — not inlined there because
this list is expected to grow and change often (volatile by design).

Format: newest first within each section. One entry = one decision or one
gotcha. Keep entries short; link to code/PR/commit for the full story instead
of re-explaining it here.

---

## What Works

## What Doesn't Work

### 2026-09-16 — Never `docker compose down -v` against the dev stack
`-v` deletes the `devdigest_pgdata` volume along with every repo and review
you've imported for local development — it is not scoped to e2e data. Use the
hermetic runner (`./scripts/e2e.sh`, isolated ports 5433/3101/3100, no
persistent volume) whenever you need a clean-slate Postgres for a test run.

## Codebase Patterns

### 2026-09-16 — Flows assume the seeded demo repo is the *only* repo
Flow `02` (and `04`/`05`, which depend on landing on the same PR) follow the
home redirect to the *first* repo in the DB. Running `npm test` against your
normal dev stack — which usually has other imported repos — makes these flows
land on the wrong repo and fail non-deterministically. This is exactly why the
hermetic runner exists: it seeds an empty, isolated Postgres so the demo repo
`acme/payments-api` is guaranteed to be the only one.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions

---

<!-- Add new entries above this line within the relevant section, newest first. -->
