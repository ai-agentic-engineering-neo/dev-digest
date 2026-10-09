# e2e (`@devdigest/e2e`) — agent map

Deterministic browser flows over the main user journeys, driven by the agent-browser CLI.
Flow format and how a run works: [README](README.md).

## Stack

Node ≥ 22 · TypeScript · tsx · [agent-browser](https://github.com/vercel-labs/agent-browser)
CLI (Rust + CDP) · **npm**. No Playwright, no LLM, no API keys.

## Commands

```sh
npm i -g agent-browser && agent-browser install   # once
npm install
../scripts/dev.sh        # in another shell — full stack on a freshly seeded DB
npm test                 # runs every specs/*.flow.json against E2E_BASE_URL (default :3000)
npm run e2e:hermetic     # ../scripts/e2e.sh — own ephemeral Postgres + API + web on alt ports
                         # (safe alongside your dev stack; local only, CI calls `npm test`)
npm run typecheck
```

## Where things live

- `specs/NN-name.flow.json` — one flow per file, run in name order
- `run.ts` — runner (one shared browser session); `lib/assert.ts` — stdout assertions
- `agent-browser.json` — CLI config

## Conventions

- Each step's `cmd` goes verbatim to agent-browser; `wait --url` / `wait --text` **are** the assertions.
- Locators are deterministic only: `--url`, `--text`, `find role|text|label`.
- `{BASE}` in a command is replaced with `E2E_BASE_URL`.
- Flows read seeded data only (`acme/payments-api`, PR #482, built-in agents) — never trigger a review/model call.

## Gotchas

- Needs a **freshly seeded** DB: flow `02` follows the home redirect to the *first* repo and
  assumes the demo repo is the only one. Extra repos in your local DB break it.
- UI text or route changes in `client/` can break `wait --text`/`--url` steps — update flows with them.
- Only `*.flow.json` files in `specs/` are run; other files there are ignored.

## Do not touch

- Never use the agent-browser AI `chat` command — it makes runs non-deterministic and needs a key.

## Read before you work

- Flow specs → [specs/](specs/README.md)
- Deeper reference → [docs/](docs/README.md) · test strategy → [../TESTING.md](../TESTING.md)
- Past learnings → [INSIGHTS.md](INSIGHTS.md) — read before non-trivial work; new entries are
  added by the `engineering-insights` skill (append-only, no duplicates).
