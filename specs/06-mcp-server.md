# Dev Digest MCP Server

**Status:** plan locked, ready for implementation. All open questions from
planning are resolved (see [Decisions](#decisions) below).

## Context

Dev Digest's review/conventions functionality is only reachable today through
the Fastify HTTP API and the Next.js web UI. This spec adds a **local MCP
server** — a thin stdio process, launched on demand by Claude Code (via a
project-scoped `.mcp.json`, never by `./scripts/dev.sh`) — that exposes five
tools so a Claude Code session can list agents, trigger a review, read
findings, read conventions, and (as a stub) ask about blast radius, without
leaving the chat.

The server holds no domain logic or persistence of its own. It is a
translation layer between MCP tool-call semantics and Dev Digest's existing
REST/SSE API — nothing here required a new backend endpoint (see
[Backend investigation](#backend-investigation-read-before-implementing)).

## Scope

**In:**

1. New package `mcp-server/` (repo root, sibling to `server/`, `client/`,
   `reviewer-core/`, `e2e/` — own `package.json`/lockfile, no pnpm workspace
   entry).
2. Five tools: `list_agents`, `run_agent_on_pr`, `get_findings`,
   `get_conventions`, `get_blast_radius` (stub). Exact schemas and
   **verbatim** descriptions in [Tool specifications](#tool-specifications).
3. A small HTTP+SSE client (`src/http/`) — the only place in the package that
   calls `fetch()`.
4. Repo-name → uuid and PR-number → uuid resolvers (`src/resolvers/`), since
   the backend has no lookup-by-name endpoint.
5. Three small changes **outside** `mcp-server/` — see
   [Changes outside mcp-server/](#changes-outside-mcp-server).

**Out of scope (explicitly):**

- Any new backend endpoint. Everything composes from `GET /agents`,
  `GET /repos`, `GET /repos/:id/pulls`, `POST /pulls/:id/review`,
  `GET /pulls/:id/runs`, `GET /pulls/:id/reviews`, `GET /repos/:id/conventions`.
- A real `get_blast_radius` implementation — no HTTP endpoint for it exists
  yet (only an internal, unexposed `RepoIntel.getBlastRadius` facade method).
  This tool is a pure stub with **zero backend calls**.
- Accept/dismiss-finding tools, convention accept/reject tools — not part of
  this 5-tool surface.
- Remote/hosted MCP server. Local stdio only.
- Any change to `client/` (the Next.js web app is untouched by this work) or
  to `./scripts/dev.sh` (must not start this server).

## Decisions

Resolved during planning (all "Recommended" options accepted):

| Question | Decision |
|---|---|
| `get_conventions` scope | Return **only `status === "accepted"`** convention candidates — never pending/rejected ones. |
| `get_findings` arguments | Flat `repo`/`pr`/`agent` only — **no** optional `run_id` filter. "Most recent review by this agent on this PR" is always the answer. |
| API base URL env var | `DEVDIGEST_API_BASE_URL`, default `http://localhost:3001`. |
| Tool name prefixing | **No prefix** (`list_agents`, not `devdigest_list_agents`) — Claude Code already namespaces MCP tools by server name. |
| `get_blast_radius` wording | Use the exact stub description/message in [3.5](#35-get_blast_radius-intentional-stub) as-is. |
| `run_agent_on_pr` response `run_id` | Keep it in the success response, for traceability (e.g. opening the run in the web UI). |

## Backend investigation (read before implementing)

Confirmed by reading the code directly — **do not trust
`server/src/vendor/shared/contracts/review-api.ts`'s docstring**, it is wrong
(see [Changes outside mcp-server/](#changes-outside-mcp-server), item 1):

- **`POST /pulls/:id/review` is fire-and-forget, not synchronous.**
  `ReviewService.runReview` (`server/src/modules/reviews/service.ts`) does:
  ```ts
  void this.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch(...);
  return { runs, reviews: [] };   // reviews is ALWAYS empty
  ```
  The route returns immediately with `run_id`s; the review executes in the
  background.
- **There is no single-run-status endpoint.** Only `GET /pulls/:id/runs`
  (all runs, any status) and `GET /pulls/:id/runs/active` (running only).
- **The SSE stream closing is the race-free completion signal.**
  `GET /runs/:id/events` (`reviews/routes.ts`) bridges `RunBus` to an async
  generator that returns exactly when `RunBus.complete(runId)` fires —
  `run-executor.ts` calls that only *after* the run's status write and trace
  save have already happened. This drives the whole design in
  [3.2](#32-run_agent_on_pr).
- **`GET /pulls/:id/reviews` has no agent/run query filter.**
  `ReviewRepository.reviewsForPull(db, prId)` takes no such parameter — the
  MCP wrapper filters the returned array in memory.
- **`get_blast_radius` has no HTTP surface at all.** `repo-intel/routes.ts`
  only exposes `/index-state` and `/resync`; `RepoIntel.getBlastRadius` is
  internal-only.
- **No auth plumbing needed.** `getContext()`
  (`server/src/modules/_shared/context.ts`) uses `LocalNoAuthProvider`, which
  always resolves a default workspace/user regardless of headers/cookies.
- **429 is mislabeled.** `server/src/app.ts`'s global error handler sets
  `error.code = "internal_error"` even when `@fastify/rate-limit` returns
  HTTP status 429. **Detect rate-limiting by HTTP status, never by
  `error.code`.**

## Package layout

```
mcp-server/
├── package.json            # @devdigest/mcp-server, private, type:module
├── tsconfig.json            # mirrors reviewer-core's (strict, ESNext, Bundler resolution)
├── vitest.config.ts
├── README.md
├── CLAUDE.md
├── LEARNINGS.md
├── .gitignore               # node_modules, dist
├── src/
│   ├── index.ts             # entry point: build McpServer, register tools, connect StdioServerTransport
│   ├── config.ts            # env var -> { apiBaseUrl }
│   ├── http/
│   │   ├── client.ts        # DevDigestHttpClient — the ONLY module that calls fetch()
│   │   ├── errors.ts        # DevDigestApiError + error -> forward-leading-message mapping
│   │   └── sse.ts           # minimal SSE frame reader over a fetch() ReadableStream
│   ├── resolvers/
│   │   ├── repo.ts          # human repo string -> {id, owner, name, full_name}
│   │   └── pull.ts          # (repoId, prNumber) -> {id, number, title}
│   └── tools/
│       ├── index.ts         # registers all 5 tools on the McpServer instance, in fixed order
│       ├── review-shape.ts  # shared ReviewRecord -> concise ReviewResult mapper (used by 2 tools)
│       ├── list-agents.ts
│       ├── run-agent-on-pr.ts
│       ├── get-findings.ts
│       ├── get-conventions.ts
│       └── get-blast-radius.ts
└── test/
    ├── http/client.test.ts
    ├── http/sse.test.ts
    ├── resolvers/repo.test.ts
    ├── resolvers/pull.test.ts
    └── tools/*.test.ts       # one per tool, mocked http client
```

No build step for v1 — run directly via `tsx` (matches `reviewer-core`'s
"no compiled build, tsc is typecheck-only" convention). `tsconfig.json`
copies `reviewer-core/tsconfig.json`'s shape. **No `@devdigest/shared` path
alias** — this package defines its own minimal local types (see
[Shared types](#shared-types)) rather than importing `server`'s vendored zod
contracts, so it stays a decoupled client that can't silently break when
`server/src/vendor/shared` drifts.

## Layering

Three layers, thin at the top, all HTTP concentrated at the bottom:

1. **MCP transport/tool-registration** (`src/index.ts`, `src/tools/index.ts`)
   — wires zod schemas + description strings + handlers onto the SDK's server
   object and `StdioServerTransport`. No business logic, no `fetch()` calls.
2. **Per-tool handlers** (`src/tools/*.ts`) — id resolution, the backend
   call(s), response shaping, error mapping. Where each tool's behavior lives.
3. **HTTP client** (`src/http/*.ts`) — the only place `fetch()` is called.
   Owns base URL, per-call `AbortController` timeout, JSON-envelope parsing,
   SSE frame parsing.

`src/resolvers/*.ts` sits between layers 2 and 3, shared by 4 of the 5 tools.

**Onion Architecture note:** the `onion-architecture` skill states its own
scope explicitly — *"Applies to `server/src`. Out of scope: `reviewer-core/`
(a sibling library, deliberately not held to these rings), `client/`."*
`mcp-server/` is exactly that kind of sibling package: no domain model, no
persistence, entirely a translation layer. The skill's four rings and
`dependency-cruiser` enforcement don't apply here by the skill's own
definition — not by an exception we're granting. The three-layer split above
is ordinary separation-of-concerns hygiene, not an Onion Architecture
instance, and is enforced by code review / module boundaries, not tooling.

## Shared types

```ts
// src/tools/review-shape.ts
export interface ConciseFinding {
  severity: "CRITICAL" | "WARNING" | "SUGGESTION";
  category: "bug" | "security" | "perf" | "style" | "test";
  kind?: "finding" | "secret_leak" | "lethal_trifecta" | "phantom" | "hook";
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion?: string | null;
  confidence: number;
}

export interface ReviewResult {
  run_id: string | null;
  agent_id: string | null;
  agent_name: string | null;
  verdict: "request_changes" | "approve" | "comment" | null;
  summary: string | null;
  score: number | null;
  findings: ConciseFinding[];
}
```

Deliberately dropped from the raw `ReviewRecord`/`FindingRecord`: finding
`id`, `review_id`, `accepted_at`/`dismissed_at` (no accept/dismiss tool
exists in this v1 surface), `trifecta_components`/`evidence` (`kind` alone is
enough signal), `model`, `grounding`, `created_at`.

## Tool specifications

Two rules apply to every tool:

- **Errors never throw as MCP protocol errors.** Every handler catches its
  own failures and returns `{ isError: true, content: [{ type: "text", text:
  "<forward-leading message>" }] }` — verify this exact shape against the
  installed `@modelcontextprotocol/sdk` version's `CallToolResult` type
  before writing the handler; don't assume from memory.
- **Descriptions below are FINAL — use them verbatim at implementation time.
  Do not paraphrase, shorten, or "improve" them while writing the tool
  registration code.** They were designed against the 4 principles (result
  not operation, flat arguments, concise structured response, error leads
  forward) and against token-cost/caching best practices (static, no
  per-call variation) discussed during planning.

### 3.1 `list_agents`

```ts
const inputSchema = z.object({});
```

**Description (verbatim):**

> Lists the review-agent configurations available in this local Dev Digest
> workspace: id, name, provider/model, and whether each is enabled. Use this
> whenever you don't already have a valid agent id for run_agent_on_pr or
> get_findings, or whenever either of those reports an agent id was not
> found. Includes disabled agents too (they can still be run explicitly by
> id) — check the enabled field before choosing one for a general "run
> whatever agents exist" request. This only reads the workspace's agent
> configuration; it never lists past reviews or runs anything.

**Backend call:** `GET /agents` (workspace-scoped by the server itself; no
resolution needed).

**Response shape:**
```json
{ "agents": [{ "id": "uuid", "name": "string", "provider": "openai|anthropic|openrouter", "model": "string", "enabled": true }] }
```
Dropped: `description`, `system_prompt`, `output_schema`, `version`,
`strategy`, `ci_fail_on`, `repo_intel`.

### 3.2 `run_agent_on_pr`

```ts
const inputSchema = z.object({
  repo: z.string().min(1).describe(
    'Repository identifier: "owner/name", or just "name" if it is unambiguous in this workspace.',
  ),
  pr: z.number().int().positive().describe(
    "The pull request number as shown in the Dev Digest UI / GitHub (not an internal id).",
  ),
  agent: z.string().min(1).describe("An agent id, as returned by list_agents."),
});
```

**Description (verbatim):**

> Runs one review agent against one pull request and blocks until the run
> finishes, then returns the verdict and findings — creating the run,
> waiting for it, and fetching the result are all handled inside this single
> call; you never need to poll or orchestrate multiple tool calls for one
> review. Use this when the user wants a fresh review from a specific agent.
> Do not use this to check a review that may already be in progress or
> already finished — use get_findings for that; calling this again just
> starts another run. Blocks for up to 120 seconds. If the agent is still
> running when that limit hits, this returns a timeout notice (not the
> result) — the run keeps going in the background, so call get_findings
> shortly after to pick it up. Returns a concise verdict plus the finding
> list (severity, file, lines, one-line rationale); it never returns full
> prompt/trace internals, token usage, or cost.

**Exact backend calls (in order):**

1. `GET /repos` → resolve `repo` → `repoId` (via `resolveRepo`).
2. `GET /repos/:repoId/pulls` → resolve `pr` (number) → `prId` (via
   `resolvePull`).
3. `POST /pulls/:prId/review` with body `{ "agentId": agent }` —
   rate-limited 10/min server-side. Response: `{ pr_id, runs: [{ run_id,
   agent_id, agent_name }], reviews: [] }` (always empty — see
   [Backend investigation](#backend-investigation-read-before-implementing)).
   Take `runs[0]`.
4. Open `GET /runs/:run_id/events` (SSE) and consume it until it closes, or
   until the 120s budget is exhausted — see
   [Blocking + progress design](#blocking--progress-notification-design).
5. `GET /pulls/:prId/runs` → find the entry matching step 3's `run_id`; read
   its `status` (`done`/`failed`/`cancelled`/`running`).
6. If `status === "done"`: `GET /pulls/:prId/reviews` → find the
   `ReviewRecord` whose `run_id` **exactly matches** step 3's `run_id` (not
   "latest for this agent" — avoids a race with a concurrently-triggered
   second run) → map via `review-shape.ts` → return success.
7. Any other status, or the wait timed out first → return the corresponding
   forward-leading error ([Error handling](#error-handling)).

**Response shape (success):** the shared `ReviewResult`.

### 3.3 `get_findings`

```ts
const inputSchema = z.object({
  repo: z.string().min(1).describe('Repository identifier: "owner/name", or just "name" if unambiguous.'),
  pr: z.number().int().positive().describe("The pull request number."),
  agent: z.string().min(1).describe("An agent id, as returned by list_agents."),
});
```

**Description (verbatim):**

> Returns the concise verdict and findings from the most recent completed
> review by one agent on one pull request. This is a pure read — it never
> starts, waits for, or retries a run, so it is safe to call repeatedly (e.g.
> to poll after run_agent_on_pr times out). If no review exists yet for this
> agent+PR, the response says so explicitly and tells you to call
> run_agent_on_pr instead of guessing at a result. Returns the same shape as
> run_agent_on_pr's success result (verdict, summary, score, findings).

**Exact backend calls:**

1. `GET /repos` → resolve `repo` → `repoId`.
2. `GET /repos/:repoId/pulls` → resolve `pr` → `prId`.
3. `GET /pulls/:prId/reviews` → `ReviewRecord[]` (newest-first). Filter in
   memory for `agent_id === agent`; take the first (newest) match. No
   backend query param exists for this — the filtering happens here.
4. Only if no match in step 3: `GET /agents` → check whether `agent` is a
   real, known agent id, to pick the right one of two error messages
   ([Error handling](#error-handling)) instead of one generic "not found."

**Response shape (success):** the shared `ReviewResult`.

### 3.4 `get_conventions`

```ts
const inputSchema = z.object({
  repo: z.string().min(1).describe('Repository identifier: "owner/name", or just "name" if unambiguous.'),
});
```

**Description (verbatim):**

> Returns this repository's already-accepted coding conventions — house-style
> rules a reviewer should apply, each with the file/line evidence that
> justified it. Read-only against the last completed convention-extraction
> scan; it does not run a new extraction and takes no PR or agent argument.
> If the repo has never been scanned, the response says so explicitly
> (extraction itself is only available from the Dev Digest web UI today, not
> from this tool) rather than returning an empty list that could be mistaken
> for "this repo has no conventions." Returns only accepted conventions —
> candidates still pending review or already rejected are omitted, since
> surfacing them risks a reviewer treating an unvetted or rejected rule as
> house style.

**Exact backend calls:**

1. `GET /repos` → resolve `repo` → `repoId`.
2. `GET /repos/:repoId/conventions` → `{ scan, candidates }`. Filter
   `candidates` to `status === "accepted"` (per [Decisions](#decisions)).

**Response shape:**
```json
{
  "repo": "owner/name",
  "scanned_at": "iso-string-or-null",
  "conventions": [
    { "rule": "string", "category": "string", "evidence_path": "string|null",
      "evidence_start_line": "number|null", "evidence_end_line": "number|null",
      "evidence_snippet": "string|null", "confidence": "number|null" }
  ]
}
```
If `scan` is `null`:
```json
{ "repo": "owner/name", "scanned_at": null, "conventions": [],
  "note": "This repository has not been scanned for conventions yet. Run the extractor from the Dev Digest web UI (Repo -> Conventions -> Extract), then call this tool again." }
```
Dropped: candidate `id`, scan metadata (sampled files, model used).

### 3.5 `get_blast_radius` (intentional stub)

```ts
const inputSchema = z.object({
  repo: z.string().min(1).describe('Repository identifier: "owner/name", or just "name" if unambiguous.'),
  pr: z.number().int().positive().describe("The pull request number."),
});
```

**Description (verbatim):**

> STUB — always returns a structured "not implemented" result; it never
> returns real blast-radius data in this version. Once implemented, this
> tool will map which files, callers, and API endpoints are impacted by a
> pull request's changed symbols, so a reviewer can prioritize what else to
> check. Until then: do not retry this call expecting different data on a
> later attempt, and do not fabricate a blast-radius analysis yourself from
> the diff — just proceed with the review without blast-radius context.
> Takes the same repo/pr arguments the real implementation will use, so no
> caller needs to change when it ships.

**Backend calls: none.** No HTTP endpoint exposes `RepoIntel.getBlastRadius`
(only `/index-state` and `/resync` exist on `repo-intel/routes.ts`). This
tool makes **zero** backend calls and returns the stub immediately — a
typo'd `repo`/`pr` gets the same answer as a valid one, since the answer
never depends on them. This trade-off is intentional, not an oversight.

**Response shape:**
```json
{
  "status": "not_implemented",
  "repo": "owner/name-as-given",
  "pr": 123,
  "message": "Blast radius analysis is not implemented yet in this MCP server. This is a placeholder — do not treat it as real impact analysis and do not retry expecting different data."
}
```

### Resolution chain (shared by 4 tools)

```ts
// src/resolvers/repo.ts
async function resolveRepo(http: DevDigestHttpClient, input: string): Promise<{id, owner, name, full_name}>
```
`GET /repos` → `Repo[]`. If `input` contains `/`, match `full_name`
case-insensitively; else match bare `name` case-insensitively. Zero matches
→ `RepoNotFoundError`; more than one match on a bare-name lookup →
`AmbiguousRepoError` listing candidates' `full_name`s.

```ts
// src/resolvers/pull.ts
async function resolvePull(http: DevDigestHttpClient, repoId: string, prNumber: number): Promise<{id, number, title}>
```
`GET /repos/:repoId/pulls` → `PrMeta[]`. Match `number === prNumber`. Guard
defensively against a missing `id` even though `PrMeta.id` is only typed
`nullish` (contract looseness, not expected in practice).

## Error handling

| Tool | Failure mode | Signal | Forward-leading message |
|---|---|---|---|
| all (repo-taking) | repo not found | 0 matches in `GET /repos` | "Repo '`<input>`' not found in this workspace. Known repos: `<full_name list>`. Add it via the web UI (Repos → Add) or check the spelling." |
| all (repo-taking) | ambiguous bare repo name | >1 match on bare `name` | "'`<input>`' matches multiple repos: `<full_name list>`. Retry with the full 'owner/name' form." |
| `run_agent_on_pr`, `get_findings` | PR not found | 0 matches in `GET /repos/:id/pulls` | "PR #`<n>` not found in `<full_name>`. Available PR numbers: `<up to ~10>`. Confirm the number, or re-sync the repo from the web UI." |
| `run_agent_on_pr` | agent id not found | `POST /pulls/:id/review` → 404, `error.code === "not_found"` | "Agent '`<agent>`' not found. Call list_agents to see valid agent ids." |
| `run_agent_on_pr` | rate limited | **HTTP status 429** (never branch on `error.code` — see below) | "Rate limited: more than 10 review runs were requested in the last minute. Wait a bit and call run_agent_on_pr again." |
| `run_agent_on_pr` | run failed | after SSE close, `GET /pulls/:id/runs` entry has `status === "failed"` | "Agent run failed: `<run.error>`. If this mentions a missing API key, add the provider key in Settings, then retry run_agent_on_pr." |
| `run_agent_on_pr` | run cancelled | `status === "cancelled"` | "The run was cancelled (possibly from the web UI). Call run_agent_on_pr again to retry." |
| `run_agent_on_pr` | 120s budget exhausted before SSE closed | client-side `AbortController` fired | "Timed out after 120s waiting for the review to finish. The run may still be finishing in the background — call get_findings(repo, pr, agent) in a bit to check for the result." |
| `get_findings` | agent id doesn't exist at all | fallback `GET /agents` lookup finds no match | "Agent id '`<agent>`' not found. Call list_agents to see valid agent ids." |
| `get_findings` | agent exists, but no review yet | fallback lookup finds the agent, step 3 had zero matches | "Agent '`<agent_name>`' has not reviewed this PR yet. Call run_agent_on_pr(repo, pr, agent) to run it." |
| `get_conventions` | repo never scanned | `GET /repos/:id/conventions` → `{scan: null, ...}` | Structured empty-state response (§3.4), not an error. |
| any | backend unreachable | `fetch` throws (`ECONNREFUSED`/`fetch failed`) | "Cannot reach the Dev Digest API at `<baseUrl>`. Is the server running? Start it with `cd server && pnpm dev` (or `./scripts/dev.sh`), then retry." |
| any | unexpected 5xx | HTTP status ≥500 | "Dev Digest API returned an unexpected error (`<status>`): `<message>`. This is likely a server bug — check the server logs." |

**429 gotcha:** confirmed by reading `server/src/app.ts`'s `setErrorHandler`
— a 429 from `@fastify/rate-limit` falls through the generic catch-all
branch, which sets `error.code = "internal_error"` even though the HTTP
status is 429. **Detect rate-limiting by HTTP status code, never by
`error.code`.** `AppError` subclasses (`NotFoundError` → 404, etc.) set
`error.code` correctly; only the rate-limit path is mislabeled.

## Blocking + progress-notification design

`run_agent_on_pr` opens the SSE stream and holds it purely to detect
completion (mandatory — no cheaper alternative exists; polling
`GET /pulls/:id/runs` every N seconds is a viable fallback but strictly
worse: extra round trips, coarser latency, no access to the human-readable
step messages the server already produces). Given the connection must be
held open regardless, relaying its events as `notifications/progress` is a
small, justified addition:

1. Note the deadline: `start + 120_000ms`, minus a margin — compute the SSE
   `AbortController` timeout as `118_000ms` from start, reserving ~2s for
   the final status+review GETs.
2. Open `GET /runs/:run_id/events` via `fetch()` with `Accept:
   text/event-stream` and the `AbortController`'s signal.
3. Parse the body stream with `src/http/sse.ts` — split on `\n\n`, parse
   `event:`/`data:`/`id:` lines, `JSON.parse()` the `data:` payload into a
   `RunEvent` (`{runId, seq, kind, msg, t, data}`).
4. **If the incoming `CallToolRequest` carried `_meta.progressToken`:** for
   each parsed `RunEvent`, send a `notifications/progress` notification with
   that token, a monotonically increasing `progress` counter (`event.seq`),
   and `message: event.msg`. If no `progressToken` was supplied, skip
   sending notifications but still consume the stream to detect completion.
5. Loop until the stream ends or the `AbortController` fires.
6. Proceed to the status check + review fetch (§3.2 steps 5–7).

**Verify before writing this code, don't guess:** the exact
`@modelcontextprotocol/sdk` TypeScript API for (a) reading
`_meta.progressToken` off the incoming tool-call request inside a
registered handler, and (b) sending a `notifications/progress` message.
Check the installed SDK's type definitions directly — this is a different
package from `@anthropic-ai/sdk`, and method names do not carry over.

## Config / bootstrapping

- **API base URL:** env var `DEVDIGEST_API_BASE_URL`, default
  `http://localhost:3001`.
- **No auth plumbing needed** — confirmed via `LocalNoAuthProvider` (see
  [Backend investigation](#backend-investigation-read-before-implementing)).
- **Per-call timeout:** a code constant, not an env var — ~15000ms for every
  read-only tool, ~118000ms for the SSE wait inside `run_agent_on_pr` (see
  above). Keeping this a constant avoids an unnecessary env var.
- **`.mcp.json` — project-scoped**, checked in at repo root (not
  `~/.claude.json`), so tool schemas only load in this repo's Claude Code
  sessions:

  ```json
  {
    "mcpServers": {
      "devdigest": {
        "command": "pnpm",
        "args": ["--dir", "mcp-server", "exec", "tsx", "src/index.ts"],
        "env": {
          "DEVDIGEST_API_BASE_URL": "http://localhost:3001"
        }
      }
    }
  }
  ```

  `pnpm --dir mcp-server exec tsx src/index.ts` is chosen specifically to
  avoid relying on the spawning process's cwd. Verify Claude Code resolves
  this correctly when launched from the repo root, as part of implementation
  step 9.

- **`./scripts/dev.sh` needs no changes** (confirmed by reading it in full)
  — it has no awareness of `mcp-server/` and must stay that way; the MCP
  server is started separately, only when needed.
- **Caching implications:** tool descriptions/schemas must render as
  byte-identical text every call within a session (no `Date.now()`, no
  non-deterministic key ordering), and `src/tools/index.ts` must register
  the 5 tools in the same fixed order every time — otherwise the
  Anthropic-side prompt cache for `tools` gets invalidated turn-to-turn. No
  new code required, just discipline.

## Changes outside `mcp-server/`

No new backend endpoints, no DB migrations, no changes to `client/`. Three
small changes:

1. **Fix the stale docstring** in
   `server/src/vendor/shared/contracts/review-api.ts` (~line 43, the comment
   above `ReviewRunResponse`) — it currently claims "the persisted reviews
   are also returned once the (synchronous) run completes," which is false
   (see [Backend investigation](#backend-investigation-read-before-implementing)).
   Worth fixing regardless of this MCP work — it's a real documentation bug
   that could mislead a future reader.
2. **Add a `mcp-server` row** to the Map table in root `CLAUDE.md`, matching
   the existing `server`/`client`/`reviewer-core`/`e2e` rows. Port column:
   "—" (stdio, not HTTP).
3. **Add `.mcp.json`** at repo root (content above).

## Testing approach

**Hermetic (no server, no network) — the large majority:**

- Zod input-schema validation.
- `resolveRepo`/`resolvePull` matching against canned fixtures: exact match,
  case-insensitive match, ambiguous bare-name match, zero matches.
- Response shaping: `ReviewRecord[]` → `ReviewResult`; conventions list →
  the concise shape (including the `scan === null` empty-state branch).
- Error mapping for every row in [Error handling](#error-handling) — in
  particular a regression test asserting **429 is detected by HTTP status,
  not `error.code`**.
- `get_blast_radius`: assert the injected mock `fetch` is **never called**.
- SSE frame parsing: canned multi-frame text, including a frame split across
  two chunk boundaries.
- Timeout logic: inject a short override for the 118s budget (e.g. 50ms) so
  tests don't wait 2 minutes.

`src/http/client.ts` takes an injectable `fetchImpl` (default: global
`fetch`) so every layer above can be tested against a hand-written fake —
matches this repo's DI-based test-double convention
(`server/src/adapters/mocks.ts`), not module-level mocking.

**Needs the real dev stack — manual, not part of `pnpm test`:**

- With `./scripts/dev.sh` (or `--no-client`) up and seeded, run the MCP
  server via `tsx src/index.ts` and drive it with `npx
  @modelcontextprotocol/inspector` (or Claude Code itself) through all 5
  tools, including one real `run_agent_on_pr` against the seeded demo PR to
  exercise the full POST → SSE-wait → status-check → review-fetch chain.

No `*.it.test.ts` needed — this package has no database of its own.

## Implementation order

1. Scaffold `package.json`, `tsconfig.json`, `.gitignore`; install deps.
   *(parallel with 2)*
2. Skeleton `README.md`/`CLAUDE.md`/`LEARNINGS.md`. *(parallel with 1)*
3. `src/config.ts`.
4. `src/http/client.ts` + `errors.ts` (incl. the 429-by-status fix). Hermetic
   tests immediately.
5. `src/http/sse.ts`. *(parallel with 4)*
6. `src/resolvers/repo.ts`, `src/resolvers/pull.ts`, with tests.
7. Tool modules, each with hermetic tests against a mocked HTTP client:
   `list-agents.ts` and `get-blast-radius.ts` first (no resolver dependency,
   parallelizable with 6); then `review-shape.ts`; then `get-conventions.ts`;
   then `get-findings.ts`; `run-agent-on-pr.ts` last (most involved).
8. `src/tools/index.ts` + `src/index.ts` — register all 5 tools, connect
   `StdioServerTransport`. Verify the exact SDK API (registration signature,
   `isError` shape, progress-notification mechanism) against the installed
   package's types before writing this.
9. Add `.mcp.json`; manual smoke test against a running dev stack, all 5
   tools, including one real `run_agent_on_pr`.
10. Finalize `README.md`/`CLAUDE.md`; make the three
    [Changes outside mcp-server/](#changes-outside-mcp-server); append the
    first `LEARNINGS.md` entries (the fire-and-forget `POST
    /pulls/:id/review` discovery and "SSE-close is the completion signal"
    are exactly the non-obvious findings that file exists to preserve).

## Verification

- `pnpm test` in `mcp-server/` — all hermetic tests above green.
- `pnpm typecheck` — clean.
- Manual smoke test (step 9): with the dev stack running and seeded, from
  Claude Code in this repo, call each tool once:
  - `list_agents` → returns the seeded agents.
  - `run_agent_on_pr` against the seeded demo PR + a real agent id → returns
    a populated `ReviewResult` within 120s (or, if intentionally testing the
    timeout path, a timeout message with the follow-up hint).
  - `get_findings` for the same repo/pr/agent → returns the same result
    without re-running anything.
  - `get_conventions` for a repo that has never been scanned → the
    empty-state response with the `note` field; for one that has → only
    `accepted` candidates.
  - `get_blast_radius` for any repo/pr → the stub response, and confirm (via
    a network log or the mocked-fetch unit test) that no HTTP call was made.
  - Trigger at least one error path deliberately (unknown agent id, unknown
    repo) and confirm the response text points at the next tool call
    (`list_agents`, etc.) rather than a bare error code.
