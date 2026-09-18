# specs — DevDigest

Specs / acceptance criteria that span more than one package.

## Findings by severity — cross-package contract

See `client/specs/README.md` and `server/specs/README.md` for the UI and
API/DB sides respectively. The cross-package contract that must not drift:

- The wire shape is `FindingsBySeverity = { CRITICAL: number; WARNING:
  number; SUGGESTION: number }`, defined once in
  `{server,client}/src/vendor/shared/contracts/platform.ts` (kept
  byte-identical by hand — no re-vendor tooling exists in this checkout;
  `diff` the two files after any edit).
- `PrMeta.findings_by_severity` is `.nullish()`: **absent** when the PR has
  no review yet, **present and all-zero** when a review exists but found
  nothing, **present with real counts** otherwise. Never conflate "no review"
  with "reviewed, nothing found" — they're different states.
- Counting is always a plain `COUNT`/`filter` grouping of already-persisted
  `findings.severity` — no new LLM call, ever, at read time or on filter
  toggle.

## Cost (`PrMeta.cost_usd`) — cross-package contract

- Server: sum of `agent_runs.cost_usd` across every row with
  `status = 'done'` for the PR, all-time (not scoped to one review or one
  "Run Review" click's batch). Runs with unknown cost are skipped, never
  treated as $0. `cost_usd` is `undefined` (omitted) when the PR has zero
  runs at all, `null` when it has runs but none successful/costed, and a
  number otherwise.
- Client: `RunCostBadge` renders `—` for `null`, nothing for `undefined`
  (no runs → no badge at all is a deliberate UI acceptance criterion, not a
  missing-data placeholder).

## Accept / Dismiss — cross-package contract

- Server: `POST /findings/:id/accept` and `POST /findings/:id/dismiss`
  (`server/src/modules/reviews/routes.ts`) are mutually exclusive — setting
  one always clears the other's timestamp (`findings.acceptedAt` /
  `findings.dismissedAt`). Re-sending the same action on an
  already-accepted/dismissed finding is a harmless idempotent no-op.
- Client: the current-state button (whichever matches `accepted_at`/
  `dismissed_at`) is `disabled` (a real HTML attribute, not just styled) and
  shows a blue border; the other button stays enabled so the state can be
  switched. See `client/specs/README.md` for the full visual-state table.
