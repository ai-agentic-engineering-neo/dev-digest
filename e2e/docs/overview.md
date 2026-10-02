# e2e — overview

## Responsibility
Prove the real stack works end to end in a browser: client on :3000 → API on :3001 → seeded Postgres. Seven
deterministic flows (`specs/01-app-boot` … `07-settings`) drive the [agent-browser](https://github.com/vercel-labs/agent-browser)
CLI through `run.ts`, one shared browser session, lexical order, first failing step stops the flow.

## What it does NOT do
- No LLM calls and no API keys. Flows only read seeded data (`acme/payments-api`, PR #482, seeded agents,
  the seeded General Reviewer run with `9,500 tok · $0.014`) or open forms without submitting (`06-onboarding`).
- No AI locators: never the agent-browser `chat` command. Only `open`, `wait --url|--text|--load`, `find role|text|label … click|hover|text`, `screenshot`, `close`.
- No test framework, no Playwright. Assertions are agent-browser exit codes plus an optional `assert.stdoutIncludes` (`lib/assert.ts`).
- No feature specs (see `README.md`). No unit tests of the client; those are `client/src/**/*.test.tsx`.
- No stack management in `run.ts`. Boot is done by `../scripts/e2e.sh` locally or `.github/workflows/e2e-web.yml` in CI.

## Dependencies
| Direction | What | Evidence |
|---|---|---|
| out → running web app | `E2E_BASE_URL` (default `http://localhost:3000`), `{BASE}` substituted per step | `run.ts`, `lib/assert.ts` `resolveArgs` |
| out → agent-browser binary | `AGENT_BROWSER_BIN` (default `agent-browser`), config `agent-browser.json` (headless) | `run.ts` `ab()` |
| out → seed data | text waits depend on `server/src/db/seed.ts` fixtures (PR title "Add rate limiting to public API endpoints", findings "Hardcoded Stripe secret key in commit", "N+1 query in user list endpoint") | `specs/02-*.flow.json`, `specs/04-*.flow.json` |
| out → client strings | waits on rendered labels and aria names ("Agent runs", "1 Warning", "2 findings in this run") | `client/messages/en/*.json`, `client/src/components/finding-severity/` |
| in ← `client/specs`, `server/specs` | acceptance criteria name the flow file to extend | `client/specs/002-findings-severity.md` |
| code imports | only `node:*` modules; no `@devdigest/*` | `run.ts`, `lib/assert.ts` |

## Public interface
- `npm test` → `tsx run.ts`; exit code 0 iff every flow passes. Summary printed by `summarize` (`lib/assert.ts`).
- Flow file schema: `{ name, description?, steps: [{ cmd: string[], label?, assert?: { stdoutIncludes } }] }` (`lib/assert.ts` `Flow`/`Step`).
- Failure artifacts: `test-results/<flow-id>-fail.png` (git-ignored, uploaded by CI on failure).
- Env knobs: `E2E_BASE_URL`, `AGENT_BROWSER_BIN`, `E2E_STEP_TIMEOUT` (ms, 60000); hermetic script adds `E2E_PG_PORT` 5433, `E2E_API_PORT` 3101, `E2E_WEB_PORT` 3100.

## Invariants
- Flows assume a **freshly seeded DB with exactly one repo**: `/` redirects to the first repo. On a long-lived dev DB
  flows 02/04/05 land on the wrong repo. Use `../scripts/e2e.sh`; never `docker compose down -v` (deletes `devdigest_pgdata`).
- `wait --text` / `wait --url` are the assertions; a step passes only when agent-browser exits 0 within `E2E_STEP_TIMEOUT`.
- One browser session for all flows; `run.ts` always runs `close` in `finally`.
- Seed changes that alter PR #482's run, cost, or findings must update the matching `wait --text` strings.
- `lint` and `typecheck` cover `run.ts` and `lib/**` only (`tsconfig.json` include); flow JSON is not type-checked.
