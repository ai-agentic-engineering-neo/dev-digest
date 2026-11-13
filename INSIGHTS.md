# Insights — project-wide

Non-obvious, actionable lessons that span packages — treat as high-confidence guidance.
Agents append via the `engineering-insights` skill (dated, atomic, append-only);
humans consolidate at ~100 entries. Package-specific insights go in `<package>/INSIGHTS.md`.

## What Works
<!-- Approaches, patterns and solutions that proved effective -->

## What Doesn't Work
<!-- Dead ends and anti-patterns: the wrong approach and the right one -->

- **2026-09-23 · Shared contracts drift** — `server/src/vendor/shared` and
  `client/src/vendor/shared` are manual copies and already differ (`adapters.ts`,
  `contracts/trace.ts`, `eval-ci.ts`, `knowledge.ts`, `productionize.ts`). Diff them
  before relying on a field existing on both sides.

## Codebase Patterns
<!-- Conventions, architecture decisions, naming -->

- **2026-09-23 · No workspace** — packages link through tsconfig `paths` to raw `.ts`
  source, not published modules. `reviewer-core` resolves `@devdigest/shared` from
  `../server/src/vendor/shared`, so the engine depends on a folder inside the server.
- **2026-09-23 · Lesson placeholders** — the DB schema, shared contracts and
  `client/messages/en` already contain entities for later lessons (eval, ci, skills,
  knowledge…). Empty tables and unused contracts are expected, not dead code.
- **2026-09-23 · Task tags** — code comments use tags like `T1.3`, `T3`, `F1`. They are
  internal task IDs, not course lesson numbers.

## Tool & Library Notes
<!-- Quirks and gotchas of dependencies -->

- **2026-09-23 · Duplicate zod instances** — each package has its own `zod`, so
  `instanceof ZodError` can fail across packages. `reviewer-core` pins `zod` to its own
  `node_modules`; `server/src/app.ts` also detects ZodError by shape.

## Recurring Errors & Fixes
<!-- Error message / symptom → fix -->

## Session Notes
<!-- Dated 1–2 sentence summaries of meaningful sessions -->

## Open Questions
<!-- Unresolved items worth investigating -->
