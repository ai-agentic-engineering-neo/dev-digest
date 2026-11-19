# e2e — @devdigest/e2e

agent-browser CLI (Rust + CDP) driven by `run.ts` (tsx). No Playwright, no LLM.
Package manager: npm.

## Commands
- `npm test` — needs running stack at `E2E_BASE_URL` (default :3000)
- `npm run e2e:hermetic` — brings up full stack via ../scripts/e2e.sh

## Map
- `run.ts` — runner · `lib/` — assertion helpers · `specs/NN-name.flow.json` — the flows

## Conventions
- `specs/` here = executable flows, NOT design specs. Design notes → docs/.
- Flow = JSON list of agent-browser commands; `wait --text` / `wait --url` are the assertions.
- Flows rely on seeded data (server `db:seed`) — never on LLM output.

## Read when…
- Writing a flow → README.md
- Deep dives → docs/
- Before any change → INSIGHTS.md
