# PR cost & findings counters

**Status:** shipped
**Packages touched:** server, client

## Problem

The PR list and PR detail pages showed status and score, but not what a
review actually cost or what it found without opening every run. A user
triaging several PRs needs, per PR and per run: how much money it burned and
a per-severity breakdown of what it flagged, without leaving the list.

## Scope — in / out

In:

- PR list: COST column, FINDINGS column (severity chips + hover preview).
- PR detail → Agent runs timeline: cost/tokens per run, severity chips +
  hover preview per run.
- PR detail → Review runs (expanded accordion): clickable
  "N CRITICAL · N WARNING · N SUGGESTION" pills under the verdict, filtering
  that run's findings list.

Out: no LLM calls to produce this data — it reads run/finding rows already
persisted by a review; no repo cloning; no `docker compose down -v` to reset
seed data.

## Contract changes

`@devdigest/shared` first (`server/src/vendor/shared/`, then hand-copied to
`client/src/vendor/shared/` — see root `INSIGHTS.md` on that copy lagging):

- `contracts/platform.ts` — `PrMeta.cost_usd` (nullable number, **sum of
  every completed run's cost** for the PR, list endpoint only — a run with
  an unpriced model contributes nothing to the sum; null when the PR has no
  completed run) and `PrMeta.findings_counts` (nullable
  `{ CRITICAL, WARNING, SUGGESTION }`, summed over each agent's latest
  review).
- `contracts/trace.ts` — `RunStats.cost_usd` / `RunSummary.cost_usd`
  (nullable — never `0`, which would read as "this review was free") and
  `RunSummary.critical_count` / `warning_count` / `suggestion_count`
  (nullable, snapshotted alongside `blockers` at run completion).

DB: `agent_runs` gains `cost_usd` (`double precision`), `critical_count`,
`warning_count`, `suggestion_count` (`integer`) — see
`server/src/db/schema/runs.ts`. **Migration status is currently unresolved**
— see root `INSIGHTS.md`, "What Doesn't Work", 2026-09-18 entry: the local
dev DB already has these columns via migrations no longer present in git,
so a plain `pnpm db:generate` was deliberately not run as part of this spec
landing. Do not close this out until that drift is resolved.

## Acceptance criteria

- PR list row: SCORE (circular score or `—`), FINDINGS (per-severity chips,
  clickable through to the Findings tab filtered by that severity, or `—`),
  COST (sum of every completed run's cost as `$X.XXX`, or `—` when the PR
  has no completed run).
  `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`,
  `server/src/modules/pulls/helpers.ts#sumCostByPr`
- Hovering the FINDINGS cell on the PR list shows a popover titled
  "N findings in this run" (renders uppercase via CSS) with up to 6 findings
  (severity, title, category, `file:line`, confidence, truncated
  rationale). `client/src/components/findings-preview/FindingsPreviewCard.tsx`
- PR detail → Agent runs timeline: each run shows severity chips + a
  `tokens · $cost` line; hovering the chips shows the same style of popover,
  titled "N findings in this run" (shares the `timeline.findingsInRun` i18n
  key with the aria-label, not the dead `findingsHoverTitle` key it used to
  point at). `RunHistory.tsx`, `RunFindingsHoverCard.tsx`
- PR detail → Review runs (expanded): a clickable
  "N CRITICAL · N WARNING · N SUGGESTION" pill row renders directly under
  `VerdictBanner`'s summary/cost line; clicking a pill filters that run's
  `FindingsPanel` to that severity (click again to clear). FindingsPanel's
  own toolbar counters are hidden in this context so there is exactly one
  filter control per run — they still render as a fallback for the rare
  `verdict: null` case, where there is no VerdictBanner to host the pills.
  `ReviewRunAccordion.tsx`, `VerdictBanner.tsx`, `FindingsPanel.tsx`
- The PR list's `?severity=` deep link (a FINDINGS chip click) still
  pre-filters whichever `ReviewRunAccordion` reads it — that state moved
  from `FindingsPanel`'s own `useSearchParams` read to
  `ReviewRunAccordion`'s, alongside the lifted filter.

## Open questions

- The migration drift documented above: does this dev DB's volume get
  rebuilt from a clean migration history, or does the team accept treating
  the volume as the source of truth and re-derive the missing migration
  files from it? Either answer unblocks generating migration `0010` for the
  4 `agent_runs` columns this spec adds.
