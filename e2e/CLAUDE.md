# e2e — `@devdigest/e2e`

## Commands (npm)
- Recommended: `./scripts/e2e.sh` (from repo root) — isolated, freshly seeded
  stack on :5433 / :3101 / :3100, torn down afterwards.
- `npm test` — runs against an already running stack (`E2E_BASE_URL`, default :3000).
- `npm run typecheck`
- One-time: `npm i -g agent-browser && agent-browser install`

## Read when
- Adding or editing a flow → read `README.md` (flow format, env knobs, coverage table)
- Deciding what deserves an e2e flow → read `../TESTING.md`
- Implementing a planned feature → look for its spec in `specs/`
- Before any change → read `INSIGHTS.md` (high-confidence guidance; append via `/engineering-insights`)

## Conventions (non-default)
- `flows/NN-name.flow.json` = browser test flows; they run in lexical order in
  one shared browser session. `specs/` = feature specs, **not** tests.
- `wait --url` / `wait --text` are the assertions. Locators are deterministic only
  (`--url`, `--text`, `find role|text|label`); never the AI `chat` command.
- Flows read seeded data only (`acme/payments-api`, PR #482, built-in agents):
  no writes, no model calls.

## Gotchas
- `npm test` against your dev DB fails flows 02/04/05 if it has more than the
  seeded repo — use `./scripts/e2e.sh`.
- Failure screenshots land in `test-results/` (git-ignored, uploaded by CI).

## Do not touch
- Never `docker compose down -v` to get a clean DB — use the hermetic runner.
