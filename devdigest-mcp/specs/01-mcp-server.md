# devdigest-mcp — local MCP server (5 PR-review tools)

**Status:** approved (2026-10-01) — implementation plan in `02-development-plan.md`
**Package:** `devdigest-mcp` (new, npm-managed like `reviewer-core`/`e2e`, stdio transport only)

## Decisions after analysis (2026-10-01) — these override the text below

- **API URL:** env `DEVDIGEST_API_URL`, default `http://127.0.0.1:3001` (the API binds `127.0.0.1:3001`; `:3000` is the Next.js web UI). A response that is HTML or whose `/health` is not `{status:'ok'}` yields a `not_api` error. Replaces every `http://localhost:3001` below.
- **Run timeout:** 120 s kept deliberately, counted from tool entry (not after the POST). Note that since the intent layer, a run first derives PR intent (up to 45 s, `RUN_INTENT_TIMEOUT_MS`), so a cold first run can time out; the timeout path (run left running, `run_id` in the message, never `/cancel`) is therefore first-class.
- **HTTP errors:** both `400` and `422` (zod validation, `server/INSIGHTS.md` 2026-09-26) map to "invalid input"; also `404`, `409`, `429`, `5xx`, network errors and HTML responses (`02-development-plan.md` §6b).
- **`run_agent_on_pr`:** `agent` is validated as a uuid and pre-checked against `GET /agents` — `resolveTargets` does not filter `enabled`, and a non-uuid id yields a 500. After the stream closes the run can still be `running`/null (in-memory `RunBus`, API restart): treated like a timeout.
- **`get_findings`:** also reads `GET /pulls/:id/runs` (otherwise "still running"/"failed" are unreachable); `run_id` stays required in v1; dismissed findings are dropped (`dismissed_count`); `limit` (1–50) and `truncated` added.
- **`get_conventions`:** `limit` (1–100) and `truncated` added; `evidence_snippet` capped at 300 chars.
- **Tool names:** no prefix (confirmed).
- **Milestone order:** the repo/PR resolver comes before `get_conventions`.
- **Changes outside the package** (approved): also `.mcp.json` (committed), `.claude/references/skill-routing.md`, `.claude/skills/engineering-insights/SKILL.md`, `scripts/check-all.sh`, package `README.md` and `INSIGHTS.md`, besides the items listed at the end of this document.

## Problem

Expose DevDigest's PR-review workflow (agents, review runs, findings, conventions)
to an LLM client (Claude Code/Desktop) via a local MCP server, so a model can
list configured agents, trigger a review on a pull request, read back its
findings, and read a repo's accepted conventions — without the model ever
talking to the Fastify API or the DB directly. `devdigest-mcp` is a **thin HTTP
client adapter** over the existing API at `http://localhost:3001`; it owns no
business logic, no DB, and makes no changes to `server/` or `client/`.

## Tools

Each tool's `description` below is **final — copy verbatim at implementation
time**, together with its name, annotations and argument shape.

### 1. `list_agents`
- **Description:** `List the review agents configured in this workspace, with the agent id other tools need.`
- **Annotations:** `{ readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true }`
- **Args:** none
- **Calls:** `GET /agents`
- **Output (trimmed):** `{ agents: { id, name, provider, model, enabled }[] }` — drops `description`, `system_prompt`, `output_schema`, `version`, `strategy`, `ci_fail_on`, `repo_intel`.

### 2. `get_conventions`
- **Description:** `Get this repo's accepted coding conventions (naming, structure, etc.) with evidence.`
- **Annotations:** `{ readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true }`
- **Args (flat):** `repo: string` (full_name, `owner/name`), `includePending?: boolean` (default `false`)
- **Calls:** `GET /repos` (resolve `repo` → `repo_id` by matching `full_name`) → `GET /repos/:id/conventions`
- **Output (trimmed):** `{ conventions: { rule, category, evidence_path, evidence_snippet, evidence_line, confidence }[] }`, filtered to `accepted: true` unless `includePending` is set.

### 3. `get_findings`
- **Description:** `Get the verdict and findings from a specific completed review run.`
- **Annotations:** `{ readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true }`
- **Args (flat):** `repo: string`, `pr: number`, `run_id: string` — stateless (no server-side run_id→pr_id cache; resolved the same way every call).
- **Calls:** resolve `repo`+`pr` → `pr_id` → `GET /pulls/:id/reviews`, match `run_id`.
- **Output (trimmed):** `{ verdict, summary, score, findings: { severity, category, title, file, start_line, end_line, rationale, suggestion? }[] }`.

### 4. `run_agent_on_pr`
- **Description:** `Run a review agent on a pull request and return its findings once the run finishes (up to ~2 minutes).`
- **Annotations:** `{ readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: true }`
- **Args (flat):** `repo: string`, `pr: number`, `agent: string` (agent id from `list_agents`)
- **The only write tool** — blocks for up to **120s**.
- **Calls / orchestration** (lives in `services/review-service.ts`, not in the tool handler):
  1. Resolve `repo`+`pr` → `pr_id`.
  2. `POST /pulls/:pr_id/review { agentId: agent }`. If `agent` is unknown/disabled, this call itself returns `404` (`resolveTargets` throws `NotFoundError` before any run is created — verified in `server/src/modules/reviews/service.ts`) → maps directly to the "agent not found" error, no extra branch needed.
  3. Start a 120 000 ms `AbortController` timeout.
  4. Open `GET /runs/:run_id/events` (SSE) and wait for the **stream to close** — `RunEventKind` is only `['info','tool','result','error']`, there is **no `'done'` event**; completion is the HTTP stream itself ending (`runBus.complete()` → `onDone`), identically on success and failure. If the abort fires first, stop and go to the timeout branch — **never** call `POST /runs/:run_id/cancel`.
  5. After stream close, `GET /pulls/:pr_id/runs` → find `run_id`, branch on `status`:
     - `done` → `GET /pulls/:pr_id/reviews`, match `run_id`, return trimmed (same shape as `get_findings`).
     - `failed`/`cancelled` → error built from `RunSummary.error`.
  6. Timeout → `isError: true`, message names `run_id` and tells the caller to retrieve the result later via `get_findings(repo, pr, run_id)`. The run is **left running** server-side (sunk LLM cost is not thrown away).

### 5. `get_blast_radius`
> **Amended 2026-10-01:** implemented (previously a stub). Text below is the current behaviour.
- **Description:** `Get the blast radius of a pull request: changed symbols, downstream callers (file:line), affected endpoints and crons, and whether the repo index was degraded.`
- **Annotations:** `{ readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true }`
- **Args (flat):** `repo: string`, `pr: number` — resolved via the shared resolver to `pr_id`.
- **Flow:** resolve → `GET /pulls/:pr_id/blast` (parsed with the shared `BlastRadiusResponse`) → return `{ repo, pr, ...response }`. No LLM, same data as the browser.
- **Output:** `{ repo, pr, changed_symbols[{name,file,kind}], downstream[{symbol, callers[{name,file,line}], endpoints_affected[], crons_affected[]}], summary, degraded: boolean, reason: 'flag_off'|'index_failed'|'index_partial'|'repo_too_large'|'no_data'|null, impacted_endpoints[] }`. A degraded index is a normal result (`isError: false`); API failures map to tool errors like the sibling tools (404 -> not found, contract mismatch -> contract error).

## Error messages ("error leads forward" — one sentence what happened + one sentence what to call next)

| Case | Message |
|---|---|
| Repo not found | `No repo matching "${repo}" was found. Check the "owner/name" spelling; this tool does not add new repos, only the DevDigest UI/API does.` |
| PR not found | `PR #${pr} was not found in repo "${repo}". Check the PR number, or that the repo has been polled recently enough to have indexed it.` |
| Agent not found/disabled | `Agent "${agent}" was not found (or is disabled) in this workspace. Call list_agents to get a valid, enabled agent id.` |
| Run not found (get_findings) | `No review found for run_id "${run_id}" on PR #${pr} in "${repo}". Check the run_id against the one run_agent_on_pr returned.` |
| Run still running | `Run "${run_id}" is still in progress and has no findings yet. Wait and call get_findings again.` |
| Run timeout (120s) | `Run "${run_id}" is still running after 2 minutes and was left running (not cancelled). Call get_findings(repo="${repo}", pr=${pr}, run_id="${run_id}") again later to fetch the result.` |
| Run failed | `Run "${run_id}" failed: ${runSummary.error ?? 'no error detail was recorded'}. Call list_agents to confirm the agent is still valid, or try run_agent_on_pr again.` |
| Run cancelled | `Run "${run_id}" was cancelled before it produced findings. Call run_agent_on_pr again to start a new run.` |

## Architecture (onion-adapted layering — see `onion-architecture` skill)

No DI container (overkill for 5 tools); plain constructor/module-level wiring instead.

```
src/
  index.ts                     # ring 4: composition root — McpServer + registerTool x5 + stdio transport
  config.ts                    # ring 4: API_BASE_URL (default :3001), RUN_TIMEOUT_MS=120000
  adapters/
    devdigest-client.ts        # ring 3: the only fetch() calls — GET/POST to the DevDigest API
    sse.ts                     # ring 3: consumes GET /runs/:id/events, resolves on stream close or abort
  domain/
    matching.ts                # ring 1: pure matchRepoByFullName / matchPrByNumber
    trim.ts                    # ring 1: pure response trimming (toAgentSummary, toFindingsSummary, ...)
    errors.ts                  # ring 1: pure error-message builders (table above)
  services/
    agents-service.ts          # ring 2: listAgents()
    conventions-service.ts     # ring 2: getConventions(repo, includePending)
    review-service.ts          # ring 2: getFindings(...), runAgentOnPr(...) — ALL orchestration lives here
    blast-radius-service.ts    # ring 2
  tools/                       # ring 4, thin like routes.ts: Zod schema + annotations -> service call -> map to MCP result
    list-agents.ts
    get-conventions.ts
    get-findings.ts
    run-agent-on-pr.ts
    get-blast-radius.ts
```

Contracts: alias `@devdigest/shared` via `tsconfig.json` path-alias (same pattern as `reviewer-core/tsconfig.json`) — do **not** hand-vendor a second copy (that's how `client/src/vendor/shared` already drifted from the server original, per `server/INSIGHTS.md`). Wire-shape parsing uses the real `@devdigest/shared` Zod objects (`Repo`, `PrMeta`, `Agent`, `RunSummary`, `ReviewRecord`, `ConventionCandidate`); each tool's own trimmed output schema is hand-written and owned by this package.

## Schema changes

None — this package touches no database.

## Testing

Hermetic only (`vitest`), no `*.it.test.ts` tier — nothing here duplicates what `server-integration` already covers (routes, SSE wiring, DB correctness are the server's responsibility). Mock the HTTP layer (stub `fetch`), same spirit as `server/src/adapters/mocks.ts`. One happy path + the edge that matters per tool/module:
- `domain/matching.test.ts` — repo/PR match + both not-found paths, once (reused by three tools).
- `tools/list-agents.test.ts`, `get-conventions.test.ts` (accepted/pending filter), `get-findings.test.ts` (success + run-not-found).
- `tools/run-agent-on-pr.test.ts` — needs a small local fake SSE server (`node:http`), not a plain `fetch` stub, to exercise stream-close-success, stream-close-failed, and the 120s-timeout path (`RUN_TIMEOUT_MS` injectable via `config.ts` so tests use e.g. 50ms) — and assert `POST /runs/:id/cancel` is **never** called on timeout.
- `tools/get-blast-radius.test.ts` — (amended 2026-10-01) happy path returns the server payload, resolver errors surface, ApiError 404 -> tool error; adapter `getBlast` covered in `adapters/devdigest-client.test.ts` incl. contract mismatch.

## Implementation order (milestones)

1. Scaffold + `list_agents` — proves stdio transport + one real HTTP round-trip end-to-end in Claude Desktop/Code.
2. `get_conventions` — second read tool, exercises accepted/pending filtering + config env var.
3. `domain/matching.ts` + `services/*-service.ts` wiring for repo/PR resolution — shared by 3 of 5 tools, built once.
4. `get_findings` — full resolver + `ReviewRecord` trimming, reused later by `run_agent_on_pr`.
5. `run_agent_on_pr` — hardest: write + SSE + 120s timeout + 3-way outcome branch. Build `adapters/sse.ts` here.
6. `get_blast_radius` — stub at first; implemented 2026-10-01 (see §5).

## Changes outside this package (tracked here, not yet applied)

- `.github/workflows/mcp.yml` (new) — CI workflow for this package, modelled on `server-unit.yml`/`reviewer-core.yml`: `npm ci && npm test && npm run typecheck`, path-filtered to `devdigest-mcp/**`.
- `TESTING.md` — new Suite-map row: `mcp | devdigest-mcp/ | unit (hermetic, mocked HTTP) | vitest | mcp.yml | no`.
- Root `CLAUDE.md` — add `devdigest-mcp/` to "Where things live", add a Commands row (`cd devdigest-mcp && npm run dev | build | typecheck | test`), and extend the "`reviewer-core/` + `e2e/` use npm" sentence to include `devdigest-mcp/`.
- **No changes** to `server/`, `client/`, `scripts/dev.sh`, or `.gitignore` — confirmed not needed (see conversation history / PR description for the reasoning).

## Acceptance criteria

- All 5 tools registered on a stdio `McpServer`, discoverable from Claude Desktop/Code.
- Each tool's `name`, `description` (verbatim from this doc) and annotation set match this spec exactly.
- `run_agent_on_pr` blocks ≤120s, never calls `POST /runs/:id/cancel` on timeout, and the timeout error names `run_id`.
- (amended 2026-10-01) `get_blast_radius` returns the server's `BlastRadiusResponse` plus `repo`/`pr` with `isError: false`; it is no longer a stub.
- Hermetic test suite passes; `run_agent_on_pr`'s timeout/cancel-avoidance behavior is covered by a test against a fake SSE server, not asserted by inspection only.

## Open questions

- Tool-name namespacing (e.g. `devdigest_list_agents` prefix, to avoid collisions with other MCP servers' tools in the same chat) — considered, deliberately **not** applied; names match the product spec exactly (`list_agents`, `run_agent_on_pr`, ...). Revisit if this server is ever used alongside other MCP servers in the same client.
- Server-side convenience filters (`GET /repos?full_name=`, `GET /repos/:id/pulls?number=`) to avoid client-side list-and-match — not required at current scale (few imported repos), flagged as a possible future optimization only.
