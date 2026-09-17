# `@devdigest/reviewer-core` — the review engine

Pure review logic: **diff → prompt → LLM → grounded findings**. No database,
GitHub, or filesystem; the only side effect is an LLM call through an **injected**
`LLMProvider`, which is what makes it mock-testable.

In the starter the server (`@devdigest/api`) is its only consumer, for local
reviews in the studio. The CI runner that runs the same engine in GitHub Actions
comes back in the Export-to-CI lesson (L06).

## Quick start

```sh
npm install
npm test          # vitest, hermetic, stubbed LLMProvider — no keys, no network
npm run typecheck # doubles as the build; this package never emits JS
```

Consumers wire it through a tsconfig path alias to `src/`, so there is nothing to
build or publish between packages.

## Where to read next

| Topic | Document |
|-------|----------|
| File map, conventions, gotchas, do-not-touch zones | [CLAUDE.md](CLAUDE.md) |
| Non-obvious findings recorded while working here | [INSIGHTS.md](INSIGHTS.md) |
| Every pipeline stage, the public API, packaging | [docs/pipeline.md](docs/pipeline.md) |
| Grounding, scoring, and prompt-safety guarantees | [specs/grounding-and-scoring.md](specs/grounding-and-scoring.md) |
| Test strategy | [../TESTING.md](../TESTING.md) |
