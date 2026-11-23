# e2e — deterministic browser e2e over the seeded stack (no LLM)

## Stack
agent-browser CLI (CDP) · tsx runner · **npm** (has `package-lock.json`)

## Commands
- One-time: `npm i -g agent-browser && agent-browser install`
- `npm run e2e:hermetic` — isolated stack (PG :5433, API :3101, web :3100), recommended
- `npm test` — against your running dev stack (`E2E_BASE_URL`, default :3000)

## Map
- `specs/*.flow.json` — test flows, run in filename order
- `run.ts` + `lib/` — the runner
- `../scripts/e2e.sh` — hermetic stack up/down

## Conventions
- In this package `specs/` means **test flows**, not feature specs. Feature specs
  live in `client/specs/` or `server/specs/`.
- Deterministic locators only (`--url`, `--text`, `find role|text|label`).
- Flows rely only on seeded data — never trigger an LLM call.
- New flow: `NN-name.flow.json` + a row in the Coverage table of `e2e/README.md`.

## Gotchas
- `npm test` on your dev DB can fail: other imported repos change what the root redirects to.
  Prefer `e2e:hermetic`.

## Docs — read when relevant
- Flow format, env vars, coverage table → `e2e/README.md`
- Index of deeper docs → `e2e/docs/README.md`
- What each flow covers → `e2e/specs/README.md`
- Before debugging a flaky/failing flow → `e2e/INSIGHTS.md`
- Found something non-obvious → append to `e2e/INSIGHTS.md`, not here
