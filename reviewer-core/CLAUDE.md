# reviewer-core (`@devdigest/reviewer-core`)

## Overview

Pure review engine: diff → prompt → LLM → grounded findings. No database,
GitHub, or filesystem — the only side effect is an LLM call through an
injected `LLMProvider`.

## Commands

- `npm test` — vitest, stubbed `LLMProvider`.
- `npm run typecheck` — doubles as the build; the package never emits JS.

## Conventions

- Pipeline: `assemblePrompt` → `wrapUntrusted` + `INJECTION_GUARD` →
  `LLMProvider` → structured-output parsing → `groundFindings`. Consumed by
  the server via a tsconfig path alias (`@devdigest/reviewer-core` →
  `../reviewer-core/src`) — TypeScript source directly, not a built package.
- `score` is always recomputed from grounded findings
  (`scoreFromFindings`) — never trust `score` reported by the model.
- A finding without a real diff-line citation is dropped by `groundFindings`
  by design.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`, a
  `reduce()`/map-reduce path, `toReview` CI helper) exist for later course
  lessons; the starter server only feeds diff/system-prompt/repo-map, so
  their absence today is expected.
- `verdict` is currently passed through from the model unchanged (not
  derived) — the prompt's verdict-mapping convention is load-bearing.

## Do not touch

- Never add DB/filesystem/network code directly into this package — it
  breaks the "pure engine, mock-testable" guarantee the whole design relies
  on.
- Never loosen `INJECTION_GUARD` or the grounding gate to make a test pass —
  they are the product's core safety mechanism.

## Gotchas

- "Build" here is `tsc --noEmit`, not a bundle — don't expect emitted JS or
  add a bundler step.

## Reference

- `reviewer-core/README.md` — read first: pipeline diagram, public API.
- `../docs/agent-prompts/README.md` — read before touching `prompt.ts`,
  `grounding.ts`, `run.ts`, or `reduce.ts`; explains why each convention
  above exists and what silently breaks if violated.
- `../TESTING.md` — read before any test change.
- `reviewer-core/docs/`, `reviewer-core/specs/` — deeper design notes /
  formal specs; currently empty placeholders, read when populated.
- `../.claude/rules/` — always-applied project rules; authoritative over
  this file if it ever contains anything.
