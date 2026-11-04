# specs — server

Specs / acceptance criteria for the `server` package. 

One feature per file: `<feature>.md` with sections **Goal · Scope · Acceptance criteria**.
Written BEFORE implementation; `docs/` describes how existing code works, `specs/` what to build.
Add each new spec to the list below with a one-line "read when".

<!-- - [feature.md](feature.md) — read when … -->
- [run-cost-badge.md](run-cost-badge.md) — read when persisting/exposing agent-run cost (`agent_runs.cost_usd`, PR-list cost sum, partial cost on failed runs)
- [pr-list-findings.md](pr-list-findings.md) — read when changing what `GET /repos/:id/pulls` returns about findings (`PrMeta.findings`, `topFindings`)
