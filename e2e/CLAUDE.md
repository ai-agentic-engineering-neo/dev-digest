# e2e — browser flows

Before changing this package read `docs/README.md`.
Feature contracts: not here — `specs/` holds executable flows; see `client/specs/` and `server/specs/`.

agent-browser (Rust + CDP) · tsx · package manager: npm. No Playwright, no LLM, no API keys.

## Commands
- `npm test` — runs flows against a running stack (`E2E_BASE_URL`, default http://localhost:3000)
- `npm run e2e:hermetic` — full hermetic run via `../scripts/e2e.sh`
- `npm run lint` · `npm run typecheck` — static checks, no browser needed

## Map
- `specs/NN-name.flow.json` — executable flows (JSON list of agent-browser commands), NOT docs
- `run.ts` — runner: picks every `specs/*.flow.json` in order, one shared browser session
- Feature specs are not kept here: the required flow is listed in the implementing package's spec

## Rules
- Deterministic locators only: `wait --url|--text`, `find role|text|label`. Never the AI `chat` command.
- Flows use read-only seeded data (acme/payments-api, PR #482, seeded agents) — never trigger a model call.
- `wait` commands ARE the assertions; add `assert.stdoutIncludes` only when needed.

## Gotchas
- Requires a freshly-seeded DB: flow 02 follows the redirect to the first repo, assuming it is the only one.

## Read when
- Writing or debugging a flow → `README.md`
- A flow is flaky or fails only in CI → `INSIGHTS.md`, then `../.github/workflows/e2e-web.yml`
