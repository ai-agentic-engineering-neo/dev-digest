# e2e — @devdigest/e2e

Deterministic browser flows via Vercel agent-browser CLI (not Playwright). No LLM, no API key. npm · tsx · ESM
How flows work and how to run them: [README.md](README.md) · root rules: [../CLAUDE.md](../CLAUDE.md)

## Commands
- Hermetic (use this): `npm run e2e:hermetic` — isolated stack on Postgres :5433, API :3101, web :3100
- `npm test` — runs against your dev stack; fails if the dev DB holds repos other than the seeded one
- `npm run typecheck`

## Map
- `specs/NN-name.flow.json` — executable test flows (NOT written specifications)
- `design-specs/` — written specifications for e2e coverage (name differs on purpose)
- `run.ts` runner · `lib/` helpers

## Conventions
- Flows target read-only seeded data only (`acme/payments-api`, PR #482). Nothing may trigger a model call.
- Locators: `--url`, `--text`, `find role|text|label`. Never the AI `chat` command.
- `wait --text` / `wait --url` are the assertions.

## Gotchas
- Flows assume a freshly seeded DB (flow 02 follows the redirect to the first repo).
- Never `docker compose down -v` to reset: it deletes the dev DB volume.

## Docs (linked, open when relevant)
[docs/](docs/) · [design-specs/](design-specs/) · [INSIGHTS.md](INSIGHTS.md)
