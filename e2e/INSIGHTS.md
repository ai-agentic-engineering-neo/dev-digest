# e2e — insights

Things that are true about `e2e/` but not visible in the code. Append-only:
when an entry goes stale, add a dated note under it instead of deleting it.
Cross-package findings go in the [root file](../INSIGHTS.md).

Entry format: `- **YYYY-MM-DD** — claim. Evidence: \`path:line\``

## Decisions

## Pitfalls

## Doc drift

- **2026-09-23** — README's example and coverage table show flow 01 asserting the
  seeded PR `#482`; the real flow 01 is order-independent and only checks the
  redirect to `/pulls` plus the "Pull Requests" heading — `#482` is asserted in
  02. Evidence: `README.md:21,96`, `specs/01-app-boot.flow.json`.

## Open questions
