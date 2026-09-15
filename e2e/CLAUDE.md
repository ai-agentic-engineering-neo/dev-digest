# e2e (@devdigest/e2e)

## Before answering

Search `e2e/docs/` and `e2e/INSIGHTS.md` first. (`e2e/specs/` here means
agent-browser flow definitions, not narrative specs — see below.)

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

## Use when

- Flow anatomy, coverage table, hermetic vs local run → read `README.md`
- Deep-dives / running notes → `docs/` · `INSIGHTS.md`
- What a route/endpoint actually returns → `../client/README.md` ·
  `../server/README.md`
- Cross-package rules → `../CLAUDE.md`
