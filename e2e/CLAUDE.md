# e2e — @devdigest/e2e

Deterministic browser flows driven by the agent-browser CLI (no Playwright, no LLM, no API key). tsx runner. Package manager: npm.

## Where things are
- `specs/NN-name.flow.json` — one flow = ordered agent-browser commands; `run.ts` only picks up `*.flow.json`
- `specs/*.md` — feature specs (ignored by the runner)
- `run.ts` — runner (one shared browser session) · `lib/assert.ts` — stdout assertions

## Commands
- Hermetic, recommended: `../scripts/e2e.sh` (isolated stack on :5433/:3101/:3100, fresh seed)
- Against a running stack: `npm test` (needs `npm i -g agent-browser && agent-browser install`)

## Conventions (non-default)
- `wait --text` / `wait --url` ARE the assertions; deterministic locators only (`--url`, `--text`, `find role|text|label`).
- Never use agent-browser `chat` — flows must stay key-free and stable.
- Flows target read-only seeded data (`acme/payments-api`, PR #482, built-in agents).

## Gotchas
- Flows 02/04/05 assume the seeded repo is the ONLY repo — they fail against a dev DB with imported repos. Use the hermetic runner.
- Never `docker compose down -v` to reset — it wipes the dev DB volume.

## Read when relevant
- `README.md` — flow format and run modes · `../TESTING.md`
- `docs/` · `specs/` (before a milestone feature) · `INSIGHTS.md` (before non-trivial changes)
