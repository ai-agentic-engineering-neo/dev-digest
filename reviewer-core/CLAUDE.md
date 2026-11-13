# reviewer-core — `@devdigest/reviewer-core`, the pure review engine

Full description: [README.md](README.md). Project root: [../CLAUDE.md](../CLAUDE.md)

## Commands

- `npm test` — vitest with a stubbed `LLMProvider`; no keys, no network
- `npm run typecheck` — also serves as the build (the package never emits JS)

## Module boundaries

- Depends on: `@devdigest/shared` (resolved from `../server/src/vendor/shared`), `zod`, `openai` (OpenRouter client).
- Consumed by: `server/` (and the CI runner, added back in lesson L06) as TypeScript source via path alias.
- Does NOT: touch the DB, GitHub or the filesystem. The only side effect is the injected `LLMProvider`.

## Rules

- Keep it pure: new inputs arrive as resolved strings or data from the caller, never fetched here.
- The public surface is exactly what `src/index.ts` exports; add exports there deliberately.
- Every finding passes through `groundFindings`; the score is recomputed from surviving findings.
- Untrusted content (diff, PR body, repo map, specs) is wrapped with `wrapUntrusted`;
  prompt-injection defense is the shared `INJECTION_GUARD`, not keyword scanning.
- Cancellation stays caller-owned via `checkCancelled`; don't import server error types.

## Documentation

| When | Read |
|---|---|
| Understanding the pipeline | [README.md — Pipeline](README.md#pipeline) |
| Adding / changing an export | [README.md — Public API](README.md#public-api) |
| Why the prompt looks the way it does | [../server/README.md — Review context](../server/README.md#review-context-non-obvious) |
| Writing tests | [README.md — Testing](README.md#testing), [../TESTING.md](../TESTING.md) |
| Deeper engine docs | [docs/](docs/README.md) |
| Implementing a feature | [specs/](specs/README.md) — find the spec first |

## Insights

@INSIGHTS.md
