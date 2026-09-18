# e2e (@devdigest/e2e)

## Before answering

Search `e2e/docs/` and `e2e/INSIGHTS.md` first. (`e2e/specs/` here means
agent-browser flow definitions, not narrative specs — see below.)

## Tech stack

Deterministic UI flows driven by Vercel `agent-browser` (Rust + CDP), **not**
Playwright — no LLM, no API key, no `chat` command. Each flow is a JSON
command list run in order against one shared browser session by `run.ts`.

## Commands

- Install once: `npm i -g agent-browser && agent-browser install`.
- Hermetic (recommended): `./scripts/e2e.sh` — isolated Postgres/API/web on
  alternate ports, freshly seeded every run, safe alongside your normal dev
  stack.
- Against your own running stack (only if it holds *only* the seeded repo):
  `cd e2e && npm test`.
- Typecheck: `npm run typecheck`.
- Lint: `npm run lint` (eslint).

## Naming conventions

- Flows are named `NN-name.flow.json` under `specs/`, numbered in run order.
- Locators must be deterministic only (`--url`, `--text`,
  `find role|text|label`) — never the AI `chat` command, so runs stay stable
  and key-free.

## Conventions (not obvious from code)

- Each flow is a JSON command list (`specs/NN-name.flow.json`) run verbatim
  through `agent-browser` by `run.ts` — no Playwright, no LLM, no API key.
- `wait --text` / `wait --url` ARE the assertions; a non-zero exit fails the
  step.
- Locators stay deterministic only (`--url`, `--text`, `find role|text|label`)
  — never the AI `chat` command.

## Do-not-touch

- Flows must keep targeting read-only seeded data (`acme/payments-api`, PR
  #482) — nothing in a flow should trigger a model call.
- `package-lock.json` — never hand-edit, only regenerate via `npm install`.

## Use when

- Flow anatomy, coverage table, hermetic vs local run → read `README.md`
- Deep-dives / running notes → `docs/` · `INSIGHTS.md`
- What a route/endpoint actually returns → `../client/README.md` ·
  `../server/README.md`
- Cross-package rules → `../CLAUDE.md`
