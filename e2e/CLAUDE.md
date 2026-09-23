# e2e (`@devdigest/e2e`) — agent notes

Deterministic browser flows over the real stack, no LLM. **npm, not pnpm** — own
`package-lock.json`.

Stack: TypeScript 5.7 (ESM) run with tsx · agent-browser CLI (Chrome for Testing; headless per
`agent-browser.json`) · no runtime dependencies.

## Commands

```sh
npm i -g agent-browser && agent-browser install   # once — downloads Chrome for Testing
npm run e2e:hermetic   # RECOMMENDED: throwaway seeded stack (PG :5433, API :3101, web :3100)
npm test               # flows against whatever runs on E2E_BASE_URL (default :3000)
npm run typecheck
```

## Conventions

- A flow is `specs/NN-name.flow.json`. `run.ts` picks up only `*.flow.json`, in
  filename order, all in one shared browser session.
- `wait --text` / `wait --url` **are** the assertions (they exit non-zero on
  timeout); `assert.stdoutIncludes` is optional. `{BASE}` becomes `E2E_BASE_URL`.
- Deterministic locators only: `--url`, `--text`, `find role|text|label`. Never
  the AI `chat` command.
- Read-only against seeded data (`acme/payments-api`, PR #482, seeded agents):
  no flow may write or trigger a model call.

## Naming

- Flows `specs/NN-kebab.flow.json`: the number sets the run order (take the next free one),
  and `"name"` is a sentence — it is the PASS/FAIL line in the output.
- A failing flow's screenshot is `test-results/<NN-kebab>-fail.png`, named after the flow file.

## Gotchas

- Plain `npm test` against your dev DB fails flows 02/04/05: the root route
  redirects to the *first* repo, and a dev DB has several. Use `e2e:hermetic`.
- A failing step surfaces as the raw agent-browser exit code plus
  `test-results/<flow>-fail.png` — read stderr, there is no matcher diff.

## Do not touch

- Don't put prose in `specs/` — it is the runner's directory. Written specs go in
  `docs/`.
- Exception: [`specs/flows.md`](specs/flows.md), the prose contract of the flows — `run.ts`
  loads only `*.flow.json`, so the runner never picks it up.

## Read when

- Read [`INSIGHTS.md`](INSIGHTS.md) before starting; append what you learned at
  the end.
- Write to `INSIGHTS.md` only through the `engineering-insights` skill — it
  appends and never edits existing entries.
- Read [`docs/`](docs/README.md) for this package's written specs (`specs/` holds
  only executable flows — see [`specs/README.md`](specs/README.md)).
- Read [`docs/hermetic-runner.md`](docs/hermetic-runner.md) before changing `../scripts/e2e.sh` or
  `run.ts`, or when a hermetic run misbehaves.
- Read [`specs/flows.md`](specs/flows.md) before changing a flow, the seed, or UI copy a flow asserts.
- Read [`README.md`](README.md) for the flow format, the hermetic runner and coverage.
- Read [`../client/README.md`](../client/README.md) when a flow breaks after a UI
  route or copy change.
- Read [`../TESTING.md`](../TESTING.md) for where this suite sits in CI.
