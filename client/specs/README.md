# specs — client

Specs / acceptance criteria for the `client` package. 

One feature per file: `<feature>.md` with sections **Goal · Scope · Acceptance criteria**.
Written BEFORE implementation; `docs/` describes how existing code works, `specs/` what to build.
Add each new spec to the list below with a one-line "read when".

<!-- - [feature.md](feature.md) — read when … -->
- [run-cost-badge.md](run-cost-badge.md) — read when showing run/PR cost (`RunCostBadge`, PR-list COST column, timeline, trace Stats)
- [severity-counters.md](severity-counters.md) — read when touching the findings list filters on the PR page (`SeverityCounters`, `FindingsPanel`)
- [pr-list-findings.md](pr-list-findings.md) — read when touching the PR-list FINDINGS column/popover (`FindingsCell`), Timeline severity icons, or `SeverityTally`
- [skills.md](skills.md) — read when changing the Skills page, skill editor/import modals or the agent Skills tab
- [conventions.md](conventions.md) — read when changing the Conventions page (`ConventionsView`, `ConventionCard`) or the "Create skill from conventions" modal
- [multi-agent-review.md](multi-agent-review.md) — read when building/changing the Multi-Agent Review page (`/repos/:repoId/multi-agent`: run config, columns/tabs, "Where agents disagree", agent badge) or promoting `FindingCard`/`RunTraceDrawer`
- [intent-layer.md](intent-layer.md) — read when touching the PR-page Intent card (confidence, sources, stale/refresh, user override) or intent hooks/types
- [smart-diff.md](smart-diff.md) — read when touching the Files changed tab grouping (Smart/Original order, role groups), findings inside the diff (group counter, file dot, finding card under a line) or `useSmartDiff`
