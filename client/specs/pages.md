# spec — pages

What each route must show. Behavioral contract, not implementation notes —
see [`../docs/ui-architecture.md`](../docs/ui-architecture.md) for how it's wired.
Cross-check against [`../../e2e/specs/coverage.md`](../../e2e/specs/coverage.md) for
what's actually exercised by browser e2e.

## `/` (root)

Redirects to the first repo's PR list once repos exist; otherwise routes to
`/onboarding`.

## `/repos/:repoId/pulls`

Lists the repo's imported PRs. Each row shows PR number/title and, once
`repo-intel` finishes, the **Indexed** badge — must not block on indexing to
render the list itself.

The **Findings** column shows the latest review's severity breakdown
(`! CRITICAL · ⚠ WARNING · 💡 SUGGESTION`), or `—` when the PR has no review
yet. See [`findings-counters.md`](findings-counters.md) for the counter/popover
contract shared with the PR detail Timeline.

## `/pulls/:number`

Three views over one PR: overview, diff (`Files changed`), findings
(`Agent runs`). Must render even if no review has run yet (empty findings
state, not an error). Running a review must be triggerable from here and
must reflect live progress (SSE), not just a final state after refresh.

The Agent-runs Timeline shows a per-run severity counter under the reviewer's
name for any settled run with a matching review — see
[`findings-counters.md`](findings-counters.md). Within the "Review runs"
section, expanding a run card shows a clickable `N CRITICAL · N WARNING ·
N SUGGESTION` pill row under its verdict/PR SCORE; clicking a pill filters
that card's finding list to one severity (click again to clear) — see
[`findings-counters.md`](findings-counters.md#filter-pills-review-runs).

## `/agents`

Lists built-in (`General`, `Security`) and user-created agents.

## `/agents/:id`

Editor for one agent: model, system prompt, `repo_intel` toggle. Must persist
on save and must not silently drop the toggle state.

## `/settings/:section`

`api-keys` and `models` sections. Must never render a stored secret value —
only whether a key is set.

## `/onboarding`

Add-repository form. Submitting must not require the repo to already be
indexed — indexing happens after import, asynchronously.
