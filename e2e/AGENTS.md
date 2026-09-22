# e2e — `@devdigest/e2e`

## Commands (npm)
- Recommended: `./scripts/e2e.sh` (from repo root) — isolated, freshly seeded
  stack on :5433 / :3101 / :3100, torn down afterwards.
- `npm test` — runs against an already running stack (`E2E_BASE_URL`, default :3000).
- `npm run typecheck` · `npm run lint`
- One-time: `npm i -g agent-browser@0.27.0 && agent-browser install` (CI pins 0.27.0)

## Read when
- Adding or editing a flow → read `README.md` (flow format, env knobs, coverage table)
- Deciding what deserves an e2e flow → read `../TESTING.md`
- Implementing a planned feature → look for its spec in `specs/`
- Start of every task here → read `INSIGHTS.md` first; at the end → `engineering-insights` wrap-up

## Conventions (non-default)
- `flows/NN-name.flow.json` = browser test flows; they run in lexical order in
  one shared browser session. `specs/` = feature specs, **not** tests.
- `wait --url` / `wait --text` are the assertions. Locators are deterministic only
  (`--url`, `--text`, `find role|text|label`); never the AI `chat` command.
- Flows read seeded data (`acme/payments-api`, PR #482, built-in agents). Flows
  that write/start a review declare `"requiresEnv": "E2E_MOCK_LLM"` and run only
  on the hermetic stack (API on `LLM_PROVIDER_OVERRIDE=mock`); never a real model.

## Gotchas
- `npm test` against your dev DB fails flows 02/04/05 if it has more than the
  seeded repo — use `./scripts/e2e.sh`.
- Uppercased labels, the `<main>` scroll container and late layout shifts break
  naive `wait --text` / `click` steps — see README "Gotchas when writing flows".
- Failure screenshots land in `test-results/` (git-ignored, uploaded by CI).

## Do not touch
- Never `docker compose down -v` to get a clean DB — use the hermetic runner.
