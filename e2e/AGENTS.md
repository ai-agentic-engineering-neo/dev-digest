# e2e/ — @devdigest/e2e

Deterministic browser e2e for the web app, driven by Vercel agent-browser
(native CDP, no Playwright, no LLM). Full picture: [README.md](./README.md).

## Stack
`agent-browser` CLI (Rust + CDP) + `run.ts`, npm, tsx. Standalone package —
own `package.json`/lockfile, no workspace.

## Commands
- `npm test` — runs flows against your own already-running dev stack (only safe
  if the dev DB has *just* the seeded demo repo — see gotchas)
- `./scripts/e2e.sh` from Git Bash (`npm run e2e:hermetic` only works where `../scripts/e2e.sh` is
  runnable — it fails under Windows cmd) — boots an isolated, freshly-seeded
  stack on alternate ports (Postgres :5433, API :3101, web :3100), runs the flows,
  tears it down. **Recommended** — safe alongside your normal dev stack.

## What lives where
- `specs/*.flow.json` — 9 deterministic flow specs (JSON list of agent-browser
  commands run in order by `run.ts`).
- `design-specs/` — pre-implementation UI/flow design notes, not yet flow JSON;
  treat as part of the same "specs" umbrella as `specs/`.
- `docs/` — e2e-specific design notes.

## Non-default conventions
- **Locators are deterministic only** (`--url`, `--text`, `find role|text|label`)
  — never the AI `chat` command, so runs stay stable and key-free.
- Flows 01-07 target **read-only seeded data** (demo repo `acme/payments-api`, PR #482);
  flows 08 (skills modal/delete) and 09 (conventions triage) **mutate the hermetic run's own
  throwaway DB** — never point them at a DB you care about. No flow triggers a model call.

## Gotchas
Running log of non-obvious decisions and hard-won lessons, including a hard
warning about the dev Postgres volume: [INSIGHTS.md](./INSIGHTS.md).
The `engineering-insights` skill keeps this updated proactively — Claude appends
entries as issues are found and during end-of-session wrap-ups, so treat it as
current guidance, not a write-only log.

## Do not touch
- **Never `docker compose down -v` against the dev stack** — it deletes the
  `devdigest_pgdata` volume along with every imported repo and review. Use
  `./scripts/e2e.sh` (hermetic) instead of resetting the shared dev DB.

## Links
[README](./README.md) · [docs/](./docs/) · [specs/](./specs/) · [design-specs/](./design-specs/) ·
[INSIGHTS.md](./INSIGHTS.md) · [Testing strategy](../TESTING.md) · [Root AGENTS.md](../AGENTS.md)
