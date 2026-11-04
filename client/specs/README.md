# specs — client

Specs / acceptance criteria for the `client` package. 

One feature per file: `<feature>.md` with sections **Goal · Scope · Acceptance criteria**.
Written BEFORE implementation; `docs/` describes how existing code works, `specs/` what to build.
Add each new spec to the list below with a one-line "read when".

<!-- - [feature.md](feature.md) — read when … -->
- [run-cost-badge.md](run-cost-badge.md) — read when showing run/PR cost (`RunCostBadge`, PR-list COST column, timeline, trace Stats)
- [severity-counters.md](severity-counters.md) — read when touching the findings list filters on the PR page (`SeverityCounters`, `FindingsPanel`)
- [pr-list-findings.md](pr-list-findings.md) — read when touching the PR-list FINDINGS column/popover (`FindingsCell`), Timeline severity icons, or `SeverityTally`
