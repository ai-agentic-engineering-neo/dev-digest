# reviewer-core — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-07-29** — This package deliberately never emits JavaScript: `build` is a type-check and consumers import the TypeScript source through a path alias, so adding an `outDir` or a dist step would give consumers a second, stale copy of the engine. Evidence: `reviewer-core/tsconfig.json:18`, `reviewer-core/package.json` `"build": "tsc --noEmit -p tsconfig.json"`.

## Tool & Library Notes

- **2026-07-29** — `zod` is pinned to this package's own `node_modules` by a tsconfig path alias, not left to normal resolution, because the server consumes this package as source and would otherwise supply its own `zod` — two instances break schema identity in ways that surface as confusing runtime validation failures, not import errors. Evidence: `reviewer-core/tsconfig.json:24-25`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
