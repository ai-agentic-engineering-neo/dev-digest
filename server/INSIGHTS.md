# server insights

Non-obvious lessons learned while working here — what was tried, what didn't
work, and why. One entry per insight (date + short title + a few lines),
newest last. Skip routine changes; only record what would otherwise get
re-discovered the hard way.

## Gotchas & recurring errors

### 2026-09-15 · The server and client copies of `@devdigest/shared` have already drifted apart
- **Context:** any contract change in `server/src/vendor/shared` that also has to reach `client/src/vendor/shared`
- **Insight:** The two vendored copies are not identical: `diff -rq` shows `adapters.ts`, `contracts/{trace,eval-ci,knowledge,productionize}.ts` differ. If you copy a whole file from server over client, you silently pull in (or revert) unrelated changes.
- **Do:** ALWAYS port only the targeted diff of your contract change into the client copy. NEVER overwrite whole files. Run `diff -rq server/src/vendor/shared client/src/vendor/shared` before and after.
- **Evidence:** `diff -rq server/src/vendor/shared client/src/vendor/shared` (5 files differ, 2026-09-15)
