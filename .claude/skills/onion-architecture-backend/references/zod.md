# Zod at the boundaries

Zod appears in three rings for three different jobs. Keeping them apart is
most of rule 9. Schema syntax is in the vendored `zod` skill.

| Ring | File | Job | Example |
|---|---|---|---|
| 0 Contracts | `vendor/shared/contracts/*.ts` | The domain types shared with the client. `export const Agent = z.object(…)` + `export type Agent = z.infer<typeof Agent>` | `RunSummary`, `PrMeta`, `Finding` |
| 3b Routes | `modules/<m>/routes.ts` | The HTTP shape: `params`, `body`, `querystring`, `response`. Declared in the route `schema`, validated by the type provider before the handler runs | `CreateAgentBody`, `IdParams` |
| 3a Adapters | `adapters/<vendor>/*.ts`, `platform/structured.ts` | Parsing untrusted third-party JSON on receipt (LLM output, OpenRouter `/models`) | `parseWithRepair`, `ModelInfo` |

Rules:

- A route schema may *reuse* a contract (`Provider`, `ReviewStrategy`) but never a table shape. A contract never imports a route schema.
- Never `Schema.parse(req.body)` inside a handler. The type provider already did it; a second parse either duplicates or, worse, uses a different schema (baseline entry: `reviews/routes.ts`).
- `response` schemas are worth declaring: they are the serializer and stop a leaked column (`workspaceId`, a token) from reaching the client. Add them when touching a route.
- Services and repositories do not call `parse`. A service receives already-typed input from the route or the job runner. The one exception is stored JSON whose shape is versioned (`AgentVersionConfig.parse(row.configJson)` in `agents/helpers.ts`), which is a mapping concern; put it in the repository's row-to-DTO mapper when you next touch it.
- Config is a Zod schema over `process.env` in `platform/config.ts` and nowhere else; secrets never enter it.
- `err instanceof z.ZodError` is unreliable when shared and api load separate zod copies; the error handler matches by name and `issues` (`server/INSIGHTS.md`). Do not add another `instanceof` check.
