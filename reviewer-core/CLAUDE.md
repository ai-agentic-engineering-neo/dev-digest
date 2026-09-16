# reviewer-core/CLAUDE.md — @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → grounded findings. No database,
GitHub, or filesystem access. Repo-wide rules: [../CLAUDE.md](../CLAUDE.md).

## Stack

Plain TypeScript, no framework. The only side effect is an LLM call through
an **injected** `LLMProvider` — that's what makes the whole package
mock-testable. Uses **npm** (`package-lock.json`), not pnpm, unlike
`server/`/`client/`.

## Commands

```sh
npm run typecheck   # also doubles as `build` — the package never emits JS
npm test            # vitest, hermetic, LLM stubbed — no keys, no network
```

## Where things live

- `src/prompt.ts` — `assemblePrompt()` / `wrapUntrusted()` + `INJECTION_GUARD`
- `src/grounding.ts` — `groundFindings()` / `groundingSummary()`, the mandatory citation gate
- `src/llm/openrouter.ts` — the one `LLMProvider` implementation (OpenRouter)
- `src/llm/structured.ts` — Zod → JSON Schema + `parseWithRepair`
- `src/review/run.ts` — `reviewPullRequest()`, the single-pass orchestrator
- `src/review/reduce.ts` — map-reduce helpers (`reduceReviews`, `sliceDiff`) — unused by the starter server, wired in later lessons
- `src/output/to-review.ts` — `Review` → GitHub-shaped payload
- `src/index.ts` — the only public surface; import from here, not deep paths

## Non-default conventions

- `build` = `tsc --noEmit`. The server consumes this package as TypeScript
  **source** via a tsconfig path alias (`@devdigest/reviewer-core` →
  `../reviewer-core/src`) — never a compiled artifact.
- The engine accepts optional prompt slots (`skills`, `memory`, `specs`,
  `callers`) that later course lessons feed. The starter server passes only
  diff + system prompt + repo map; `assemblePrompt` simply omits the rest —
  don't add server-side logic to "fill" them early.
- Contracts (`Review`, `Finding`, `Verdict`, …) come from `@devdigest/shared`, not defined locally.

## Gotchas

- `npm install` here, not `pnpm install` — the lockfile is `package-lock.json`.
- Grounding is mandatory and unconditional: a finding without a real diff-line
  citation is dropped, and the score is **recomputed** from survivors — the
  model's self-reported score is never trusted, even in single-finding runs.

## Do-not-touch without reading first

- `prompt.ts`'s `INJECTION_GUARD` — the only defense against prompt injection
  from untrusted PR content; it's a shared rule, not per-call text parsing. See [specs/grounding-spec.md](specs/grounding-spec.md).
- `package-lock.json` — never hand-edit; regenerate via `npm install` after a `package.json` change.

## Read When

- **Changing prompt assembly, the LLM call, or structured-output parsing** → [docs/pipeline.md](docs/pipeline.md)
- **Changing grounding/scoring behavior** → [specs/grounding-spec.md](specs/grounding-spec.md)
- **Hit unexpected behavior here** → [INSIGHTS.md](INSIGHTS.md)

## Docs map

- [README.md](README.md) — pipeline diagram, public API, testing
- [docs/](docs/) — deep-dive reference (the full pipeline, prompt-injection defense)
- [specs/](specs/) — behavioral specs (grounding guarantees)
- [INSIGHTS.md](INSIGHTS.md) — append-only dev log of session findings
