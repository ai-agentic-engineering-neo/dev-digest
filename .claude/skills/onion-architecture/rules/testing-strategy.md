# Testing strategy follows the layer boundary

The repo's test-file convention — `*.it.test.ts` needs a real Postgres (via testcontainers); everything else is hermetic — isn't an arbitrary naming rule. It's a direct consequence of the Dependency Rule, and understanding *why* makes it obvious which bucket a new test belongs in, instead of having to look it up.

## Why hermetic tests are even possible

A hermetic test can't touch a database because the code under test doesn't leave the process. That's only true for domain and application code *if* they were actually written against ports rather than concrete adapters:

- `reviewer-core`'s test suite is entirely hermetic (`npm test` — "vitest, hermetic, stubbed `LLMProvider`; no keys, no network") because `reviewPullRequest` takes an `LLMProvider` as a parameter. A test hands it a stub that returns canned `StructuredResult`s, and `reviewPullRequest`'s orchestration, `groundFindings`'s citation logic, and `assemblePrompt`'s string-building all run for real — just without a real LLM behind them.
- A `service.ts` in `server` is hermetic-testable the same way, *if* it only calls `this.repo`/`container`'s ports: build a `Container` with `ContainerOverrides` pointing at fakes, construct the service with it, and assert on its behavior. The moment a `service.ts` does `db.select()` itself instead of going through `repository.ts`, that test now needs `.it.test.ts` — not because someone chose that, but because the code genuinely can't run without a database anymore.

## The diagnostic

If you're writing a test and reaching for testcontainers/a real Postgres connection for something that "should" be business logic, that's a signal to check the code under test for a Dependency Rule violation before reaching for `.it.test.ts`. Ask:

- Is this actually infrastructure behavior (a Drizzle query's correctness, a real GitHub API response shape)? → `.it.test.ts` is correct and expected — infrastructure-layer code legitimately needs to prove it talks to the real thing correctly.
- Is this a business rule (scoring, grounding, validation, orchestration order) that happens to be entangled with a DB call? → the entanglement is the bug. Extract the rule into a pure function or route it through a port, then it can move to a hermetic test.

## What to test where

| Layer | Test file | What it proves |
|---|---|---|
| Domain | hermetic `*.test.ts` | pure function correctness — same input, same output, always |
| Application | hermetic `*.test.ts`, with stubbed ports (`ContainerOverrides`, a fake `LLMProvider`) | orchestration logic — the right ports get called, in the right order, with the right data |
| Infrastructure | `*.it.test.ts` (real Postgres) or a recorded-fixture test for external APIs | the adapter actually satisfies its port contract against the real thing |
| Presentation | hermetic `*.test.ts` via Fastify's `inject()`, with a test `Container` | request validation and response shaping — not business outcomes |

This is also why the split is worth defending in review: a PR that turns a hermetic application-layer test into an `.it.test.ts` "just to make it pass" is very likely papering over a layering violation rather than fixing one.
