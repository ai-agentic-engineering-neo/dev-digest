# e2e (`@devdigest/e2e`) — instructions for Claude

Deterministic browser flows driven by Vercel **agent-browser** (a CLI, not Playwright).
No LLM, no API key. Source of truth: `e2e/README.md`.

## Commands

- Hermetic run (recommended): `pnpm e2e:hermetic` (runs `../scripts/e2e.sh`). It boots an isolated, freshly seeded stack on alternate ports (Postgres :5433, API :3101, web :3100) and tears it down afterwards.
- Run flows against an already running stack: `pnpm test` (`tsx run.ts`)
- Typecheck: `pnpm typecheck`
- One-time setup: `npm i -g agent-browser && agent-browser install`

## Rules

- Each flow is `specs/NN-name.flow.json`: an ordered list of agent-browser `cmd` arrays. `{BASE}` is replaced with `E2E_BASE_URL`.
- Assertions are `wait --text` / `wait --url`, or an optional `assert.stdoutIncludes`. Locators must be deterministic (`--url`, `--text`, `find role|text|label`). **Never** use the AI `chat` command.
- Flows target read-only seeded data (`acme/payments-api`, PR #482, the built-in agents). Don't add flows that trigger a model call.
- Flows assume a freshly seeded DB. **Prefer the hermetic runner**; running `pnpm test` against a dev DB with extra imported repos makes flows 02, 04 and 05 fail.
- Never run `docker compose down -v` to reset the dev DB. It deletes the `devdigest_pgdata` volume with all real data.
- Scope is the main user journeys only (see `TESTING.md`). Don't use e2e to cover edge cases that unit or integration tests can cover.
