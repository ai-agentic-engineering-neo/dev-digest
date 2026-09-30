# e2e (`@devdigest/e2e`)

## Overview

Deterministic browser flows for the web app, driven by Vercel
`agent-browser` (native CDP CLI) — no Playwright, no LLM, no API key.

## Commands

- Hermetic (recommended): `./scripts/e2e.sh` or `cd e2e && npm run
  e2e:hermetic` — isolated ports/DB, fully self-contained.
- Against your own dev stack: `./scripts/dev.sh` then `cd e2e && npm test` —
  only safe if the dev DB has *only* the seeded repo (see Gotchas).
- One-time setup: `npm i -g agent-browser && agent-browser install`.

## Conventions

- A flow is `specs/NN-name.flow.json`: an ordered list of `agent-browser`
  commands. `{BASE}` is replaced with `E2E_BASE_URL`. `wait --text`/`wait
  --url` **are** the assertions — a non-zero exit fails the step.
- Locators are deterministic only (`--url`, `--text`, `find role|text|label`)
  — never use the AI `chat` command, that breaks the no-LLM/no-key/
  determinism guarantee.
- Flows target read-only seeded data only (`acme/payments-api`, PR #482,
  the seeded agents) — nothing here should trigger a model call.

## Do not touch

- Never run `docker compose down -v` to "reset" your dev DB — it deletes the
  `devdigest_pgdata` volume and every real imported repo/review. Use the
  hermetic runner instead.

## Gotchas

- Flows `02`/`04`/`05` follow the home redirect to the *first* repo and
  assume the seeded demo repo is the only one. A dev DB with other imported
  repos makes them land on the wrong repo and fail for reasons unrelated to
  the app — prefer the hermetic runner, which starts from an empty,
  freshly-seeded Postgres every run.
- Failure screenshots land in `e2e/test-results/` (git-ignored, uploaded as
  a CI artifact by `e2e-web.yml`).

## Reference

- `e2e/README.md` — read first: flow anatomy, full coverage table, env
  knobs.
- `e2e/specs/*.flow.json` — read before adding a new flow, to match existing
  style and locator conventions.
- `../TESTING.md` — read before any test change.
- `e2e/docs/` — deeper design notes; currently an empty placeholder
  (distinct from `e2e/specs/`, which holds the executable flow specs).
- `../.claude/rules/` — always-applied project rules; authoritative over
  this file if it ever contains anything.
