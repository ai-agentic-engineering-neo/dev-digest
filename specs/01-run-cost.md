# Run Cost

**Status:** agreed
**Packages touched:** server, client

## Problem

Every review run already has a dollar cost: OpenRouter returns the real
`usage.cost`, and for OpenAI/Anthropic `estimateCost()` derives it from
`usage.prompt_tokens`/`completion_tokens` and the price book. The server
computes that number and discards it, so nobody can answer "what did
reviewing this PR cost". Cost is the one number that makes the model-choice
tradeoff (fast/cheap vs. thorough/expensive) legible.

## Scope — in / out

**In**
- Persist per-run USD cost on `agent_runs`.
- Surface it on three screens:
  1. Pull Requests list — a COST column showing the latest completed run.
  2. PR detail timeline — `9,119 tok · $0.0013` under the run's timestamp.
  3. Agent run drawer — a COST tile in Stats, beside DURATION / TOKENS / FINDINGS.

**Out**
- Budgets, alerts, caps, or any spend-limiting behaviour.
- Aggregation across PRs, repos, or time (that is the Agent Performance screen).
- Cost on the verdict banner or the review accordion.
- Any new model call, or a second pricing source. Display only.
- Backfill of historical runs — rows written before this change stay `NULL`.

## Contract changes

`@devdigest/shared` — **both physical copies in the same commit**
(`server/src/vendor/shared/` and `client/src/vendor/shared/`):

- `contracts/trace.ts` → `RunSummary.cost_usd: z.number().nullable()`
- `contracts/trace.ts` → `RunStats.cost_usd: z.number().nullish()`
  (`nullish`, not `nullable`: already-persisted `run_traces` jsonb documents
  have no such key and must keep parsing.)
- `contracts/platform.ts` → `PrMeta.cost_usd: z.number().nullish()`
  (list endpoint only, mirroring the existing `score` field)

DB: `agent_runs.cost_usd double precision` (nullable), new migration.

## Acceptance criteria

1. A completed run persists its cost; `GET /pulls/:id/runs` returns it as
   `cost_usd`.
2. The PR list shows the latest `status='done'` run's cost; a PR with no
   completed run shows `—`.
3. The timeline row of a settled run shows total tokens and cost; a running
   run shows neither.
4. The run drawer's Stats row shows a COST tile.
5. **Unknown cost renders `—`, never `$0.00`.** A null cost means "the
   provider reported no usage/pricing", not "free". `$0.00` is reserved for a
   genuinely zero-priced model.
6. Sub-cent costs stay readable: `$0.0013`, not `$0.00`.
7. Zero additional model calls — the numbers come from the run row.

## Open questions

None outstanding. Seed data intentionally contains no `agent_runs` row, so
all three surfaces show `—` on a freshly seeded database until a real review
runs; this is accepted, not a defect.
