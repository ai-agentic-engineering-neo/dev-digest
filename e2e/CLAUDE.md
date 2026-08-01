# `@devdigest/e2e` — agent guide

Deterministic browser flows for the web app, driven by Vercel **agent-browser** (Rust +
CDP). No Playwright, no LLM, no API key.

## Before answering

Curated docs here today: `INSIGHTS.md` (this package's traps), `README.md` (flow
format, runners, env knobs, coverage table), `specs/` — the flows themselves are the
spec, so read them before reading `run.ts` — and the root `../INSIGHTS.md` for
anything crossing packages. No `docs/` in this package yet.

## Conventions (not obvious from code)

- **A test is data, not code.** Each flow is `specs/NN-name.flow.json`: a named list of `{ cmd, label }` steps passed verbatim to the `agent-browser` CLI, run in order against one shared session by `run.ts`.
- **The waits *are* the assertions.** A non-zero exit fails the step and the flow, so `wait --url` / `wait --text` carry the assertion. Optional `"assert": { "stdoutIncludes": … }` adds a substring check.
- **Deterministic locators only** — `--url`, `--text`, `find role|text|label`. Never use the AI `chat` command; that is what keeps runs stable and key-free.
- **Flows must target seeded, read-only data** (`acme/payments-api`, PR #482, the seeded agents). Nothing may trigger a model call.
- **`{BASE}` is substituted** with `E2E_BASE_URL` (default `http://localhost:3000`).
- **A freshly-seeded DB is a precondition.** Flows 02/04/05 follow the home redirect to the *first* repo, so they assume the demo repo is the only one. Run `../scripts/e2e.sh` (isolated stack on :5433/:3101/:3100) rather than pointing at your dev stack.
- **Never `docker compose down -v` to "reset"** — `-v` deletes the `devdigest_pgdata` volume and every repo and review you've imported.

## Do-not-touch

- `test-results/` — failure screenshots, git-ignored, uploaded as a CI artifact.

## Use when

- Flow format, env knobs, coverage table, install steps → `README.md`
- Where this suite sits among the others → `../TESTING.md`
- What a screen is supposed to render → `../client/README.md`
