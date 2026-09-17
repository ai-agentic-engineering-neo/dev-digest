# Findings read model (severity counts and previews)

The PR list's FINDINGS column and the Timeline's severity badges are computed
**on read** from the `findings` table. Nothing is denormalized onto
`agent_runs`. For why, see the decision "Timeline findings breakdown is a
read-time join…" in [`../INSIGHTS.md`](../INSIGHTS.md).

## The fold

`summarizeFindings` (`src/modules/reviews/findings-summary.ts:57`) is a pure
function. It takes rows shaped as `{ key, ...findingSummaryColumns }` and
returns `Map<key, FindingsSummary>`:

- `counts`: `{ CRITICAL, WARNING, SUGGESTION }`, always all three keys
  (`emptyFindingsSummary`, `:47`).
- `items`: previews sorted by severity, then by confidence (highest first)
  (`:79`).
- It **skips dismissed findings** (`dismissedAt != null`, `:60`) and any row
  whose severity isn't one of the three known values.
- It truncates `rationale` to `RATIONALE_PREVIEW_MAX = 240` characters
  (`:14`), so the list payload never carries full markdown for every finding.

The caller chooses what `key` means. Pass the grouping column into `select`
and reuse `findingSummaryColumns`; don't write a second fold.

## The two callers

| Surface | Key | Which findings | Code |
| --- | --- | --- | --- |
| `GET /repos/:id/pulls` → `PrMeta.findings` | `findings.review_id` | only the **latest** `kind='review'` review per PR, the same review the score ring uses | `src/modules/pulls/routes.ts:130`–`154` |
| `GET /pulls/:id/runs` → `RunSummary.findings` | `reviews.run_id` | each run's own review (inner join `findings` → `reviews`) | `src/modules/reviews/repository/run.repo.ts:60` |

Each surface costs one `IN (...)` query plus a JS fold. There are no N+1
queries.

### What `null` means

- **PR list:** `findings: null` means the PR has no review yet. An empty summary
  (all zeros) means it was reviewed and nothing is open.
- **Timeline:** a `done` run without findings gets an empty summary. Runs that
  are `running`, `failed` or `cancelled` get `null` (`run.repo.ts:89`). The
  client uses this to choose between "—" and "no badge".

## Consequences worth knowing

- **The PR list is not a sum across agents.** If two agents reviewed a PR, the
  list shows only the newest review. Open the PR to see the others.
- **Dismissing a finding changes these counts, but the "Review runs" cards on
  the PR page keep showing it** (greyed out). Those cards read
  `GET /pulls/:id/reviews`, which returns every finding with `dismissed_at`
  set. Counts in the two places can legitimately differ.
- Accepted findings are **not** excluded; only dismissal hides a finding.
- The seed (`src/db/seed.ts`) inserts a review with findings but **no
  `agent_runs` row**. On a freshly seeded DB the PR list shows severity badges
  for PR #482, while the Timeline is empty and the cost is "—".

## Tests

- Pure fold: `test/findings-summary.test.ts` (hermetic).
- Both endpoints against Postgres: "findings breakdown on runs + PR list:
  latest review, dismissed excluded" in `test/reviews.it.test.ts`.
