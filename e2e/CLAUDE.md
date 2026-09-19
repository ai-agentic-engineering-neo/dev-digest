# e2e — CLAUDE.md

## Stack

Vercel **agent-browser** (Rust + CDP) — not Playwright, no LLM, no keys.
Details — [README](./README.md).

## Commands

`./scripts/e2e.sh` (hermetic, recommended — an isolated stack on ports
5433/3101/3100) · `npm test` (against an already-running `./scripts/dev.sh`,
only if the dev DB contains ONLY seeded data)

## Map

- `specs/NN-name.flow.json` — a test flow: a list of agent-browser commands,
  run in order (this is a TEST flow, not to be confused with `docs/specs/`
  below)
- `run.ts` — the runner, reads flow files and executes steps against a shared
  browser session
- Locators are deterministic only (`--url`, `--text`, `find role|text|label`);
  the AI `chat` command is NOT used

## Non-default conventions

- Each `cmd` in a flow file is a direct agent-browser call; `wait --text`/
  `wait --url` double as both a step and an assertion (non-zero exit = fail).
- `{BASE}` in flow files is substituted from `E2E_BASE_URL`.

## Gotchas

- Flows `02`/`04`/`05` rely on the seeded repo `acme/payments-api` being the
  ONLY repo in the DB. Against a normal dev DB (which has other imported
  repos) they fail — that's why the hermetic runner is the default.
- **Never run `docker compose down -v`** to "reset" — it deletes the
  `devdigest_pgdata` volume along with every real repo and review, not just
  e2e data.

## Do-not-touch

- Don't add AI `chat` commands to a flow — it would break determinism and the
  key-free nature of the suite.

## Read when

- Need the full suite description, runner env vars → read [README.md](./README.md).
- Planning a new flow → start with [docs/specs/](./docs/specs/) (feature
  specs; do NOT confuse with `specs/` above — that's already-built test
  flows), then write `specs/NN-name.flow.json`.
- Need deeper notes that don't belong in this file → [docs/](./docs/).
- Need to see how e2e fits into the overall pipeline → read [../docs/architecture.md](../docs/architecture.md).
- Before changing something non-trivial — check whether we've already hit this wall → [INSIGHTS.md](./INSIGHTS.md).
