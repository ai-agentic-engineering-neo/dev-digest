# reviewer-core/ — @devdigest/reviewer-core

Pure review engine: **diff → prompt → LLM → grounded findings**. No database,
GitHub, or filesystem — the only side effect is an LLM call through an injected
`LLMProvider`. The server consumes the TypeScript source directly via a tsconfig
path alias; the package never emits JS.

## Commands — npm, not pnpm

| Task | Command |
|------|---------|
| test | `npm test` (hermetic; `LLMProvider` stubbed — no keys, no network) |
| build/typecheck | `npm run typecheck` (type-check **is** the build) |

## Where things lie

- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`.
- `src/grounding.ts` — `groundFindings`: the mechanical citation gate vs the diff.
- `src/llm/structured.ts` — Zod → JSON Schema, `parseWithRepair`.
- `src/review/run.ts` — run orchestration (single-pass), `reduce()`.
- `src/index.ts` — the public API; contracts (`Review`, `Finding`, …) come from
  `@devdigest/shared`.

## Hard rules

- Keep it pure: no I/O beyond the injected provider — that's what makes the
  engine mock-testable and reusable from CI later.
- Grounding is mandatory: a finding that doesn't cite a real diff line is
  dropped, and the score is recomputed from the survivors — never trust the
  model's self-reported score.
- The course prompt slots (`skills`, `memory`, `specs`, `callers`) stay OPTIONAL:
  `assemblePrompt` omits empty sections; don't make any slot required.
- Don't break `src/index.ts` exports casually — they are the server's compile
  surface (it type-checks this source directly).

## Read when …

- Touching the pipeline or public API → read [`README.md`](README.md) (pipeline
  diagram, exported surface).
- Debugging something non-obvious here → read [`INSIGHTS.md`](INSIGHTS.md) first.
- Changing behavior covered by a decision → check [`specs/`](specs/) and update
  the spec in the same PR; how-tos live in [`docs/`](docs/README.md).
