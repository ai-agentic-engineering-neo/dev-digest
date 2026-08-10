# mcp-server — engineering learnings

**While working:** append only. Read the file before writing — if the lesson
is already here, extend that entry instead of adding a second copy. If one
turns out wrong, add a new entry correcting it rather than editing history.

**During a scheduled review** (quarterly, or when this file stops being
useful): merge duplicates, delete entries about code that no longer exists,
and resolve contradictions explicitly — two entries giving opposite advice
make the agent pick at random. Treat this file as a draft under review, not
as truth; a bad entry is worse than a missing one.

## What Works

### 2026-08-06 — SSE-close is the race-free way to know a review run finished; polling would have been strictly worse

`GET /runs/:id/events` (`server/src/modules/reviews/routes.ts`) bridges the
in-memory `RunBus` to an async generator that returns exactly when
`RunBus.complete(runId)` fires. `run-executor.ts` only calls `complete()`
*after* the run's DB status write and trace save have already happened — so
by the time the SSE stream closes, `GET /pulls/:id/runs`'s status for that
run is guaranteed to be settled (`done`/`failed`/`cancelled`), and
`GET /pulls/:id/reviews` is guaranteed to have the matching `ReviewRecord` if
`status === "done"`. `run_agent_on_pr` (`src/tools/run-agent-on-pr.ts`) holds
the stream open purely to detect this close event; it does not use the
events themselves for anything but progress notifications.

Polling `GET /pulls/:id/runs` every N seconds was considered and rejected —
it's a viable fallback but strictly worse: extra round trips, coarser
completion latency (bounded by the poll interval, not immediate), and no
access to the human-readable step messages the server already streams. Given
the SSE connection has to be held open regardless (to detect completion),
relaying its events as `notifications/progress` (when the caller supplies
`_meta.progressToken`) was free to add on top.

### 2026-08-06 — `POST /pulls/:id/review` is fire-and-forget; its `reviews` field is ALWAYS empty, regardless of how fast the LLM call would have been

`ReviewService.runReview` (`server/src/modules/reviews/service.ts`) does
`void this.executor.executeRuns(...).catch(...)` and then immediately
`return { runs, reviews: [] }` — the review executes in the background no
matter what. The stale docstring on `ReviewRunResponse`
(`server/src/vendor/shared/contracts/review-api.ts`) used to claim "the
persisted reviews are also returned once the (synchronous) run completes",
which is false; fixed as part of specs/06-mcp-server.md. There is also no
single-run-status endpoint — only `GET /pulls/:id/runs` (all runs, any
status) and `GET /pulls/:id/runs/active` (running only) exist. Any client
that needs "did this run finish, and with what result" has to do what
`run_agent_on_pr` does: take `runs[0].run_id` from the POST response, then
independently determine completion (see the SSE-close entry above) before
reading `GET /pulls/:id/reviews` and matching on that exact `run_id` (never
"latest review by this agent" — that races a concurrently-triggered second
run on the same PR).

## What Doesn't Work

### 2026-08-06 — a 429 from `@fastify/rate-limit` is mislabeled `error.code: "internal_error"`; don't branch on `error.code` for rate-limit detection

`server/src/app.ts`'s global `setErrorHandler` has a dedicated branch for
`AppError` subclasses (`NotFoundError` → `code: "not_found"`, etc.), but
`@fastify/rate-limit`'s 429 doesn't throw an `AppError` — it falls through
to the generic catch-all branch at the bottom, which unconditionally sets
`error.code = "internal_error"` while still sending HTTP status 429. Detect
rate-limiting by `response.status === 429` only
(`src/http/errors.ts`'s `isRateLimited`); a regression test in both
`test/http/client.test.ts` and `test/tools/run-agent-on-pr.test.ts` sends a
429 with `error.code: "internal_error"` to guard against reintroducing a
`code`-based check.

## Codebase Patterns

## Tool & Library Notes

### 2026-08-06 — `@modelcontextprotocol/sdk`'s high-level `McpServer.registerTool` takes a raw zod SHAPE for `inputSchema`, not a `z.object(...)` instance

`registerTool<OutputArgs, InputArgs>(name, { description, inputSchema, ... }, cb)`
(`server/mcp.d.ts`) types `inputSchema` as `ZodRawShapeCompat = Record<string,
AnySchema>` — a plain object of zod schemas, e.g. `{ repo: z.string(), pr:
z.number() }` — not a `ZodObject`. Every tool module in `src/tools/` exports
a `z.object({...})` (for readability + so tests can call `.safeParse` on the
whole shape directly), and `src/tools/index.ts` passes `theSchema.shape` at
registration time. Passing the `ZodObject` itself would also structurally
typecheck in places (the type also accepts `AnySchema`), but `.shape` matches
what the SDK's own examples do and keeps the tool's declared arg type
(`ShapeOutput<Args>`) exactly the flat object the description promises.

`CallToolResult`'s error shape (verified against the installed SDK's
`CallToolResultSchema` in `types.d.ts`) is `{ isError?: boolean, content:
[{type: "text", text, ...}, ...], structuredContent?, _meta? }` — i.e. an
error is just `{ isError: true, content: [{ type: "text", text: "..." }] }`,
no separate error-code field. `_meta.progressToken` (read off the second
`extra` handler argument, typed `RequestHandlerExtra`) is `string | number |
undefined`; sending progress is `extra.sendNotification({ method:
"notifications/progress", params: { progressToken, progress, message? } })` —
`ServerNotification` includes `ProgressNotificationSchema`'s inferred type,
so no separate import is needed beyond what `RequestHandlerExtra` already
provides.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
