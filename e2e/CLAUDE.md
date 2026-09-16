# e2e/CLAUDE.md — @devdigest/e2e

Deterministic browser e2e via Vercel **agent-browser** (native Rust+CDP CLI).
**No Playwright, no LLM, no API key.** Repo-wide rules: [../CLAUDE.md](../CLAUDE.md).

## Stack

`agent-browser` CLI (installed globally: `npm i -g agent-browser && agent-browser install`)
driven by `run.ts`. Each flow is a JSON command list, not a test-framework spec.

## Commands

```sh
../scripts/e2e.sh          # hermetic (recommended) — isolated stack, own ports/DB
# or: npm run e2e:hermetic
npm test                   # against your own already-running dev stack (see Gotchas)
npm run typecheck
```

## Where things live

- `specs/NN-name.flow.json` — one flow = one JSON step list, run in order against one shared browser session
- `specs/*.md` — behavioral coverage docs (this project's "specs" folder is dual-purpose: `.flow.json` = executable test steps, `.md` = docs about what they guarantee)
- `lib/assert.ts` — the `stdoutIncludes` assertion helper
- `run.ts` — the runner: reads `specs/*.flow.json`, executes each `cmd` via `agent-browser`, fails on non-zero exit

## Non-default conventions

- Locators are deterministic only (`--url`, `--text`, `find role|text|label`).
  The AI `chat` command is never used — that's what keeps runs stable and key-free.
- `wait --text` / `wait --url` **are** the assertions — they time out and exit
  non-zero if the condition never holds; there's no separate "expect" step.
- Flows target read-only seeded data only (`acme/payments-api`, PR #482, the
  two built-in agents) — nothing here triggers a real model call.

## Gotchas

- **Precondition: a freshly-seeded DB.** Flow `02` follows the home redirect
  to the *first* repo, assuming the seed is the only one. A local dev DB with
  other imported repos makes flows 02/04/05 land on the wrong repo and fail —
  use the hermetic runner (`../scripts/e2e.sh`), which owns its own DB.
- **Never `docker compose down -v`** to "reset" — it deletes the
  `devdigest_pgdata` volume, i.e. every real imported repo/review, not just test data.
- Failure screenshots land in `e2e/test-results/` (git-ignored, uploaded as a CI artifact).

## Do-not-touch without reading first

- `package-lock.json` — never hand-edit; regenerate via `npm install` after a `package.json` change.

## Read When

- **Writing/debugging a flow, or the agent-browser command set** → [docs/flows.md](docs/flows.md)
- **Checking what user journeys are covered vs. not** → [specs/coverage.md](specs/coverage.md)
- **Hit unexpected behavior here** → [INSIGHTS.md](INSIGHTS.md)

## Docs map

- [README.md](README.md) — flow schema, hermetic vs. own-stack running, coverage table
- [docs/](docs/) — deep-dive reference (flow authoring, agent-browser commands, hermetic stack topology)
- [specs/](specs/) — behavioral coverage docs (`.md`) alongside the executable flows (`.flow.json`)
- [INSIGHTS.md](INSIGHTS.md) — append-only dev log of session findings
