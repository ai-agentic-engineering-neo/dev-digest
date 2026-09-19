# `@devdigest/e2e` — deterministic browser flows (agent-browser)

## Before answering

**Read the matching document before you touch code.**

| If the task touches… | Read first |
|---|---|
| writing or editing a flow | `README.md` — "How a flow works", plus an existing `specs/*.flow.json` |
| a flow that fails locally but passes in CI | `README.md` — the freshly-seeded-DB precondition |
| the runner, its conventions, or `{BASE}` substitution | `run.ts` and `agent-browser.json` |
| what these flows are meant to cover at all | `../TESTING.md` |
| a failure that smells familiar | `INSIGHTS.md` — and **append** to it when you hit a new one |

If nothing matches, proceed.

## Commands

`npm run e2e:hermetic` — **the default.** Boots an isolated, freshly-seeded stack
(Postgres `:5433`, API `:3101`, web `:3100`), runs every flow, tears it down.
`npm test` — runs the flows against whatever is already on `E2E_BASE_URL`
(default `http://localhost:3000`). `npm run typecheck`.

One-time setup: `npm i -g agent-browser && agent-browser install`.

Note: npm, not pnpm. The lockfile here is `package-lock.json`.

## Where things live

| | |
|---|---|
| `specs/NN-name.flow.json` | the flows — a JSON list of agent-browser commands |
| `run.ts` | the runner: one shared browser session, steps in order |
| `lib/assert.ts` | the optional `stdoutIncludes` check |
| `../scripts/e2e.sh` | the hermetic stack |

## Conventions

- A flow is data, not code: each `cmd` is passed **verbatim** to `agent-browser`, and a
  non-zero exit fails the step and the flow.
- **`wait --text` / `wait --url` are the assertions.** They time out and exit non-zero,
  so a flow needs no separate assertion layer.
- **Deterministic locators only** — `--url`, `--text`, `find role|text|label`. Never the
  AI `chat` command: runs must stay stable and key-free.
- Flows target read-only seeded data (`acme/payments-api`, PR #482, the seeded agents),
  so nothing in this suite may trigger a model call.
- `{BASE}` is substituted from `E2E_BASE_URL`. Never hard-code a host or port in a flow.

## Gotchas

- Flows assume **exactly one repo** in the DB — `02` follows the home redirect to the
  first one. Your dev DB usually has more, which is why `02`/`04`/`05` fail there. Use
  the hermetic runner; it leaves your dev DB untouched.
- ⚠️ **Never `docker compose down -v`** to "reset" — `-v` deletes the `devdigest_pgdata`
  volume with every repo and review you have imported.
