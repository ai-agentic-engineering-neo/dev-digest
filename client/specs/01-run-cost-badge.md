# Run Cost Badge

**Status:** agreed

The feature spans the API and the UI, so its single spec lives in
[`server/specs/01-run-cost-badge.md`](../../server/specs/01-run-cost-badge.md).

UI summary: one shared `src/components/run-cost-badge/` (`compact` → `$0.014`,
`detailed` → `$0.0013 · 8.2K→1.3K`), shown in the PR list (`COST` column), the
Agent runs timeline, the run drawer's Stats, and the Review runs accordion header.

Amended 2026-09-23: every Timeline run shows its cost (`—` when none) — see the
Amendment in the server spec.

Amended 2026-09-23 (2): the PR list's `COST` is the total of all the PR's `done`
runs, not the latest review's — see the Amendment in the server spec.
