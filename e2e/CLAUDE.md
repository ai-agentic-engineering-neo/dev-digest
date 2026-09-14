# e2e — agent map

Deterministic browser flows for the web app, driven by Vercel **agent-browser** (native Rust+CDP CLI). No Playwright, no LLM, no API key.

## Stack

TypeScript 5.7 · `tsx` 4.19 (runner) · `agent-browser` CLI (external binary, installed separately)

## Commands

- `npm test` → `tsx run.ts` — runs flows against whatever stack is already up
- `npm run e2e:hermetic` (or `./scripts/e2e.sh` from repo root) — isolated stack (Postgres `:5433`, API `:3101`, web `:3100`), freshly seeded, torn down after
- `npm run typecheck`

## Map

| dir/file | what's there |
|---|---|
| `specs/*.flow.json` | declarative browser flows (ordered `agent-browser` command lists) — **not** feature specs, see Docs below for those |
| `lib/assert.ts` | shared assertion helpers |
| `run.ts` | loads and executes flows in order against one shared browser session |

## Conventions (non-default)

- `specs/` here means "browser flow definitions," a different thing from `docs/specs/` (feature specs) — don't conflate the two when asked to "add a spec"
- Locators must be deterministic only (`--url`, `--text`, `find role|text|label`) — the AI `chat` command is never used, so runs stay stable and key-free
- `{BASE}` in a flow file is substituted with `E2E_BASE_URL`

## Gotchas

- Flows assume a freshly-seeded DB with only the demo repo `acme/payments-api` as PR #482 — running `npm test` against your normal dev DB (which likely has other imported repos) breaks flows `02`/`04`/`05`. Use the hermetic runner instead.
- Never `docker compose down -v` to "reset" your dev DB — it deletes the `devdigest_pgdata` volume along with every real repo/review you've imported

## Docs

- [README.md](./README.md) — flow format, coverage table
- [docs/](./docs/) — reference material too detailed for this file
- [docs/specs/](./docs/specs/) — feature specs (SDD) — distinct from the flow `specs/` above
- [Insights.md](./Insights.md) — running log of decisions/gotchas
