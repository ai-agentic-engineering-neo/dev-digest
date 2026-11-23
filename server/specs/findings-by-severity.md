# findings_by_severity on the PR list

`GET /repos/:id/pulls` → each `PrMeta` carries
`findings_by_severity: { CRITICAL, WARNING, SUGGESTION } | null` — count of
findings across all `kind='review'` reviews of the PR (one grouped query,
findings ⨝ reviews). `null` when the PR has no findings.
Covered by `test/reviews.it.test.ts`. Contract change is in both vendored
`@devdigest/shared` copies (`contracts/platform.ts › PrMeta`).
