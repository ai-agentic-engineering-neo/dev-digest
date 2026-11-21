# e2e — @devdigest/e2e

Deterministic browser e2e for the web app, driven by agent-browser (CDP). No LLM in the loop. Uses **npm**.

## Commands
- `npm test` — runs `tsx run.ts` against an already-running stack (what CI does)
- `npm run e2e:hermetic` — `../scripts/e2e.sh`: isolated Postgres + API + web on alternate ports, then the flows
- `npm run typecheck`

## Map
- `specs/*.flow.json` — the test flows (one user journey each). These are TEST FLOWS, not feature specs.
- `run.ts` — the runner · `lib/assert.ts` — assertions · `agent-browser.json` — browser config

## Gotchas
- Flows assume the seeded demo data (`acme/payments-api`, PR #482, two built-in agents) and that this is the
  ONLY repo — run against a fresh, seeded DB (`e2e:hermetic` does this), not your dev DB.
- Nothing here may call an LLM — flows must stay deterministic.
- `e2e/specs/` breaks the repo's `specs/` = feature-specs convention on purpose; feature specs for e2e-covered
  behaviour live in the owning module's `specs/`.

## Read when
- Adding or changing a flow → read `README.md`.
- Deciding what deserves an e2e flow vs a unit test → read `../TESTING.md`.
- Before starting work here → read `INSIGHTS.md`. When you learn something non-obvious, you MUST record it
  with the `engineering-insights` skill, and check again before finishing the task.
