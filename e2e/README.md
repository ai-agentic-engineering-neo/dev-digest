# `@devdigest/e2e` — browser end-to-end suite

Deterministic UI flows for the web app, driven by
[Vercel **agent-browser**](https://github.com/vercel-labs/agent-browser) — a
native (Rust + CDP) browser-automation CLI. **No Playwright, no LLM, no API key.**

agent-browser is a CLI, not a test framework, so this package adds a thin
convention: each flow is a JSON list of agent-browser commands, run in order
against one shared browser session by `run.ts`.

## How a flow works

A flow lives in `flows/NN-name.flow.json`:

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
- Optional `"requiresEnv": "E2E_MOCK_LLM"` runs the flow only when that env var
  is set; otherwise it is reported as `SKIP` (not a failure). Flows that start a
  review use it — they need the API on the mock LLM (see below).
- Locators are deterministic only (`--url`, `--text`, `find role|text|label`).
  We never use the AI `chat` command, so runs are stable and key-free.

Flows target **seeded data** (the demo repo `acme/payments-api`, PR #482 with
its diff, one finished agent run + review, the seeded agents). Flows 01–08 are
read-only. Flows 09–11 **write** (start a review, accept/dismiss its findings, create + link a skill)
and need the API on the **mock LLM**: `LLM_PROVIDER_OVERRIDE=mock` resolves
every provider to `server/src/adapters/llm/mock.ts`, which returns a fixed
review with two findings grounded on the seeded diff (each call sleeps
`LLM_MOCK_DELAY_MS` so the live state is visible). The hermetic runner sets
this up and exports `E2E_MOCK_LLM=1`; nothing ever calls a real model.

Gotchas when writing flows:

- Section labels, badges and popover titles are CSS-uppercased, and
  `wait --text` matches the rendered (uppercase) text case-sensitively → assert
  a nearby non-uppercased string, or `wait --fn` with `toLowerCase()`.
- The PR page scrolls inside `<main>`; agent-browser's `click` / `scroll` /
  `scrollintoview` do not scroll it, so a click on a below-the-fold element
  silently does nothing. Flow 10 sets `set viewport 1280 2000` first.
- Wait for the layout to settle (`wait --load networkidle` + a text that only
  appears once the data loaded) before clicking: a late query can move the
  target and the click lands on the old spot.
- After a review the PR is `reviewed`, and the PR list's default filter is
  "Needs review" → click the `All` filter first.

> **Precondition: a freshly-seeded DB.** Flow `02` follows the home redirect to
> the *first* repo, so it assumes the seeded demo repo is the only one. CI
> guarantees this — `e2e-web.yml` brings up an empty Postgres and seeds it.
> Your local dev DB usually has other imported repos, so running `npm test`
> straight against it makes flows 02/04/05 land on the wrong repo and fail.
> **Use the hermetic runner below** — it spins up its own isolated, freshly-seeded
> stack and leaves your dev DB untouched.
>
> ⚠️ **Never `docker compose down -v` to "reset" your dev DB** — `-v` deletes the
> `devdigest_pgdata` volume along with every real repo and review you've imported.

## Run locally

```sh
# 1. install the agent-browser CLI once (downloads Chrome for Testing)
npm i -g agent-browser@0.27.0 && agent-browser install   # version CI pins
```

### Hermetic (recommended)

```sh
# Boots an isolated, freshly-seeded stack on alternate ports
# (Postgres :5433, API :3101, web :3100), runs the flows, then tears it all
# down. Safe to run while your normal dev stack is up — it never touches your
# dev DB or the devdigest_pgdata volume.
./scripts/e2e.sh
# or: cd e2e && npm install && npm run e2e:hermetic
```

The isolated Postgres is ephemeral (no persistent volume), so it's empty every
run and the seeded demo repo `acme/payments-api` is the only one — which is
exactly what flows 02/04/05 need.

What the runner does besides booting the stack:

- Fails fast, before starting anything, when `agent-browser` (or
  `AGENT_BROWSER_BIN`) is not on PATH, and prints how to install it or add an
  `npx` shim (`exec npx -y agent-browser "$@"`).
- Runs `npm ci` in `e2e/` if its deps are missing.
- Starts the API with `LLM_PROVIDER_OVERRIDE=mock` and exports `E2E_MOCK_LLM=1`.
- Starts `next dev` with `NEXT_DIST_DIR=.next-e2e` (read by
  `client/next.config.mjs`), so it never shares `client/.next` with your dev
  server on :3000.

### Against your own running stack

Only safe if your dev DB contains *only* the seeded repo (see precondition
above). Otherwise prefer the hermetic runner.

```sh
./scripts/dev.sh          # Postgres + API :3001 + web :3000 (seeded)
cd e2e && npm install && npm test
```

Env knobs:

- Runner: `E2E_BASE_URL`, `AGENT_BROWSER_BIN` (default `agent-browser`),
  `E2E_STEP_TIMEOUT` (ms, default 60000).
- Runner: `E2E_MOCK_LLM` (set = run the `requiresEnv` flows).
- Hermetic stack (`scripts/e2e.sh`): `E2E_PG_PORT` (5433), `E2E_API_PORT` (3101),
  `E2E_WEB_PORT` (3100), `E2E_PG_CONTAINER` (`devdigest-e2e-postgres`),
  `E2E_PG_IMAGE` (`pgvector/pgvector:pg16`), `E2E_LLM_MOCK_DELAY_MS` (4000),
  `E2E_NEXT_DIST_DIR` (`.next-e2e`).

Failure screenshots are written to `e2e/test-results/` (git-ignored; uploaded as
a CI artifact by `.github/workflows/e2e-web.yml`).

## Coverage (typological, not exhaustive)

| Flow file | Journey |
|------|------|
| `01-app-boot` | root → redirect to first repo's PR list → seeded PR #482 |
| `02-repo-pulls-detail` | PR list → open PR #482 → review detail route |
| `03-agents` | agents list renders the seeded reviewer agents |
| `04-pr-findings` | PR #482 → Agent runs tab → seeded run verdict + findings; expand → FindingCard |
| `05-pr-diff` | PR #482 → Files changed tab → seeded file renders in the diff viewer |
| `06-onboarding` | `/onboarding` → add-repository form renders (no submit) |
| `07-settings` | `/settings/api-keys` + `/settings/models` → section titles render |
| `08-run-timeline` | PR #482 → Agent runs → seeded run tile: outcome badge, provider/model, tokens + cost, severity counters + hover popover |
| `09-run-review-mock` | *(mock LLM)* Run Review ▾ → Security Reviewer → live "Review in progress" → run ends → mock findings + new timeline tile |
| `10-finding-actions` | *(mock LLM, after 09)* Accept one finding, Dismiss the other → tags shown → reload → tags persisted |
| `11-skills` | *(mock LLM, after 09)* /skills shows seeded skills → create a skill → link it in Security Reviewer's Skills tab → reload → still linked → run a review → the run trace lists the skill + version |
| `12-smart-diff` | PR #482 → Files changed → seeded review's findings show as a role-group counter (`Core` `● 2`) → Original order flattens the groups and is kept in `?order=` |
