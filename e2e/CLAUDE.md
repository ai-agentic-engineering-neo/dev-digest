# `e2e/` — @devdigest/e2e

Deterministic browser flows over the web app, driven by Vercel agent-browser
(native Rust + CDP CLI). No Playwright, no LLM, no API key. Full docs:
[`README.md`](README.md). Deeper notes: [`docs/`](docs/) ·
[`docs/specs/`](docs/specs/) · [`INSIGHTS.md`](INSIGHTS.md).

> **Naming note:** `specs/` at this package's top level already means
> something else here — see Map below. Design/feature specs for this package
> live at `docs/specs/` instead.

## Stack

`agent-browser` CLI (Rust + CDP, installed separately: `npm i -g agent-browser
&& agent-browser install`) · thin TypeScript runner (`run.ts`) · no
Playwright, no LLM, no browser-automation library dependency.

## Commands

```
./scripts/e2e.sh              # hermetic: isolated stack (PG :5433, API :3101,
                               # web :3100), seeded fresh, torn down after —
                               # recommended, never touches your dev DB
npm test                      # against your own ./scripts/dev.sh stack —
                               # only safe with a freshly-seeded DB
```

## Map

- `specs/*.flow.json` — **test-flow specs**: ordered lists of agent-browser
  commands, one file per user journey (`01-app-boot`, `02-repo-pulls-detail`,
  …). Not the same thing as "design specs" — see the naming note above.
- `run.ts` — executes a flow spec against one shared browser session
- `agent-browser.json` — CLI config
- `lib/` — runner helpers

## Conventions & gotchas (non-default, not guessable from the code)

- Locators are deterministic only (`--url`, `--text`,
  `find role|text|label`) — never the AI `chat` command. That's what keeps
  runs stable and key-free.
- Flows assume a freshly-seeded DB containing **only** the demo repo
  (`acme/payments-api`, PR #482) — running against your normal dev DB makes
  flows `02`/`04`/`05` land on the wrong repo and fail.
- `"assert": { "stdoutIncludes": "…" }` in a flow step adds a substring check
  on that command's stdout, on top of the pass/fail exit code.

## Do not touch

- **Never `docker compose down -v`** to "reset" your dev DB — it deletes the
  `devdigest_pgdata` volume along with every real repo and review you've
  imported. Use `./scripts/e2e.sh` (hermetic, isolated Postgres) instead.
