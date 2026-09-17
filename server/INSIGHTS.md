# server insights

Non-obvious lessons learned while working here — what was tried, what didn't
work, and why. One entry per insight (date + short title + a few lines),
newest last. Skip routine changes; only record what would otherwise get
re-discovered the hard way.

## Decisions

### 2026-09-17 · Timeline findings breakdown is a read-time join on `reviews.run_id`, not denormalized onto `agent_runs`
- **Context:** `RunSummary.findings` in `listRunsForPull`; `PrMeta.findings` on `GET /repos/:id/pulls`
- **Insight:** The hover tooltip needs each finding's details (title, file:line, rationale), which counts stored on `agent_runs` can't carry. Stored counts would also go stale when a finding is dismissed and would be missing for old runs. The PR list uses only the latest review, the same one the score comes from. Both surfaces skip dismissed findings. This reverses the older "findings intentionally not surfaced on the list" note that used to be in `routes.ts`.
- **Do:** ALWAYS fold rows through `summarizeFindings` (`modules/reviews/findings-summary.ts`). NEVER add severity-count columns to `agent_runs` for display.
- **Evidence:** `server/src/modules/reviews/repository/run.repo.ts:57`, `server/src/modules/pulls/routes.ts:145`, test "findings breakdown on runs + PR list" in `server/test/reviews.it.test.ts`

## Gotchas & recurring errors

### 2026-09-15 · The server and client copies of `@devdigest/shared` have already drifted apart
- **Context:** any contract change in `server/src/vendor/shared` that also has to reach `client/src/vendor/shared`
- **Insight:** The two vendored copies are not identical: `diff -rq` shows `adapters.ts`, `contracts/{trace,eval-ci,knowledge,productionize}.ts` differ. If you copy a whole file from server over client, you silently pull in (or revert) unrelated changes.
- **Do:** ALWAYS port only the targeted diff of your contract change into the client copy. NEVER overwrite whole files. Run `diff -rq server/src/vendor/shared client/src/vendor/shared` before and after.
- **Evidence:** `diff -rq server/src/vendor/shared client/src/vendor/shared` (5 files differ, 2026-09-15)
