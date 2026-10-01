# devdigest-mcp — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

## Decisions

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-10-01** — Services throw `ToolError` (a model-safe message) next to
  the adapter's `ApiError`; `toolResult` renders both and turns anything else
  into a generic message, which keeps `tools/*` thin. Evidence:
  `src/domain/errors.ts`, `src/tools/result.ts`.

## Tool & Library Notes

- **2026-10-01** — In `src/tools/*` import `z` from `zod/v3`, not `zod`: with
  the tsconfig alias `zod -> ./node_modules/zod`, `import { z } from 'zod'`
  resolves to different declaration files than the SDK's `zod/v3`, and
  `registerTool` raw shapes fail typecheck with `ZodNumber` not assignable to
  `AnySchema` and TS2589; runtime is fine. Evidence: `src/tools/schemas.ts`.

- **2026-10-01** — zod v3 JSON Schema from `listTools()` uses
  `exclusiveMinimum: 0` for `.positive()` and `format: "uuid"` for `.uuid()`;
  `.default()` emits `default` and the field is not in `required`; the SDK adds
  `execution: {taskSupport: "forbidden"}` to every listed tool, so assert tool
  fields individually, never `toEqual` a whole tool. Evidence:
  `test/registration.test.ts`.

## Recurring Errors & Fixes

## Open Questions
