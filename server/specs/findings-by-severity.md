# findings_by_severity on the PR list

`GET /repos/:id/pulls` → each `PrMeta` carries
`findings_by_severity: { CRITICAL, WARNING, SUGGESTION } | null` — count of
findings in each agent's **latest** `kind='review'` review of the PR (agent-less
reviews count on their own), so re-running an agent replaces its counts instead
of adding to them. Latest-per-agent ids come from the newest-first reviews query
the score already uses; then one grouped query, findings ⨝ reviews. `null` when
the PR has no findings. Covered by `test/reviews.it.test.ts` (incl. a re-run). Contract change is in both vendored
`@devdigest/shared` copies (`contracts/platform.ts › PrMeta`).
