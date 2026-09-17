# CLAUDE.md — `@devdigest/e2e`

Deterministic browser end-to-end flows for the web app, driven by Vercel **agent-browser** (Rust + CDP CLI). No Playwright, no LLM, no API key.

Package overview → [README.md](README.md) · runner detail → [docs/runner.md](docs/runner.md) · flow format and coverage → [specs/README.md](specs/README.md) · hard-won findings → [INSIGHTS.md](INSIGHTS.md)

## Stack

`agent-browser` CLI (installed globally, not a dependency) · tsx · TypeScript. No test framework — `run.ts` is the harness.

## Commands

```sh
npm i -g agent-browser && agent-browser install   # once; downloads Chrome for Testing
../scripts/e2e.sh        # recommended: isolated seeded stack (:5433/:3101/:3100) → flows → teardown
npm test                 # runs flows against E2E_BASE_URL (default :3000) — needs a seeded stack
```

Env: `E2E_BASE_URL` · `AGENT_BROWSER_BIN` · `E2E_STEP_TIMEOUT` (ms, default 60000). Hermetic stack: `E2E_PG_PORT` · `E2E_API_PORT` · `E2E_WEB_PORT` · `E2E_PG_CONTAINER` · `E2E_PG_IMAGE`.

## Where things live

| Path | What |
|------|------|
| `run.ts` | the harness: discovers specs, runs commands in one browser session, reports |
| `specs/NN-name.flow.json` | the flows; run in lexical filename order |
| `lib/assert.ts` | argument resolution, stdout checks, result summary |
| `agent-browser.json` | browser config (headless by default) |
| `test-results/` | failure screenshots, git-ignored, uploaded by CI |

## Non-default conventions

- A flow is **data, not code**: a JSON list of `agent-browser` commands with labels. Adding coverage means adding a spec file, not writing a test.
- `{BASE}` in a command is substituted with `E2E_BASE_URL`.
- **Waits are the assertions.** `wait --text` / `wait --url` exit non-zero when the condition never holds, which fails the step and the flow. Optional `assert.stdoutIncludes` adds a substring check.
- **Deterministic locators only** — `--url`, `--text`, `find role|text|label`. The AI `chat` command is never used, so runs are stable and key-free.
- Flows target **read-only seeded data** (the demo repo, its PR, the seeded agents and run), so nothing triggers a model call.
- All commands share one browser session; the daemon keeps the page between invocations, so flow order and per-flow state matter.

## Gotchas

- **Precondition: a freshly seeded database.** Flows `02`, `04`, and `05` follow the home redirect to the *first* repo, so they assume the seeded demo repo is the only one. Against a dev DB with real imports they land on the wrong repo and fail — use `../scripts/e2e.sh`.
- Never `docker compose down -v` to "reset" the dev DB: that deletes the `devdigest_pgdata` volume and every imported repo and review. The hermetic runner uses its own volume-less Postgres instead.
- `agent-browser` must be installed globally and its browser downloaded; a missing binary fails every step identically.
- A flow that needs an LLM call or a GitHub token does not belong here.

## Do not touch

- `test-results/` — generated artifacts.
- The determinism rules: no `chat`, no LLM, no network-dependent assertions, no reliance on data a user imported locally.
