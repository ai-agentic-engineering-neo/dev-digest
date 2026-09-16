# @devdigest/e2e

Deterministic browser flows driven by agent-browser (Rust + CDP).
No Playwright, no LLM, no API key.

## Read when

- **Writing or debugging a flow** → read `README.md` (flow format and commands).
- **Debugging something that smells familiar** → read `INSIGHTS.md`; run the
  `engineering-insights` skill at the end of the task to add to it.

## Naming warning

`specs/` in THIS package means browser flow specs (`NN-name.flow.json`), not
lesson/task specs. Task specs for e2e work go in `docs/` or the repo-root `specs/`.

## Rules

- A flow is JSON in `specs/NN-name.flow.json`; each `cmd` is passed to the CLI as-is.
- The assertions ARE `wait --text` and `wait --url`. A non-zero exit fails the step.
- Locators must be deterministic only. Never use the AI `chat` command.
- Flows run against read-only seeded data (`acme/payments-api`, PR #482), so
  nothing may trigger a model call.

## Gotchas

- Requires a freshly seeded database. Flow `02` follows the home redirect to the
  *first* repo, so it assumes the seeded demo repo is the only one.
- This package uses npm (`package-lock.json`), not pnpm.
