# e2e — `@devdigest/e2e`

Deterministic browser flows for the web app, driven by Vercel **agent-browser** (a Rust +
CDP CLI). No Playwright, no LLM, no API key. Runner: TypeScript on tsx. Uses **npm**.

## Commands
```sh
../scripts/e2e.sh       # recommended: isolated seeded stack (:5433/:3101/:3100), run, tear down
npm test                # against an already-running stack at E2E_BASE_URL (default :3000)
npm run typecheck
npm i -g agent-browser && agent-browser install   # one-time
```

## Map
```
run.ts                     runner: executes each flow's steps in one shared browser session
specs/NN-name.flow.json    one flow = ordered list of agent-browser commands
lib/assert.ts              stdout assertions
test-results/              failure screenshots (git-ignored, uploaded by CI)
```

## Rules
- A flow is JSON, not code: `{ "cmd": [...], "label": "..." }`. `{BASE}` → `E2E_BASE_URL`.
- Assertions are `wait --text` / `wait --url` (a non-zero exit fails the step), plus an
  optional `"assert": { "stdoutIncludes": "…" }`.
- Deterministic locators only: `--url`, `--text`, `find role|text|label`. Never the AI `chat` command.
- Flows are read-only on seeded data (`acme/payments-api`, PR #482, the seeded agents).
  Never submit forms or start a review — that would call an LLM.
- Number new flows sequentially (`08-…`).

## Gotchas
- Flows 02/04/05 assume the seeded repo is the ONLY repo, so they fail against a normal
  dev DB. Use `../scripts/e2e.sh`.
- Flows depend on UI text (`../client/messages/en/*.json`) and seed data
  (`../server/src/db/seed.ts`). Change either → re-run e2e.
- `specs/` here holds the flow files, not feature specs (see `INSIGHTS.md`).

## Do not touch
- Don't "reset" the dev DB with `docker compose down -v` to make flows pass — it deletes
  real data. Use the hermetic runner.

## Read when
- You write a new flow or debug a failing one → `README.md`.
- You touch CI for e2e → `../.github/workflows/e2e-web.yml` and `../TESTING.md`.
- You need design notes for this suite → `docs/`.
- Before a non-trivial change → `INSIGHTS.md`; append what you learn.
