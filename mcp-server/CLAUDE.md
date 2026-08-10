# mcp-server/CLAUDE.md — `@devdigest/mcp-server`

Purpose, tool table, layering diagram: [README.md](README.md). This file only
adds what an agent working in this folder wouldn't guess from the README.

Read [LEARNINGS.md](LEARNINGS.md) before starting work here — treat it as
high-confidence guidance unless it's obviously stale.

## Non-default conventions

- Sibling package, not a server/client submodule — no pnpm workspace entry,
  own `package.json`/lockfile, own `tsconfig.json` (mirrors `reviewer-core`'s:
  strict, ESNext, Bundler resolution, no build — `tsc --noEmit` is
  typecheck-only, run directly via `tsx`).
- **No `@devdigest/shared` path alias.** Every contract this package needs
  (`Repo`, `PrMeta`, `Agent`, `ReviewRecord`, `ConventionCandidate`, ...) is
  redefined locally as a minimal subset interface, right next to where it's
  consumed. This is intentional decoupling, not an oversight — don't "fix" it
  by importing `server/src/vendor/shared`.
- `src/http/client.ts` is the **only** module allowed to call `fetch()`.
  Every layer above it takes the client as a constructor/factory argument and
  is tested against a hand-written fake `fetchImpl` — no module-level mocking
  (matches `server/src/adapters/mocks.ts`'s DI convention).
- Tool descriptions (`src/tools/*.ts`, the `*_DESCRIPTION` constants) and
  registration order (`src/tools/index.ts`) must stay **byte-identical**
  across calls — no `Date.now()`, no nondeterministic key ordering, tools
  always registered in the same fixed order. Varying either invalidates
  Anthropic's prompt cache for `tools`. If a tool description ever needs to
  change, treat it as a deliberate, reviewed edit — not something to
  "improve" in passing.
- Errors never throw as MCP protocol errors. Every tool handler catches its
  own failures and returns `{ isError: true, content: [{ type: "text", text:
  "<forward-leading message>" }] }` (the SDK's `CallToolResult` shape) —
  never lets an exception propagate out of a registered handler.

## Do-not-touch / edit-with-care

- `get_blast_radius` (`src/tools/get-blast-radius.ts`) is an **intentional**
  stub — zero backend calls, same answer for a valid or nonsense repo/pr. Its
  test asserts the mocked `fetch` is never invoked; don't "complete" this
  tool without a spec update (no HTTP endpoint exposes
  `RepoIntel.getBlastRadius` yet — see `specs/06-mcp-server.md`).
- `./scripts/dev.sh` must **not** be taught about this package — it's started
  separately, on demand, only when a Claude Code session needs it.
- Rate-limit (429) detection **must** stay HTTP-status-based
  (`src/http/errors.ts`'s `isRateLimited`), never `error.code`-based — see
  Gotchas below and `LEARNINGS.md`.

## Gotchas

- `POST /pulls/:id/review` is **fire-and-forget** — it returns immediately
  with `run_id`s and an always-empty `reviews: []`; the review runs in the
  background. Do not treat that response as the result.
- `GET /runs/:id/events` (SSE) closing is the **race-free completion
  signal** for a run — not polling `GET /pulls/:id/runs`, not the POST
  response. See `mcp-server/LEARNINGS.md` for the full reasoning.
- A 429 from the backend's rate limiter is mislabeled `error.code:
  "internal_error"` (confirmed bug in `server/src/app.ts`'s error handler).
  Branch on HTTP status only.
- `PrMeta.id` is only typed `nullish` in the shared contract even though it's
  not expected to be missing in practice — `resolvers/pull.ts` guards
  defensively against it anyway.

## Testing

`pnpm test` (vitest) — entirely hermetic; no `*.it.test.ts`, no DB of its
own. `pnpm typecheck` doubles as the build. See [README.md](README.md)
"Testing" for what's covered, and `specs/06-mcp-server.md` "Testing
approach" for the full rationale (including what's deliberately **not**
covered by `pnpm test` — the manual dev-stack smoke test).

## Read when

- Design rationale, exact backend call sequences, the full error-handling
  table, and the blocking/SSE design: [../specs/06-mcp-server.md](../specs/06-mcp-server.md).
- Tracing a request through the backend this package calls into:
  [../docs/architecture.md](../docs/architecture.md).
- Testing/CI questions in general: [../TESTING.md](../TESTING.md).

Finishing a substantive task here (bug fix, non-trivial change, discovery)?
Append an entry to [LEARNINGS.md](LEARNINGS.md) — don't skip it.
