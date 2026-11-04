# e2e/ — `@devdigest/e2e` (agent-browser flows, no LLM)

## Before answering

Search `e2e/docs/`, `e2e/INSIGHTS.md` first. (`e2e/specs/` here = test flows, indexed in `specs/README.md`.)

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

## Naming conventions

- Flow file `specs/NN-kebab-name.flow.json`: two-digit zero-padded, next free number (run order = lexical sort, `run.ts → loadFlows`).
- `name`: one sentence saying what the user sees ("Agents list renders the seeded reviewer agents"); `description`: why + preconditions.
- Step `label`: lowercase phrase of the expectation ("seeded agent card is visible", "switch to the Files changed tab").
- Failure screenshot is auto-named `test-results/<NN-kebab-name>-fail.png` — don't hand-name artifacts.
- Env vars prefixed `E2E_` (`E2E_BASE_URL`, `E2E_STEP_TIMEOUT`, `E2E_PG_PORT`); placeholder in steps is `{BASE}`.
- Runner code: camelCase helpers in `lib/assert.ts` (`resolveArgs`, `stdoutContains`), PascalCase types (`Flow`, `Step`, `FlowResult`).

## Gotchas

- `npm test` against your dev DB fails flows 02/04/05 if other repos exist (home redirects to the first repo).
  Use the hermetic runner.
- Never `docker compose down -v` to reset — it deletes the dev volume.

## Read when

- Writing or debugging a flow → read `README.md`.
- Changing CI for e2e → read `../.github/workflows/e2e-web.yml` and `../scripts/e2e.sh`.
- Deep-dives → read `docs/` · findings → read `INSIGHTS.md`.
