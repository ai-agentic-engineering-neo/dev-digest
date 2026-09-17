# `@devdigest/e2e` — browser end-to-end suite

Deterministic UI flows for the web app, driven by
[Vercel **agent-browser**](https://github.com/vercel-labs/agent-browser) — a
native (Rust + CDP) browser-automation CLI. **No Playwright, no LLM, no API key.**

agent-browser is a CLI, not a test framework, so this package adds a thin
convention: each flow is a JSON list of agent-browser commands, run in order
against one shared browser session by `run.ts`.

## Quick start

```sh
# install the agent-browser CLI once (downloads Chrome for Testing)
npm i -g agent-browser && agent-browser install

# recommended: isolated, freshly-seeded stack (Postgres :5433, API :3101, web :3100)
./scripts/e2e.sh            # from the repo root
```

The hermetic runner is safe to use while your normal dev stack is up — it never
touches your dev database or the `devdigest_pgdata` volume.

```sh
# alternative: against a stack you already run
./scripts/dev.sh            # Postgres + API :3001 + web :3000 (seeded)
cd e2e && npm install && npm test
```

> ⚠️ **Precondition: a freshly-seeded database.** Flows `02`, `04`, and `05`
> follow the home redirect to the *first* repo, so they assume the seeded demo
> repo is the only one. A dev database with real imports makes them land on the
> wrong repo and fail — use the hermetic runner instead. And never
> `docker compose down -v` to "reset" your dev DB: `-v` deletes the
> `devdigest_pgdata` volume along with every repo and review you imported.

Env knobs — runner: `E2E_BASE_URL`, `AGENT_BROWSER_BIN` (default
`agent-browser`), `E2E_STEP_TIMEOUT` (ms, default 60000). Hermetic stack
(`scripts/e2e.sh`): `E2E_PG_PORT` (5433), `E2E_API_PORT` (3101), `E2E_WEB_PORT`
(3100), `E2E_PG_CONTAINER` (`devdigest-e2e-postgres`), `E2E_PG_IMAGE`
(`pgvector/pgvector:pg16`).

Failure screenshots are written to `e2e/test-results/` (git-ignored; uploaded as
a CI artifact by `.github/workflows/e2e-web.yml`).

## Where to read next

| Topic | Document |
|-------|----------|
| Map, conventions, gotchas, do-not-touch zones | [CLAUDE.md](CLAUDE.md) |
| Non-obvious findings recorded while working here | [INSIGHTS.md](INSIGHTS.md) |
| How the harness executes flows, determinism rules, the hermetic stack | [docs/runner.md](docs/runner.md) |
| Flow file format, rules for a new flow, coverage table | [specs/README.md](specs/README.md) |
| Test strategy across all packages | [../TESTING.md](../TESTING.md) |
