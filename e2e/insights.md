# e2e — insights

Read via the `engineering-insights` skill. Rules live in `e2e/CLAUDE.md`; setup in `e2e/README.md`.

## What works

- **Hermetic runner for local runs**: `pnpm e2e:hermetic` (runs `scripts/e2e.sh`) boots an isolated, freshly seeded stack on Postgres :5433, API :3101, web :3100, and tears it down afterwards. Dev DB is untouched. [2026-11-20]

## What does not work

- **`pnpm test` against a dev DB with other imported repos**: flows 02, 04 and 05 land on the wrong repo. Flow 02 follows the redirect to the *first* repo and assumes it is the demo repo. Fix: run `pnpm e2e:hermetic`. [2026-11-20]

## Codebase patterns

- **Flows use only deterministic locators**: `--url`, `--text`, `find role|text|label`. Never the agent-browser `chat` command. Why: keeps runs stable and key-free. [2026-11-20]
- **Each flow is `specs/NN-name.flow.json`**: an ordered list of agent-browser `cmd` arrays. `{BASE}` is replaced with `E2E_BASE_URL`. Assert with `wait --text` / `wait --url`. [2026-11-20]
- **Flows target read-only seeded data** (`acme/payments-api`, PR #482, built-in agents). Do not add flows that trigger a model call. [2026-11-20]

## Tool and library notes

- **agent-browser is a CLI, not Playwright.** One-time setup: `npm i -g agent-browser && agent-browser install`. [2026-11-20]

## Recurring errors and fixes

- **Flows 02, 04 or 05 fail with the wrong repo on screen** → cause: dev DB has extra imported repos → fix: `pnpm e2e:hermetic`. [2026-11-20]

## Session notes

- _None yet._

## Open questions

- _None yet._

## Legacy entries

## 2026-11-20 — Use the hermetic runner for local runs
`pnpm e2e:hermetic` boots its own seeded stack on alternate ports and leaves the dev DB
alone. Running `pnpm test` against a dev DB with other imported repos makes flows 02,
04 and 05 land on the wrong repo.
Why: flow 02 follows the redirect to the *first* repo and assumes it's the demo repo.

## 2026-11-20 — Never `docker compose down -v` to reset
The `-v` flag deletes the `devdigest_pgdata` volume, which holds every real repo and
review. Use the hermetic runner instead of resetting the dev DB.

## 2026-11-20 — No AI commands in flows
Flows use only deterministic locators and never the agent-browser `chat` command.
Why: keeps runs stable and key-free.
