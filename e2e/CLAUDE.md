# e2e — `@devdigest/e2e`, deterministic browser flows

Full description: [README.md](README.md). Project root: [../CLAUDE.md](../CLAUDE.md)

## Commands

- `npm run e2e:hermetic` — recommended: isolated freshly-seeded stack on Postgres `:5433`,
  API `:3101`, web `:3100`; torn down afterwards
- `npm test` — run against an already-running stack (`E2E_BASE_URL`, default `http://localhost:3000`)
- `npm run typecheck`
- One-time setup: `npm i -g agent-browser && agent-browser install`

## Module boundaries

- Depends on: the full running stack (client + server + seeded Postgres) and the agent-browser CLI.
- Nothing depends on e2e.
- Does NOT: call an LLM or need API keys — flows read seeded data only
  (`acme/payments-api`, PR #482, built-in agents).

## Rules

- Executable flows live in `specs/NN-name.flow.json` and are run by `run.ts`.
- Human-readable test plans live in [test-plans/](test-plans/README.md), not in `specs/`.
- Deterministic locators only (`--url`, `--text`, `find role|text|label`); never the AI `chat` command.
- Assume a freshly-seeded DB: flows 02/04/05 fail against a dev DB with other repos.
- Never `docker compose down -v` to reset — it wipes the dev volume.

## Documentation

| When | Read |
|---|---|
| Writing a new flow | [README.md — How a flow works](README.md#how-a-flow-works) |
| Running locally | [README.md — Run locally](README.md#run-locally) |
| What is covered | [README.md — Coverage](README.md#coverage-typological-not-exhaustive) |
| Suite strategy | [../TESTING.md](../TESTING.md) |
| Deeper e2e docs | [docs/](docs/README.md) |
| Planning coverage for a feature | [test-plans/](test-plans/README.md) |

## Insights

@INSIGHTS.md
