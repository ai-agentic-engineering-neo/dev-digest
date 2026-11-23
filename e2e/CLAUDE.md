# e2e — deterministic browser flows for client via agent-browser (CDP). No Playwright, no LLM, no keys.

## Stack
agent-browser CLI · tsx · TypeScript 5.7 · **npm** (package-lock.json, not pnpm)

## Commands
- Recommended (isolated stack on :5433/:3101/:3100): `../scripts/e2e.sh` or `npm run e2e:hermetic`
- Against your own stack: `../scripts/dev.sh`, then `npm test` — only if the DB contains only the seeded repo
- `npm run typecheck`
- One-time: `npm i -g agent-browser && agent-browser install`

## Map
- specs/NN-name.flow.json — a flow: a list of agent-browser commands (these are the tests)
- run.ts — runner: executes a flow in a single browser session; lib/assert.ts — checks
- test-results/ — failure screenshots (git-ignored, a CI artifact)

## Conventions
- All documentation is written in English (CLAUDE.md, README, flow labels, INSIGHTS, code comments)
- New flow = a new specs/NN-name.flow.json with the next number; every step has a `label`
- Assertions are `wait --text` / `wait --url` (+ optionally `assert.stdoutIncludes`)
- Deterministic locators only: `--url`, `--text`, `find role|text|label`. Never use the `chat` command
- Flows read only seeded data (acme/payments-api, PR #482, seeded agents) and submit nothing

## Gotchas
- Flows 02/04/05 fail on a dev DB with other repos: the redirect goes to the FIRST repo
- `{BASE}` is substituted from E2E_BASE_URL (default http://localhost:3000)

## Read when
- Before adding or changing a flow → read README.md ("How a flow works", "Coverage")
- Before changing ports/env or the runner → read README.md ("Run locally")
- Before changing CI wiring → read ../TESTING.md
- Before editing anything here → read INSIGHTS.md

## Insights
This package's lessons live in INSIGHTS.md (append-only, 7 sections). Hooks handle reading at the start and the wrap-up at the end; selection rules, format and writing — skill `engineering-insights` (`/engineering-insights`, `/engineering-insights review`).
An entry that fired twice → move it to Gotchas and mark it in INSIGHTS with a new entry `(→ CLAUDE.md)`.
