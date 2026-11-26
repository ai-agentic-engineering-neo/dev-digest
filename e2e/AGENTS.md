# e2e (@devdigest/e2e) — agent map
Inherits the root `AGENTS.md`; only e2e-specific rules here.

## Commands (npm, not pnpm)
- `npm run e2e:hermetic` — isolated, freshly seeded stack (:5433 / :3101 / :3100); recommended
- `npm test` — against an already running stack (`E2E_BASE_URL`, default :3000)
- `npm run typecheck`
- One-time setup: `npm i -g agent-browser && agent-browser install`

## Layout
- `flows/NN-name.flow.json` — test flows (batch JSON), run in filename order
- `run.ts` — runner; `lib/` — helpers
- `specs/` — feature specs (NOT test flows)

## Conventions
- Deterministic locators only: `wait --url`, `wait --text`, `find role|text|label`.
  Never the AI `chat` command — runs must stay key-free.
- `wait` steps are the assertions; extra checks go in `"assert": { "stdoutIncludes" }`.
- Flows use read-only seeded data only (`acme/payments-api`, PR #482, seeded agents).

## Gotchas
- `npm test` against your dev DB fails flows 02/04/05 when other repos are imported —
  use `e2e:hermetic`.

## Do not touch
- Never `docker compose down -v` to "reset" — it deletes the real dev data volume.

## Read when
- Writing or changing a flow → read `README.md` §How a flow works
- Deciding what to cover → read `README.md` §Coverage
- Design question → read `docs/`
- Implementing a feature → read its spec in `specs/`
- Before finishing → append new lessons to `INSIGHTS.md` (append-only)
