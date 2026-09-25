# e2e — `@devdigest/e2e`

Deterministic browser flows over the web app, driven by Vercel agent-browser
(a CDP CLI). No Playwright, no LLM, no API key. Details and coverage table:
`README.md`.

## Commands (npm)

```sh
npm i -g agent-browser && agent-browser install   # once
npm test               # tsx run.ts against a running stack
npm run e2e:hermetic   # ../scripts/e2e.sh: isolated stack on :5433/:3101/:3100
npm run typecheck
npm run lint           # eslint .
```

## Layout

- `specs/NN-name.flow.json` — one flow = ordered agent-browser commands. `{BASE}` expands to `E2E_BASE_URL`.
- `run.ts` — runner. `lib/assert.ts` — stdout assertions.
- `test-results/` — failure screenshots, git-ignored, uploaded by CI.

## Conventions

- Locators are deterministic only: `wait --url`, `wait --text`, `find role|text|label`. Never the AI `chat` command.
- Flows target seeded read-only data (`acme/payments-api`, PR #482, seeded agents). Nothing triggers a model call.
- Flows assume a freshly seeded DB with one repo. Use the hermetic runner locally. Never reset the dev DB with `docker compose down -v`.
- New flow: next `NN-` prefix, then add a row to the coverage table in `README.md`.

## Read when relevant

- `docs/runner.md`: how `run.ts` runs a flow, the command families, hermetic runner vs CI.
- `specs/flows.md`: the per-flow contract, seeded facts and locators each flow depends on. Read before adding or editing a flow.
- `INSIGHTS.md`: gotchas, e.g. why flows fail against a dev DB with extra repos.
- `../TESTING.md`: where this suite sits among the other packages' suites.
