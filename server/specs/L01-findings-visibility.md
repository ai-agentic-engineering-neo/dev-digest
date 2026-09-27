# Findings visibility (severity counters, filter, PR-list popover)

**Status:** implemented
**Lesson / ticket:** L01-b
**Packages:** server, client, e2e

**Amended 2026-09-20 (L01-c)** — the PR list's FINDINGS column and its popover
now describe the whole of the latest run (every agent), not the single latest
review. See *Per-run aggregation* below; the rest of the spec is unchanged.

## Goal

Findings already exist end to end, but they are only legible in one place — the
expanded run card. Make them legible in four:

- the **PR list** answers "how bad is this PR" without a click;
- the **expanded run card** answers "which of these do I care about" without
  scrolling;
- the **trace drawer** shows the findings a run produced, not just its cost and
  token stats;
- the **Agent-runs timeline** says what KIND of findings each run produced, not
  just how many.

## Non-goals

- No new review, scoring or LLM work. Every number here is a count over
  findings that are already persisted.
- No second place to mutate a finding. Accept/dismiss stay on the PR detail
  page's run card; the list popover and the drawer are read-only.
- No DB migration. This reads existing `reviews` / `findings` columns only.

## Decisions taken

- **D1 — the list carries its own preview.** The rollup rides on `PrMeta` from
  `GET /repos/:id/pulls`, so hovering a row costs no request. It carries the
  severity counts plus a *capped* preview array.
- **D2 — counters count what is rendered.** They are computed after the "Hide
  low confidence" filter and before the severity filter, so each counter equals
  the number of cards visible beneath it.
- **D3 — one mutation surface.** The trace drawer reuses the list's read-only
  preview component; it does not gain Accept/Reject.

### The subtle parts

**`total` is not `preview.length`.** The popover's title says "N FINDINGS IN
THIS RUN", and N is `total` — every finding of that run. `preview` is capped at
`PR_FINDING_PREVIEW_LIMIT` (5) so the list payload stays small under the
client's 60s refetch. When they differ, the popover says "+N more on the PR
page" rather than quietly under-reporting.

**Three states, not two.** `latest_findings` is `null` when the PR has never
been reviewed and an all-zero rollup when a review found nothing. The list
renders `—` for the first and a muted `0` for the second. Collapsing them would
claim a PR is clean when nobody has looked at it — the same "never
0-as-unknown" rule L01-run-cost applied to cost.

**Counters vs. the run's totals.** The accordion header and `VerdictBanner`
keep reporting the run's totals. With "Hide low confidence" on, the counters
can legitimately sum to less: the header describes the *run*, the counters
describe the *view*. That is D2's consequence, not a bug.

**The timeline counts from the reviews, not from `agent_runs`.** The run row
denormalizes only the aggregate `findings_count`; there is no per-severity
column and no migration to add one. The PR detail page already holds every
review with its findings, so `FindingsTab` tallies them by `run_id` and hands
the map to `RunHistory` — no request, no contract change. The two numbers can
legitimately differ (off-enum severities are dropped, a deleted review leaves
none at all), so a run with no usable breakdown falls back to the aggregate
line rather than rendering an empty or zero counter row.

### Per-run aggregation (L01-c)

**A run is a set of `agent_runs` rows, not one review.** The column originally
took the single newest `reviews` row, which on a multi-agent run meant "whatever
the last agent to finish happened to see". It now sums the findings of every
review the latest run produced: a run of three agents where one found a CRITICAL
and another a CRITICAL plus two WARNINGs reads `2 CRITICAL · 2 WARNING`.

**The grouping key is an exact `ran_at`, and that had to be made true.**
`agent_runs.ran_at` defaults to `now()`, which Postgres evaluates per statement,
and `ReviewService.runReview` queues agents with one INSERT each — so the agents
of a single review landed milliseconds apart and no equality grouping could ever
find them. `runReview` now stamps ONE `Date` for the batch and passes it to every
`createAgentRun`; the column default still applies to any caller that omits it.
Two consequences worth knowing: for review batches `ran_at` is now the app
clock rather than the DB clock, and runs recorded before this change keep their
staggered timestamps, so they group as batches of one until a new review runs.

**The fallback ladder.** Per PR: the latest run's reviews if it produced any,
else the latest review row, else `null`. The middle rung is what keeps the
column working on seeded and pre-run data — `seed.ts` inserts a review with
`run_id = NULL` and no `agent_runs` at all — and it also covers a run whose every
agent failed, which persists no review. Rendering that batch's empty result as a
confident `0` would claim the PR is clean when nothing actually looked at it,
the same "never 0-as-unknown" rule cost and `latest_findings` already follow.

**Duplicates are kept.** Two agents reviewing one diff often report the same
issue, and the union lists it twice. Deduplicating would make the counters
disagree with the rows in the popover beneath them, breaking D2 — and the
counters are the column's whole promise.

**The preview cap moved 5 → 30.** A union over three agents routinely clears 5,
and a popover that truncated nearly every row would not answer "what did this
run find". It is still a cap, not a promise to ship everything: the list is
refetched every 60s with one rollup per PR, and overflow is reported as
"+N more on the PR page".

**SCORE and FINDINGS describe the same run** (decided 2026-09-27, resolving
L01-c). `score` is `scoreFromFindings` (reviewer-core, CRITICAL 35 / WARNING 12
/ SUGGESTION 3 off 100) over the rollup's own findings — every agent of the last
run, or the latest-review fallback — computed on read; the stored
`reviews.score` is no longer used by the list. Three rules:
- **Duplicates count twice.** A problem two agents both flag is charged twice,
  exactly as the counters count it twice.
- **Dismissed findings cost nothing** but stay in the counters, so the ring can
  be higher than the counters alone imply.
- **`score_partial`** is true when an agent of the PR's newest run `failed` or
  was `cancelled` (not `running`, which is transient): the list shows a
  "partial" marker under the ring. It is also true on the all-failed fallback,
  where the score comes from an older review.

**Counters do not follow the severity filter.** While a filter is active the
counters still show the run's inventory — they are the filter's own targets,
and zeroing them would hide the very thing the next click should reach.

**`sum(by_severity) <= total`.** `findings.severity` is free text in the DB.
`rollupSeverities` ignores off-enum values and `toFindingPreviews` drops them,
because the UI can only render the three shipped severities.

## Contract

### DB

Unchanged. No migration.

### Zod — change in **both** `server/src/vendor/shared` and `client/src/vendor/shared`

`contracts/platform.ts` gains `PrFindingPreview` and `PrFindingsRollup`, and
`PrMeta` gains `latest_findings: PrFindingsRollup.nullish()`.

`PrFindingPreview` is deliberately NOT `FindingRecord`: it has no `review_id`,
`accepted_at` or `dismissed_at`, so the list is read-only by construction rather
than by convention. Its `description` is the `rationale` flattened to one
plain-text line and truncated — the popover never renders markdown.

### HTTP

`GET /repos/:id/pulls` gains `latest_findings` per PR. The rollup's shape is
unchanged by L01-c — only what fills it changed — so the client needed no
contract migration.

Query shape (all fixed, none per-PR — no N+1):

1. `agent_runs` for the listed PRs, newest `ran_at` first → each PR's last-run
   ids, taken as the first row's instant plus every later row equal to it.
2. `reviews` where `run_id IN (those ids)` and `kind = 'review'` → the batch's
   review ids per PR.
3. the existing latest-review query, still the source of `score` and now also
   the fallback rung.
4. one `inArray` over `findings` covering both sets of review ids, grouped in JS.

L01-c added (1) and (2); the findings query was widened rather than duplicated.

### UI component map

| Surface | File | What |
|---|---|---|
| PR list column | `client/src/app/repos/[repoId]/pulls/constants.ts` | `GRID` + `COLUMN_KEYS` gain `findings` between `score` and `cost` |
| PR list cell | `.../pulls/_components/FindingsCell/` | compact `SeverityBadge` per present severity + the hover popover |
| Shared preview | `client/src/components/finding-preview/` | read-only finding rendering; **no** interactive element, **no** i18n |
| Counters + filter | `.../pulls/[number]/_components/SeverityFilterBar/` | counter pills, then the three filter buttons |
| Panel wiring | `.../_components/FindingsPanel/` | owns `severity` state; `countBySeverity` / `filterBySeverity` in `helpers.ts` |
| Trace drawer | `.../RunTraceDrawer/_components/FindingsSection/` | now renders `FindingPreview` |
| Timeline row | `.../pulls/[number]/_components/RunHistory/` | `RunFindings` — one compact `SeverityBadge` per severity instead of the aggregate "N finding(s)" |

The popover panel is `position: fixed`. The list's `tableCard` sets
`overflow: hidden`, which clips absolutely-positioned descendants but not fixed
ones, and no ancestor establishes a containing block — so no portal is needed
(this codebase has never used `createPortal`; `kit/Modal.tsx` is the precedent).
The trade is that a fixed panel does not follow the scroll container, hence
close-on-scroll.

Counter labels are uppercase **in the message** (`"{count} CRITICAL"`), one
message rather than two adjacent spans, so the node's text is literally
`2 CRITICAL` — greppable and matchable by a text locator, which `2` and
`CRITICAL` in separate elements are not.

## Acceptance criteria

1. Expanding a run in "Review runs" shows, under the verdict and PR SCORE, a row
   of `N CRITICAL · N WARNING · N SUGGESTION` pills — only for severities present.
2. Each pill's number equals the finding cards of that severity rendered below.
3. Under it, Critical / Warning / Suggestion buttons filter the cards; clicking
   the active one clears the filter.
4. Counting and filtering are local — no LLM and no request on open or toggle.
5. Hovering the PR list's FINDINGS icons opens a popover titled
   "N FINDINGS IN THIS RUN".
5a. (L01-c) The counters sum every agent of the latest run, and the popover
   lists those agents' findings together, worst-first, duplicates included.
5b. (L01-c) A PR with no `agent_runs`, or whose latest run produced no review,
   still reports its latest review rather than `—` or `0`.
6. Each preview there is text only: severity, title, category, file:line,
   confidence, description — no buttons.
7. Accept/Reject live on the PR detail page's expanded run card.
8. The Trace and Logs drawer shows the run's findings, not just cost/stats.
9. A settled run in the Agent-runs **timeline** reports its findings as one
   counter per severity present (icon + number, as on the PR list), keeping the
   `· N blockers` suffix; a run whose breakdown is unknown still shows its
   aggregate `N finding(s)`.

## Test plan

| Criterion | Where |
|---|---|
| 1, 2, 3, 4 | `client/.../FindingsPanel/FindingsPanel.test.tsx` — counters, the counter↔cards invariant across toggle states, filter on/off, `aria-pressed`, a `fetch` spy that must stay uncalled |
| 1, 3, 7 | `client/.../ReviewRunAccordion/ReviewRunAccordion.test.tsx` — verdict + PR SCORE + counters + cards in document order; Accept/Dismiss present |
| 5, 6 | `client/.../PRRow/PRRow.test.tsx` — badge counts, `—` vs `0` vs badges, hover open/close, pointer travel into the panel, no row navigation on trigger click |
| 6 | `client/src/components/finding-preview/FindingPreview.test.tsx` — renders with no i18n provider; zero `button, a, input` |
| 8 | `client/.../RunTraceDrawer/RunTraceDrawer.test.tsx` — findings with category + confidence; no Accept/Dismiss |
| 9 | `client/.../RunHistory/RunHistory.test.tsx` — a counter per present severity, severities absent omitted, blockers preserved, aggregate fallback when the breakdown is missing, none on a failed run. **Not e2e-covered:** `server/src/db/seed.ts` inserts no `agent_runs` rows, so a freshly-seeded timeline has commits but no run row to assert against |
| server | `test/pulls-status.test.ts` (`previewDescription`, `toFindingPreviews`; the cap case is written against `PR_FINDING_PREVIEW_LIMIT`, not a literal, so it survived 5 → 30), `test/contracts.test.ts` (three rollup states, off-enum severity rejected), `test/reviews.it.test.ts` (latest run only, zero vs null) |
| 5a, 5b (L01-c) | `test/reviews.it.test.ts` — a 3-agent batch on one shared `ran_at` sums across agents and ignores the older run; a batch whose agents all failed falls back to the last real review; the pre-existing no-runs case now exercises the fallback rung explicitly. Client: `PRRow.test.tsx` — summed counters, every agent's findings in one popover, the duplicate listed twice |
| e2e | `02` findings column header; `04` counter pills + filter toggle on/off |

The hover popover is **not** e2e-covered: the runner's command vocabulary has no
hover verb, and deterministic locators are required. Its coverage is in
`PRRow.test.tsx`.

## Implementation order

1. Contracts, both copies, verified identical with `diff`.
2. Server pure helpers → route → server tests green.
3. `client/src/components/finding-preview/` (the shared leaf).
4. Trace drawer `FindingsSection` (smallest consumer).
5. PR list: `constants.ts` (GRID + COLUMN_KEYS together) → `FindingsCell` → `PRRow`.
6. `FindingsPanel` helpers → `SeverityFilterBar` → wiring → `FindingCard` `data-severity`.
7. Client tests, e2e, docs.

## Open questions

- **(L01-c) SCORE is single-review while FINDINGS is per-run.** On a
  multi-agent run the list shows one agent's score beside counters covering all
  of them. Aggregating the score (worst? mean?) is a real decision about what
  the ring means, so it was deliberately left out of L01-c rather than folded
  in. Decide before the next change to the list's score column.
  **Resolved 2026-09-27:** neither worst nor mean — the score is recomputed from
  the run's whole finding set, dismissed ones excluded, with a partial-run
  marker. See "SCORE and FINDINGS describe the same run" above.
