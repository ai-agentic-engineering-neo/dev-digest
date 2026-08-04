# e2e/ — @devdigest/e2e

Deterministic browser e2e (Vercel agent-browser — no Playwright, no LLM, no
API key) against the real stack. Repo-wide rules: [../CLAUDE.md](../CLAUDE.md).

## Stack

agent-browser CLI (Rust + CDP) driven by `run.ts`; flows are JSON command
lists in `specs/*.flow.json`, not TS test files.

## Commands

`npm install` then `npm test` (against your own running stack) or
`npm run e2e:hermetic` (isolated Postgres :5433 / API :3101 / web :3100 —
recommended, never touches your dev DB). `npm run typecheck`.

## Where things live

- `specs/NN-name.flow.json` — one flow per file, numbered, run in order
- `run.ts` — the flow runner; `lib/assert.ts` — shared assertions

## Non-default conventions

- This package uses **npm**, not pnpm, for its own scripts — unlike
  `server/`/`client/`.
- Flows target only the seeded demo repo/PR (`acme/payments-api` #482) — no
  LLM call is ever triggered. Locators are deterministic only
  (`--url`/`--text`/`find`), never the AI `chat` command.
- Running `npm test` against your normal dev stack (not the hermetic runner)
  breaks flows 02/04/05 if your dev DB has more than the seeded repo.

## Do-not-touch

- **Never `docker compose down -v`** to "reset" — deletes the
  `devdigest_pgdata` volume and every imported repo/review with it. Use
  `npm run e2e:hermetic` instead — fully isolated, ephemeral Postgres.

## Session protocol

- Before work: skim [INSIGHTS.md](INSIGHTS.md); name the top relevant points.
- After a non-trivial task: run the `engineering-insights` skill.

## Docs map

- [README.md](README.md) — flow format, hermetic runner, env knobs, coverage table
- [specs/](specs/) — the flow specs themselves
- [INSIGHTS.md](INSIGHTS.md) — dev log: decisions/gotchas found while working here
