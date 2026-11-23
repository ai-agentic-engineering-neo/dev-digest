# e2e — CLAUDE.md

`@devdigest/e2e`: deterministic browser flows over the real stack via the agent-browser CLI, npm. No Playwright, no LLM, no API keys.

## Commands (`cd e2e`)
```sh
npm i -g agent-browser && agent-browser install   # once
npm run e2e:hermetic   # = ../scripts/e2e.sh: isolated stack (PG :5433, API :3101, web :3100). Preferred.
npm test               # against an already-running stack (E2E_BASE_URL, default http://localhost:3000)
npm run typecheck
```

## Map
`specs/NN-name.flow.json` (flows) · `run.ts` (runner, picks up `*.flow.json` only) · `lib/assert.ts`

## Conventions
- A flow = JSON list of agent-browser commands; `{BASE}` is replaced with `E2E_BASE_URL`.
- `wait --text` / `wait --url` are the assertions; optional `"assert": { "stdoutIncludes": "…" }`.
- Deterministic locators only (`--url`, `--text`, `find role|text|label`). Never use the AI `chat` command.
- Flows target read-only seeded data (`acme/payments-api`, PR #482, seeded agents); nothing may trigger a model call.

## Gotchas
- Flows assume a freshly seeded DB with only the demo repo. Against a dev DB with other repos, flows 02/04/05 fail → use the hermetic runner.
- Seed changes in `server/src/db/seed.ts` can break flows; rerun e2e after touching the seed.

## Read when
- Read `README.md` before writing or debugging a flow.
- Read `../TESTING.md` for what e2e should (and shouldn't) cover.
- Read `docs/` for e2e reference that doesn't fit the README.
- Read `INSIGHTS.md` before any work in this package (root Insights protocol); add entries only via the `engineering-insights` skill.
