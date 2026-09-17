# The e2e runner

Deeper than [../README.md](../README.md), which covers the flow format and how to run the suite. This file explains how the harness works and why it is shaped this way.

## Why a harness instead of a test framework

`agent-browser` is a browser-automation CLI, not a test runner. Rather than wrap it in Playwright or vitest, this package adds the smallest possible convention: a flow is a JSON list of CLI commands, and `run.ts` executes them in order against one shared browser session. The result is that a flow is readable by anyone who knows the CLI, and adding coverage requires no TypeScript.

## Execution model

1. `run.ts` reads every `specs/*.flow.json` in lexical filename order.
2. For each step it substitutes `{BASE}` with `E2E_BASE_URL` and spawns `agent-browser` with the command verbatim, under `E2E_STEP_TIMEOUT`.
3. A non-zero exit fails the step and aborts the flow. Because `wait --text` and `wait --url` exit non-zero on timeout, they *are* the assertions.
4. An optional `assert.stdoutIncludes` adds a substring check on the command's stdout.
5. Failures write a screenshot into `test-results/`, which CI uploads as an artifact.
6. The harness prints a per-flow summary and exits non-zero if any flow failed.

The agent-browser daemon keeps the page alive between invocations, so steps within a flow build on one another — and flows are not isolated from each other, which is why they only read seeded data.

## Determinism rules

- Deterministic locators only: `--url`, `--text`, `find role|text|label`.
- The AI `chat` command is never used, so no model and no API key are involved.
- Flows exercise read-only seeded data, so no run mutates state another flow depends on.
- Nothing asserts on data a developer happened to import locally.

## The hermetic stack

`scripts/e2e.sh` (repo root) brings up an isolated Postgres (no persistent volume), API, and web app on alternate ports, migrates and seeds, runs the flows, and tears everything down. It can run alongside the normal dev stack and never touches the `devdigest_pgdata` volume.

This exists because several flows follow the home redirect to the *first* repo and therefore need the seeded demo repo to be the only one — a condition CI guarantees and a working dev database usually violates.

## CI

`.github/workflows/e2e-web.yml` runs the suite against a freshly seeded stack, with a path filter so it only triggers on relevant changes. Failure screenshots are uploaded as artifacts.
