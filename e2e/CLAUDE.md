# e2e/ — @devdigest/e2e

Deterministic browser e2e driven by the Vercel **agent-browser** CLI. No
Playwright, no LLM, no API key. Flows are JSON command lists run in order
against one shared browser session by `run.ts`. Uses **npm**, not pnpm.

In this module the docs convention differs in one way: `specs/` is already the
home of the executable agent-browser flow specs (`NN-name.flow.json`) — treat
the flows themselves as the specs; design notes about them go to `docs/`.

## Commands

| Task | Command |
|------|---------|
| hermetic run (recommended) | `./scripts/e2e.sh` (from repo root) or `npm run e2e:hermetic` |
| run against own stack | `npm test` — only safe when the dev DB holds *only* the seeded repo |

The hermetic runner boots an isolated freshly-seeded stack (Postgres :5433,
API :3101, web :3100), runs the flows, tears everything down, and never touches
your dev DB.

## Where things lie

- `specs/NN-name.flow.json` — the flows; `wait --text` / `wait --url` are the
  assertions (non-zero exit on timeout).
- `run.ts` — runner: `{BASE}` substitution, ordered commands, optional
  `stdoutIncludes` checks.
- `lib/assert.ts` — assertion helpers.

## Hard rules

- Locators are deterministic only (`--url`, `--text`, `find role|text|label`) —
  never the AI `chat` command.
- Flows target read-only seeded data (`acme/payments-api`, PR #482) — nothing may
  trigger a model call or mutate state.
- **Never** `docker compose down -v` to "reset" — `-v` deletes the
  `devdigest_pgdata` volume with every real repo and review.
- A local dev DB with extra imported repos breaks flows 02/04/05 (they follow
  the redirect to the *first* repo) — use the hermetic runner.

## Read when …

- Writing a flow, or changing the runner → read [`README.md`](README.md) (flow
  format, env knobs, coverage table).
- Debugging something non-obvious here → read [`INSIGHTS.md`](INSIGHTS.md) first;
  how-tos live in [`docs/`](docs/README.md).
