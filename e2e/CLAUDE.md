# `@devdigest/e2e` — browser end-to-end suite

Deterministic UI flows driven by Vercel `agent-browser` (native CDP CLI). No
Playwright, no LLM, no API key. Each flow is a JSON list of commands run in
order by `run.ts`.

## Stack

TypeScript + `tsx` only — no runtime deps beyond that; drives the external
`agent-browser` CLI (installed globally, not a package dependency).

## Commands

`npm test` (`tsx run.ts`) · `npm run e2e:hermetic` (`../scripts/e2e.sh`, isolated stack) · `npm run typecheck`.

## Read when

- `README.md` — flow format, run instructions, coverage table.
- `../TESTING.md` — this module's suite (`e2e-web.yml`).
- `docs/` — design notes/ADRs for this module.
- `specs/*.flow.json` — this module's Specs: deterministic browser-flow definitions (not planning docs — the flow JSON *is* the spec here).
- `INSIGHTS.md` — accumulated engineering insights for this module; read before starting work and treat as high-confidence guidance unless it's clearly stale.

## Naming conventions

- Flow files: `specs/NN-name.flow.json` — the two-digit zero-padded prefix also fixes run order within the shared browser session; never renumber an existing flow, append the next number.

## Gotchas

- Never `docker compose down -v` against a dev DB to "reset" it — `-v` deletes the `devdigest_pgdata` volume along with every real repo/review you've imported. Use `npm run e2e:hermetic` (isolated stack, alternate ports) instead.
- Locators must stay deterministic (`--url`, `--text`, `find role|text|label`) — never the AI `chat` command, or runs stop being reproducible.
- Flows assume a freshly-seeded DB with exactly the demo repo (`acme/payments-api`); running against a dev DB with other imported repos makes flows 02/04/05 land on the wrong repo.

## Do not touch

- `package-lock.json` — regenerate via `npm install`, never hand-edit.

## Before you finish

Found a non-obvious gotcha, pattern, fix, or decision this session? Append it to `INSIGHTS.md` under the right heading — don't skip this step.
