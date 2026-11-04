# e2e/ — `@devdigest/e2e` (agent-browser flows, no LLM)

## Before answering

Search `e2e/docs/`, `e2e/INSIGHTS.md` first. (`e2e/specs/` here = test flows, not documentation.)

## Commands (npm, run in `e2e/`)

- One-time: `npm i -g agent-browser && agent-browser install`
- Recommended: `npm run e2e:hermetic` — isolated freshly-seeded stack (Postgres :5433, API :3101, web :3100).
- `npm test` — runs against an already-running stack at `E2E_BASE_URL` (default `http://localhost:3000`).

## Layout

- `specs/NN-name.flow.json` — one flow = ordered list of agent-browser commands. `run.ts` — runner.
- `lib/assert.ts` — optional stdout assertions.

## Rules

- Deterministic locators only: `wait --url`, `wait --text`, `find role|text|label`. NEVER the AI `chat` command.
- Flows read seeded data only (`acme/payments-api`, PR #482, seeded agents) — never trigger a review/LLM call.
- `wait` is the assertion: a step that times out fails the flow. Use `{BASE}` instead of hard-coded hosts.
- New flow: next `NN-` prefix, descriptive `label` on every step.

## Gotchas

- `npm test` against your dev DB fails flows 02/04/05 if other repos exist (home redirects to the first repo).
  Use the hermetic runner.
- Never `docker compose down -v` to reset — it deletes the dev volume.

## Read when

- Writing or debugging a flow → read `README.md`.
- Changing CI for e2e → read `../.github/workflows/e2e-web.yml` and `../scripts/e2e.sh`.
- Deep-dives → read `docs/` · findings → read `INSIGHTS.md`.
