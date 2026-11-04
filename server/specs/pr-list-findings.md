# PR list findings summary — server (+ shared contracts)

Client half: [../../client/specs/pr-list-findings.md](../../client/specs/pr-list-findings.md).

## Goal

`GET /repos/:id/pulls` returns, per PR, what its **latest review** found: per-severity counts and a few
short finding cards for the list's FINDINGS column and hover popover. Computed on read; no migration,
no model calls, no N+1.

## Scope

### Shared contracts — BOTH copies (`server/src/vendor/shared`, `client/src/vendor/shared`)
Edit approved by the user (2026-11-04). `contracts/platform.ts`, `PrMeta` (list endpoint only, like `score`):
```ts
findings: z.object({
  critical: z.number().int(), warning: z.number().int(), suggestion: z.number().int(),
  top: z.array(z.object({ severity: Severity, title: z.string(), file: z.string(), start_line: z.number().int() })),
}).nullish()
```
`null` = PR never reviewed. Both copies must stay byte-identical for this file.

### Route — `src/modules/pulls/routes.ts` (`GET /repos/:id/pulls`)
- "Latest review" = newest `reviews` row with `kind = 'review'` per PR — the same row that feeds `score`
  (its `id` is now kept in `latestReviewByPr`).
- One extra IN-query: `findings` where `review_id IN (latest review ids)` and `dismissed_at IS NULL`.
- `findings = { ...rollupSeverities(rows), top: topFindings(rows) }`, or `null` without a review.

### Pure helpers — `src/modules/pulls/status.ts`
- `rollupSeverities` (already existed, previously unused) → lower-cased counts.
- `topFindings(rows, limit = FINDINGS_PREVIEW_LIMIT /* 5 */)` — drops unknown severities, sorts by
  severity (CRITICAL → SUGGESTION) then confidence desc, maps to the contract shape (`start_line`).

## Out of scope
- Findings across all agents' reviews (latest review only).
- Denormalizing counts onto `pull_requests` / `agent_runs`.

## Acceptance criteria
1. List items carry `findings` (`null` when unreviewed); counts exclude dismissed findings.
2. `top` ≤ 5, most severe first, then most confident.
3. Query count per list request grows by at most one.
4. `test/pulls-status.test.ts` covers `topFindings` (order, cap, unknown severity, empty);
   `tsc --noEmit` green; `contracts`/`routes-smoke` tests pass.
