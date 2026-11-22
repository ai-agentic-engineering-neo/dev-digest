# e2e — @devdigest/e2e

## Stack
agent-browser CLI (global: `npm i -g agent-browser && agent-browser install`) · tsx ·
TypeScript 5.7 · npm. No Playwright, no LLM, no API keys.

## Commands
- `npm run e2e:hermetic` — RECOMMENDED: isolated fresh stack (PG :5433, API :3101, web :3100)
- `npm test` — against an already running stack (`E2E_BASE_URL`, default :3000)
- `npm run typecheck`

## Map
- `specs/NN-name.flow.json` — flows = ordered agent-browser commands. These ARE the
  e2e specs (executable); there is no separate feature-spec folder here.
- `run.ts` — runner · `lib/` — helpers

## Conventions
- `wait --text` / `wait --url` ARE the assertions; optional `assert.stdoutIncludes`.
- Deterministic locators only (`--url`, `--text`, `find role|text|label`); never the AI `chat` command.
- Flows are read-only against seeded data (`acme/payments-api`, PR #482, seeded agents).

## Gotchas
- `npm test` against your dev DB fails flows 02/04/05 (they assume the seeded repo is the only one).
- NEVER `docker compose down -v` to "reset" — it wipes the dev DB volume.

## Read when
| When | Read |
|---|---|
| Flow format, running locally/CI | `README.md` |
| Test strategy | `../TESTING.md` |
| Deep reference | `docs/` |
| Before non-trivial changes | `INSIGHTS.md` |
