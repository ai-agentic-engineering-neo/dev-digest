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

## `/pulls/:number`

Three views over one PR: overview, diff (`Files changed`), findings
(`Agent runs`). Must render even if no review has run yet (empty findings
state, not an error). Running a review must be triggerable from here and
must reflect live progress (SSE), not just a final state after refresh.

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
