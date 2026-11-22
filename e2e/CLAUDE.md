# e2e — `@devdigest/e2e` (agent-browser flows)

## Commands
- Preferred: `./scripts/e2e.sh` from repo root — isolated, freshly seeded stack
  (Postgres :5433, API :3101, web :3100), dev DB untouched
- Against a running stack: `cd e2e && npm test` (needs a freshly seeded DB)
- Requires `agent-browser` CLI: `npm i -g agent-browser && agent-browser install`

## Layout
- `specs/NN-name.flow.json` — one flow = ordered list of agent-browser commands
- `run.ts` — runner; `lib/assert.ts` — stdout assertions

## Conventions
- Deterministic locators only (`--url`, `--text`, `find role|text|label`); never `chat`.
- `wait --text` / `wait --url` are the assertions (non-zero exit fails the step).
- Flows use read-only seeded data (`acme/payments-api`, PR #482, seeded agents) — no LLM calls.
- `{BASE}` in a command is replaced by `E2E_BASE_URL`.

## Gotchas
- Flows 02/04/05 assume the seeded repo is the only one — they fail on a dev DB
  with other imported repos. Use the hermetic runner.

## Read when relevant
README.md (flow format, env vars) · INSIGHTS.md
