# `@devdigest/mcp-server` — local MCP server

A thin **local stdio** MCP server that exposes Dev Digest's review/conventions
functionality to a Claude Code session, so it can list agents, trigger a
review, read findings, and read conventions without leaving the chat. No
domain logic or persistence of its own — it's a translation layer between MCP
tool-call semantics and the existing Fastify REST/SSE API
(`@devdigest/api`, port 3001).

Launched **on demand** by Claude Code via the project-scoped `.mcp.json` at
the repo root — never by `./scripts/dev.sh`. Requires the server (and
usually the dev stack) to already be running; it makes no attempt to start
one itself.

## Tools

| Tool | What it does |
|---|---|
| `list_agents` | Lists the workspace's agent configs (id, name, model, enabled). |
| `run_agent_on_pr` | Runs one agent on one PR and **blocks** (up to 120s) until it finishes, returning the verdict + findings. |
| `get_findings` | Reads the most recent completed review by one agent on one PR — a pure read, safe to poll. |
| `get_conventions` | Reads a repo's already-**accepted** coding conventions from its last scan. |
| `get_blast_radius` | Maps which files, callers, and API endpoints/crons are impacted by a PR's changed symbols (specs/07-blast-radius.md). |
| `get_onboarding_tour` | Reads a repo's current Onboarding Tour — the stored 5-section tour, or the deterministic skeleton with status/reason if none exists yet (specs/10-onboarding-generator.md). Never generates one. |

Exact schemas + the verbatim tool descriptions actually used at registration
time live in `src/tools/*.ts`; see [`../specs/06-mcp-server.md`](../specs/06-mcp-server.md)
for the design rationale (why each tool is shaped the way it is, the exact
backend call sequences, and the full error-handling table).

## CLI — `devdigest review`

A second, independent entry point into this package (specs/08-pre-push-cli.md):
a pre-push command that reviews the LOCAL working copy, before a PR even
exists.

```
pnpm --dir mcp-server exec tsx src/cli.ts review --mode working --agent <id|name>
# or, from inside mcp-server/:
pnpm review -- --mode working --agent <id|name>
```

- Collects `git diff HEAD` (staged + unstaged changes to tracked files;
  untracked files are excluded and warned about), and POSTs it to a new,
  **synchronous, non-persisting** backend endpoint — `POST /reviews/adhoc`
  (`server/src/modules/reviews/adhoc.ts`) — which runs the exact same
  `reviewPullRequest` engine the web UI does. Nothing is written to the DB;
  there is no run id, no SSE, no entry in the web UI.
- `--mode staged`/`--mode branch` are named flag values that exist in the seam
  but are not yet implemented — they exit 2 with a "not yet implemented"
  message rather than silently no-opping.
- A documented exit-code contract (0 clean / 1 blocking findings / 2 usage
  error / 3 environment error / 4 review-could-not-run) so the command can
  later sit in a pre-push hook. Run `devdigest review --help` for the full
  flag/exit-code/environment reference.
- `src/cli/*` is layered exactly like the tools above: `src/cli/git.ts` is the
  **only** module in this package allowed to spawn a child process (mirrors
  `http/client.ts` being the only `fetch()` caller); `src/cli/run.ts` is fully
  injectable (git runner, HTTP client, stdout/stderr, cwd) and reuses
  `http/client.ts` + `http/errors.ts` unchanged — it opens no connection of
  its own. It adds no MCP tool and never touches `src/tools/`.

See specs/08-pre-push-cli.md for the full design (why a new backend endpoint
instead of importing `reviewer-core` directly, the exact `--help` text, and
the complete error-handling table).

## Layers

```mermaid
flowchart LR
  MCP["MCP transport / tool registration<br/>index.ts, tools/index.ts"] --> HANDLERS["Per-tool handlers<br/>tools/*.ts<br/>id resolution · backend calls · response shaping · error mapping"]
  HANDLERS --> RESOLVERS["Resolvers<br/>resolvers/repo.ts, resolvers/pull.ts<br/>name/number -> uuid"]
  HANDLERS --> HTTP["HTTP + SSE client<br/>http/client.ts, http/sse.ts<br/>the ONLY place fetch() is called"]
  RESOLVERS --> HTTP
  HTTP -->|REST + SSE| API["@devdigest/api :3001"]
```

`http/client.ts` takes an injectable `fetchImpl` (default: global `fetch`),
matching this repo's DI-based test-double convention
(`server/src/adapters/mocks.ts`) — every layer above is tested against a
hand-written fake, never module-level mocking.

This package defines its **own minimal local types** (`src/tools/review-shape.ts`,
the raw-row interfaces in each resolver/tool) rather than importing
`server`'s vendored zod contracts (`@devdigest/shared`) — a deliberate
decoupling so it can't silently break when `server/src/vendor/shared` drifts.
No `@devdigest/shared` path alias here, unlike `reviewer-core`.

## `run_agent_on_pr`'s blocking design

`POST /pulls/:id/review` is **fire-and-forget** — it returns immediately with
a `run_id` and an always-empty `reviews: []`; the review executes in the
background. This tool detects completion by holding open the SSE stream at
`GET /runs/:id/events` until it **closes** (the race-free completion signal —
see `mcp-server/LEARNINGS.md`), relaying each event as a
`notifications/progress` notification when the caller supplied a
`progressToken`. If the ~118s wait budget elapses first, it returns a timeout
notice (not the result) — the run keeps going server-side; call
`get_findings` afterward to pick it up.

## Config

- `DEVDIGEST_API_BASE_URL` — the API's base URL. Default `http://localhost:3001`.
- No auth: the backend's `LocalNoAuthProvider` always resolves a default
  workspace/user regardless of headers, so this package sends none.

## Testing

`pnpm test` (vitest) — entirely hermetic (no server, no network, no DB):
zod input-schema validation, resolver matching (exact/case-insensitive/
ambiguous/zero-match), response shaping, the full error-handling table
(including a 429-detected-by-status regression test), SSE frame parsing
(including a frame split across chunk boundaries), and the wait-timeout path
via an injectable budget override. `get_blast_radius`'s test asserts the
mocked `fetch` is **never called**. `pnpm typecheck` doubles as the build —
this package never emits JS; it's run directly via `tsx` (see `.mcp.json`).

`test/cli/*` covers the CLI the same way: a fake `GitRunner` (no real `git`
process) + a fake `fetchImpl` (no real network) drive `src/cli/run.ts`'s
`runCli` through the full exit-code matrix (0/1/2/3/4), including that an
empty diff and an oversize diff both short-circuit **before** any HTTP call.

A real dev-stack smoke test (all 6 tools via `npx @modelcontextprotocol/inspector`
or Claude Code itself, including one real `run_agent_on_pr`) is **not** part
of `pnpm test` — see [`../specs/06-mcp-server.md`](../specs/06-mcp-server.md)
"Verification".
