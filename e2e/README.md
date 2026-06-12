# `@devdigest/e2e` — browser end-to-end suite

Deterministic UI flows for the web app, driven by
[Vercel **agent-browser**](https://github.com/vercel-labs/agent-browser) — a
native (Rust + CDP) browser-automation CLI. **No Playwright, no LLM, no API key.**

agent-browser is a CLI, not a test framework, so this package adds a thin
convention: each flow is a JSON list of agent-browser commands, run in order
against one shared browser session by `run.ts`.

## How a flow works

A spec lives in `specs/NN-name.flow.json`:

```jsonc
{
  "name": "App boots and lands on the seeded repo's PR list",
  "steps": [
    { "cmd": ["open", "{BASE}/"],            "label": "load the app root" },
    { "cmd": ["wait", "--url", "/pulls"],    "label": "root redirects to PRs" },
    { "cmd": ["wait", "--text", "#482"],     "label": "seeded PR row visible" }
  ]
}
```

- `{BASE}` is replaced with `E2E_BASE_URL` (default `http://localhost:3000`).
- Each `cmd` is passed verbatim to `agent-browser`. A non-zero exit fails the
  step and the flow — so `wait --text` / `wait --url` **are** the assertions
  (they time out and exit non-zero if the condition never holds).
- Optional `"assert": { "stdoutIncludes": "…" }` adds a substring check on the
  command's stdout.
- Locators are deterministic only (`--url`, `--text`, `find role|text|label`).
  We never use the AI `chat` command, so runs are stable and key-free.

Flows target **read-only seeded data** (the demo repo `acme/payments-api`, PR
#482, the seeded agents/skills), so nothing triggers a model call.

> **Precondition: a freshly-seeded DB.** Flow `02` follows the home redirect to
> the *first* repo, so it assumes the seeded demo repo is the only one. CI
> guarantees this — `e2e-web.yml` brings up an empty Postgres and seeds it. If
> you run locally against a DB that already has imported repos, reset first:
> `docker compose down -v && ./scripts/dev.sh`.

## Run locally

```sh
# 1. bring up the full stack with demo data (Postgres + API :3001 + web :3000)
./scripts/dev.sh

# 2. install the agent-browser CLI once (downloads Chrome for Testing)
npm i -g agent-browser && agent-browser install

# 3. run the flows
cd e2e && npm install && npm test
```

Env knobs: `E2E_BASE_URL`, `AGENT_BROWSER_BIN` (default `agent-browser`),
`E2E_STEP_TIMEOUT` (ms, default 60000).

Failure screenshots are written to `e2e/test-results/` (git-ignored; uploaded as
a CI artifact by `.github/workflows/e2e-web.yml`).

## Coverage (typological, not exhaustive)

| Spec | Flow |
|------|------|
| `01-app-boot` | root → redirect to first repo's PR list → seeded PR #482 |
| `02-repo-pulls-detail` | PR list → open PR #482 → review detail route |
| `03-agents` | agents list renders the seeded reviewer agents |
| `04-skills` | skills library route renders |
| `05-dashboards` | memory + CI runs + eval dashboards render |
