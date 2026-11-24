# e2e/ — `@devdigest/e2e`

agent-browser CLI (Rust + CDP, installed globally: `npm i -g agent-browser`) ·
`tsx` runner (`run.ts`) · TypeScript ^5.7 · Node 22 · **npm**. No Playwright.

## Commands

- `npm run e2e:hermetic` — preferred locally: isolated, freshly-seeded stack on
  alternate ports (`../scripts/e2e.sh`); leaves the dev DB untouched.
- `npm test` — runs flows against an already-running, freshly-seeded stack (what CI does).
- `npm run typecheck`

## Where things live

- `specs/NN-name.flow.json` — one flow = ordered list of agent-browser commands
- `run.ts` — executes flows; `lib/assert.ts` — assertion helpers
- `agent-browser.json` — CLI config

## Rules

- Locators are deterministic only: `--url`, `--text`, `find role|text|label`.
  Never use the AI `chat` command; no flow may trigger an LLM call or need a key.
- Flows read only seeded data (`acme/payments-api`, PR #482, the seeded agents).
  If you change `server/src/db/seed.ts` or UI text a flow waits on, update the flow.
- `npm test` against your normal dev DB fails when other repos are imported
  (home redirects to the first repo) — use `e2e:hermetic` instead.
- Never "reset" the dev DB with `docker compose down -v`.

## Read when…

- Read `README.md` (this package) before writing or changing a flow (spec format,
  `{BASE}`, `assert`).
- Read `../TESTING.md` when changing what the e2e suite covers or `e2e-web.yml`.
- Read `INSIGHTS.md` before debugging a flaky or failing flow; append a dated entry
  (Status: unverified) when you find non-obvious behaviour.
- Read `specs/` before adding flows for a feature that has a spec; `docs/` for
  long-form notes.
