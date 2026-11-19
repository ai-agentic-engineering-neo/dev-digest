# e2e — `@devdigest/e2e`

## Map

| Path | What |
|------|------|
| `run.ts` | runner: executes each flow's agent-browser commands in one browser session |
| `lib/assert.ts` | step result types + stdout assertions |
| `flows/NN-name.flow.json` | the test flows (picked up by the `.flow.json` suffix) |
| `agent-browser.json` | agent-browser CLI config |
| `../scripts/e2e.sh` | isolated stack: fresh Postgres + API + web, runs flows, tears down |
| `specs/` | feature specifications for this module — not test flows |

## Stack (e2e-only)

npm (`package-lock.json`) · Vercel agent-browser CLI (installed globally, drives Chrome over CDP) · tsx.

## Conventions

- Deterministic locators only: `wait --url`, `wait --text`, `find role|text|label`. A failing command is the assertion.
- Flows read seeded data only (`acme/payments-api`, PR #482, built-in agents), so no model call ever happens.
- Flow files are numbered `NN-name.flow.json`; run order is filename order.

## Gotchas

- Flows assume a freshly seeded DB with the demo repo as the only repo. Run them with `../scripts/e2e.sh` (ports 5433 / 3101 / 3100), which leaves the dev DB untouched.
- Reset data with the isolated runner; `docker compose down -v` wipes the dev volume.
- Failure screenshots land in `test-results/` (git-ignored, uploaded as a CI artifact).

## Pointers

- Read when writing a flow, running e2e locally or tuning env knobs: [README.md](README.md)
- Read when you need the overall test strategy: [../TESTING.md](../TESTING.md)
- Read when you need design notes or how-tos for this module: [docs/](docs/)
- Read when implementing or changing a feature here: [specs/](specs/)
- Read before starting work here and update at the end of the task, via the `engineering-insights` skill: [INSIGHTS.md](INSIGHTS.md)
