# 01 — PR list findings field (`PrMeta.findings`)

## What

`GET /repos/:id/pulls` ships, per PR row, `findings: FindingPreview[]` — the
read-only findings of the PR's **latest review round** (all agent runs sharing
one `multi_run_id`; a run with a null `multi_run_id` is its own round). Same
round semantics as `cost_usd`.

Resolution: runs of the latest round → reviews whose `run_id` is one of those
runs → those reviews' findings, mapped to the slim `FindingPreview` shape
(`severity`, `category`, `title`, `file`, `start_line`, `end_line`,
`confidence`, `rationale`).

## Must

- Always an array on the list route (empty = no findings); `.nullish()` in the
  contract because `PrDetail` extends `PrMeta` and never populates it.
- Include accepted/dismissed findings — the detail page renders them (muted),
  so list counts and detail cards agree.
- No per-severity counts from the server — the client tallies previews
  (`countBySeverity`); the server ships records, not aggregates.
- Bounded queries only: the route reuses the `agent_runs` rows it already
  fetched for cost, then two IN-queries (reviews by run ids, findings by
  review ids). No N+1.

## Why

- Reviews without a run row (legacy / pre-grouping data) are not represented
  on the list — the list summarizes latest *run* activity; the detail page
  still shows every review. The seed links its demo review to a seeded
  `agent_runs` row so seeded/e2e environments exercise the same path.
- Slim previews rather than full `FindingRecord`s: the popover renders 9 of
  the record's fields; shipping suggestion markdown, trifecta evidence, and
  action timestamps per PR row would bloat the list payload for nothing.

## Where

- `src/vendor/shared/contracts/platform.ts` (`PrMeta.findings`) — mirrored
  into `client/src/vendor/shared/contracts/platform.ts`.
- `src/vendor/shared/contracts/findings.ts` (`FindingPreview`) — mirrored.
- `src/modules/pulls/routes.ts` — latest-round resolution.
- `src/db/seed.ts` — seeds one `agent_runs` row + `multi_agent_runs` round and
  links the seeded review to it.
