# e2e — @devdigest/e2e (agent-browser UI flows)

## Commands
- Recommended: `./scripts/e2e.sh` from repo root — isolated freshly-seeded stack on ports 5433/3101/3100, torn down after
- Against a running stack: `npm test` (= `tsx run.ts`) · `npm run typecheck`
- One-time: `npm i -g agent-browser && agent-browser install`

## Map
- `specs/NN-name.flow.json` — one flow = ordered list of agent-browser commands
- `run.ts` — runs flows in one browser session · `lib/assert.ts` — stdout assertions

## Conventions
- `wait --text` / `wait --url` ARE the assertions (non-zero exit fails the step).
- Deterministic locators only (`--url`, `--text`, `find role|text|label`). Never the AI `chat` command.
- Flows use read-only seeded data (`acme/payments-api`, PR #482, seeded agents) — no LLM calls.

## Gotchas
- Flows 02/04/05 assume the seeded repo is the ONLY repo; running `npm test` against a dev DB with other repos fails them.
- `specs/` here holds test flows, not feature specs — feature specs for e2e go in [docs/](docs/).

## Deeper
[README.md](README.md) · [INSIGHTS.md](INSIGHTS.md) · [docs/](docs/)
