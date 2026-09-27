# e2e — `@devdigest/e2e`

Deterministic browser flows for the web app, driven by Vercel **agent-browser**
(a Rust + CDP automation CLI). No Playwright, no LLM, no API key. agent-browser is not
a test framework, so this package adds one convention: a flow is a JSON list of commands,
run in order against one shared browser session by `run.ts`. npm, not pnpm.

## Commands

- `./scripts/e2e.sh` (or `npm run e2e:hermetic`) — **the normal way to run**:
  isolated stack on Postgres :5433, API :3101, web :3100, seeded and torn down after
- `npm test` — runs the flows against whatever is on `E2E_BASE_URL` (default :3000)
- One-time setup: `npm i -g agent-browser && agent-browser install`

## Map

- `specs/NN-name.flow.json` — executable flows, run in lexical filename order
- `specs/<slug>.spec.md` — written specs; `run.ts` loads only `*.flow.json`
- `run.ts` — the runner; `lib/assert.ts` — argument resolution and stdout checks
- `test-results/` — failure screenshots (git-ignored, uploaded by CI)

## Read when

- Writing or editing a flow → `README.md` § "How a flow works" for the step schema
  and the available assertions.
- A flow fails only on your machine → the **freshly-seeded DB** precondition note
  in `README.md` § "How a flow works".
- Deciding between a browser flow and a component test → `../TESTING.md`.
- The UI under test changed → `../client/AGENTS.md`.
- Working from a spec → `specs/<slug>.spec.md`, before writing the flow.
- Something behaves inexplicably → `INSIGHTS.md` (§ What Doesn't Work, § Recurring Errors).
- You learned something non-obvious → append it to the matching `INSIGHTS.md` section.
- Writing a flow that asserts on data → `docs/seeded-fixtures.md` (what the seed
  really contains; there is no `SUGGESTION` finding).
- Deeper background → `docs/`.

## Conventions

- **Deterministic locators only**: `--url`, `--text`, `find role|text|label`. The AI
  `chat` command is never used — that is what keeps runs stable and key-free.
- `wait --text` / `wait --url` **are** the assertions: they exit non-zero on timeout,
  which fails the step and the flow.
- Flows are read-only over seeded data (`acme/payments-api`, PR #482, seeded agents),
  so nothing triggers a model call.
- `{BASE}` in a step is substituted with `E2E_BASE_URL`.
- Coverage is typological: the main journeys, not every screen.

## Naming

- Executable flows are `specs/NN-name.flow.json`, numbered in run order; written
  specs are `specs/<slug>.spec.md`.
- Every step carries a `label` — it is the line you read in the failure output.

## Do not touch

- `package-lock.json` — npm here, not pnpm; never hand-edited.
- `test-results/` — regenerated artifacts.
- The `*.flow.json` extension: the runner filters on it and ignores everything else
  in `specs/`, including markdown specs and this file's neighbours.

## Gotchas

- Flows 02, 04 and 05 follow the home redirect to the **first** repo, so they assume
  the seeded demo repo is the only one. Against a real dev DB they land on the wrong
  repo and fail — that is the reason for the hermetic runner.
- **Never `docker compose down -v`** to "reset" the dev DB: it deletes the
  `devdigest_pgdata` volume with every imported repo and review.
