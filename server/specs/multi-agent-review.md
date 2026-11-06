# Multi-Agent Review — server

Client half (the page itself): [../../client/specs/multi-agent-review.md](../../client/specs/multi-agent-review.md).

This is the only server change in the feature. It follows client decision Q-d (accepted
2026-11-06): pre-run estimates come from recent runs across the workspace.

## Goal

Before running a multi-agent review, the client can show each agent's expected time and cost,
based on that agent's recent completed runs in the workspace.

## Scope

- New read route **`GET /agents/run-estimates`**. No body and no params, workspace from
  `getContext`.
- Response `{ estimates: AgentRunEstimate[] }`, where
  `AgentRunEstimate = { agent_id: string, sample_size: number, avg_duration_ms: number,
  avg_cost_usd: number | null }`.
- For each agent of the workspace, take its last `ESTIMATE_SAMPLE_SIZE = 5` `agent_runs` with
  `status = 'done'`, ordered by `ran_at`/created time descending, across all PRs.
  - `avg_duration_ms` = rounded mean of `duration_ms`.
  - `avg_cost_usd` = mean of the non-null `cost_usd` values, or `null` when all are null.
- Agents with 0 done runs are **omitted**, not returned with zeros.
- The DTO lives module-local (`modules/reviews/domain.ts` or `modules/agents/domain.ts`, whichever
  module owns the query; `agent_runs` is read through the reviews repository today). It is
  mirrored in `client/src/lib/types.ts`. **No edit to `src/vendor/shared/**`, no migration.**
- Onion: route → service → repository. Drizzle stays in the repository. Every query filters on
  `workspaceId`. The architecture check adds no new violations.
- `/agents/run-estimates` must not be captured by `GET /agents/:id`. Fastify's static route wins;
  a route test proves it.

### Out of scope
- Any change to `POST /pulls/:id/review`, `RunRequest`, the executor or the rate limit.
- A server-side multi-agent run entity, `POST /pulls/:id/multi-agent-run`, or computing conflicts
  on the server.
- Agent color/icon columns.

## Acceptance criteria

1. `GET /agents/run-estimates` returns 200 with
   `{ estimates: [...] }`, one entry per agent that has ≥1 `done` run.
2. An agent with 7 done runs → `sample_size = 5`, and the averages use only the 5 newest.
3. Runs with status `failed`, `cancelled` or `running` are ignored. An agent that has only such
   runs is omitted.
4. `avg_cost_usd` averages only non-null costs. If all 5 are null → `null`.
5. Runs and agents of another workspace never appear (integration test with two workspaces).
6. `GET /agents/<uuid>` still returns the agent, and `/agents/run-estimates` is not parsed as an
   id (route test via `app.inject`).
7. Unit test for the averaging helper (empty input, mixed null costs, rounding). Integration test
   `*.it.test.ts` for the repository query.
8. `tsc --noEmit`, the unit tests and `node scripts/check-architecture.mjs` pass. No file under
   `src/vendor/shared/` or `src/db/migrations/` changes.
