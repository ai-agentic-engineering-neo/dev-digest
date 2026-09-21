# reviewer-core/ — @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → grounded findings. No database,
GitHub, or filesystem access. Read [../CLAUDE.md](../CLAUDE.md) for the
repo-wide picture first.

## Read when

- Pipeline stages and public API: read [README.md](README.md).
- Deeper architecture notes/decisions beyond the README: read [docs/](docs/).
- Feature/requirement specs before adding a prompt slot or pipeline stage:
  read [specs/](specs/).
- Past gotchas and decisions from earlier sessions: read [INSIGHTS.md](INSIGHTS.md).

## Non-default conventions

- The only side effect is an LLM call through an **injected** `LLMProvider`
  — never import a concrete provider directly, so the engine stays
  mock-testable.
- The package never emits JS; `build` is a type-check only. The server
  consumes this package's TypeScript source directly via a tsconfig path
  alias, not a built artifact.
- Untrusted content (diff, PR body, comments) is always fenced with
  `wrapUntrusted()` + `INJECTION_GUARD` before it reaches the model — never
  keyword-scanned or trusted as instructions.

## Gotchas

- `groundFindings()` is a mandatory gate: a finding that doesn't cite a real
  diff line is dropped, and the score is recomputed from survivors — the
  model's self-reported score is never trusted.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) exist for
  later course lessons; when a caller omits them, `assemblePrompt` just
  leaves the section out — don't add fallback/placeholder text for them here.

## Do-not-touch

- Nothing vendored in this package — it has no `vendor/` directory.

## Commands

`npm test` (vitest, hermetic, stubbed `LLMProvider`) · `npm run typecheck`
(doubles as the build)
