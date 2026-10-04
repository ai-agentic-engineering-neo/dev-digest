# devdigest-mcp — Development Plan

**Status:** approved by the user (2026-10-01), not started
**Packages:** `devdigest-mcp` (new, npm, stdio only). Outside the package: `.mcp.json`,
`.github/workflows/mcp.yml`, `TESTING.md`, root `CLAUDE.md`,
`.claude/references/skill-routing.md`, `.claude/skills/engineering-insights/SKILL.md`,
`scripts/check-all.sh`. `server/`, `client/`, `reviewer-core/` are **not** changed.
**Source of truth for tools:** `01-mcp-server.md` (names, descriptions, annotations verbatim).
Produced by the `planner` workflow; facts below were verified against the code on branch `hw4-mcp`
after merging `hw3-subagents`. Items marked *unverified* must be checked during implementation.

## 1. Problem and goal

Give an LLM client (Claude Code) access to the DevDigest PR-review flow through a thin HTTP
adapter over the existing Fastify API. No DB, no business logic, no secrets. Exactly 5 tools.
`run_agent_on_pr` returns the finished result, not an operation handle. Errors say what to call
next. Outputs are compact.

## 2. Scope

**In:** package `devdigest-mcp/`; configurable API URL; fail-fast with a clear error when the URL
points at the web UI; mapping of 400/422/404/409/429/5xx/network errors; SSE consumption with a
120 s deadline and no cancel; hermetic vitest with a fake API/SSE server; `.mcp.json`; CI;
docs and routing tables.

**Out:** HTTP/remote transport, auth, npm publishing, a real Blast Radius, any change to
`server/`, `client/` or `@devdigest/shared`, server-side filters (`?full_name=`, `?number=`),
other write tools (extract conventions, accept/dismiss), `get_findings` without `run_id`.

## 3. Decisions (user, 2026-10-01)

| # | Decision |
|---|----------|
| D1 | API: `http://127.0.0.1:3001` (API_PORT, bound to `127.0.0.1`). Web UI is `:3000`. Verified live: `/health` → `{"status":"ok"}` on 3001; 3000 returns HTML. URL comes from env `DEVDIGEST_API_URL`. |
| D2 | Run timeout fixed at 120 s (`DEVDIGEST_RUN_TIMEOUT_MS`, may only be lowered, for tests/manual). On timeout: `isError: true`, message names `run_id`, run is **left running**, `POST /runs/:id/cancel` is **never** called. |
| D3 | Tool names have no prefix (match the spec and the course slide). |
| D4 | `get_findings` requires `run_id` in v1 (stateless server, as in the spec). |
| D5 | Edits to root `CLAUDE.md`, `.claude/references/skill-routing.md`, `scripts/check-all.sh` are approved. |
| D6 | `.mcp.json` is committed to the repo. |
| D7 | Claude Code is restarted before implementation so the project subagents are available. |
| D8 | Real runs use OpenRouter with cheap models; automated tests never make paid calls. |

## 4. Architecture constraints (`onion-architecture`, adapted: no DI container)

```
src/
  index.ts                      ring 4  composition root: adapter + services + McpServer + stdio
  config.ts                     ring 4  zod-validated env
  log.ts                        ring 4  stderr only
  domain/                       ring 1  pure
    ports.ts                    DevDigestApi port + ApiError type
    matching.ts                 matchRepoByFullName / matchPrByNumber
    trim.ts                     toAgentSummary / toFindingsSummary / toConventionSummary
    errors.ts                   error-message builders
  services/                     ring 2  orchestration, depend on the port only
    agents-service.ts  conventions-service.ts  review-service.ts  blast-radius-service.ts  resolver.ts
  adapters/                     ring 3  the only place with fetch()
    devdigest-client.ts         HTTP + runtime parsing with @devdigest/shared schemas
    sse.ts                      GET /runs/:id/events until the stream closes or aborts
  tools/                        ring 4  thin: zod input -> service -> MCP result
    result.ts list-agents.ts get-conventions.ts get-findings.ts run-agent-on-pr.ts get-blast-radius.ts
```

- Contracts: tsconfig path alias to `../server/src/vendor/shared` plus an alias `zod →
  ./node_modules/zod` in **both** `tsconfig.json` and `vitest.config.ts` (CI has no
  `server/node_modules`). Never hand-copy `vendor/shared`.
- npm only inside this package. Never run pnpm here.
- stdio hygiene: stdout carries only JSON-RPC. All logs go to stderr. A test greps `src/` for
  `console.log` / `process.stdout`.
- Security: base URL only from env, validated as http(s). Tool args never contain URLs. `agent`
  and `run_id` are uuids, `repo` matches `^[\w.-]+/[\w.-]+$`, path segments use
  `encodeURIComponent`, `fetch` uses `redirect: 'error'`. `details`, stack traces and 5xx bodies
  never reach the output. The package reads no secrets and never returns an agent's `system_prompt`.
- Do not touch: `server/clones/**`, `**/src/vendor/**` (read-only via alias), migrations, other
  packages' lockfiles.

## 5. Contract changes

None. `@devdigest/shared` is only read. No client vendor sync, no migration. Each tool's trimmed
output schema is hand-written in `src/domain/trim.ts`.

## 6. Steps

| # | What | Files | Skills | Verification |
|---|------|-------|--------|--------------|
| 0 | Baseline: `devdigest-mcp/` holds only `specs/`; `.gitignore` already covers `node_modules/` | — | `engineering-insights` (read) | `ls devdigest-mcp` |
| 1 | **Scaffold.** `package.json` (`@devdigest/mcp`, private, ESM, node ≥22, scripts `start`/`dev` = `tsx src/index.ts`, `typecheck`/`build` = `tsc --noEmit`, `test` = `vitest run`); deps `@modelcontextprotocol/sdk ^1.31.0`, `zod ^3.25.76`; devDeps as in `reviewer-core`. `config.ts`: `DEVDIGEST_API_URL` (default `http://127.0.0.1:3001`), `DEVDIGEST_RUN_TIMEOUT_MS` (default 120000, int 1000..120000), `DEVDIGEST_HTTP_TIMEOUT_MS` (default 30000). Invalid env → clear stderr message, exit 1. | `package.json`, lockfile, `tsconfig.json`, `vitest.config.ts`, `src/config.ts`, `src/log.ts` | onion-architecture, zod, typescript-expert, security | `npm install && npm run typecheck` |
| 2 | **Port + adapter.** `DevDigestApi`: `health`, `listAgents`, `listRepos`, `listPulls`, `listConventions`, `startReview`, `listRuns`, `listReviews`, `waitForRunEnd`. `ApiError.kind`: `unreachable \| not_api \| invalid_input \| not_found \| conflict \| rate_limited \| server \| contract`. Check `content-type` (HTML → `not_api`). 400 **and** 422 → `invalid_input`; 404, 409, 429, ≥500, ECONNREFUSED/ENOTFOUND/abort mapped. Parse with `safeParse` of the shared schemas. Lazy `health()` before the first tool call, cached on success; only a stderr warning at startup, no exit. | `src/domain/ports.ts`, `errors.ts`, `src/adapters/devdigest-client.ts`, `test/helpers/fake-api.ts`, `test/adapters/devdigest-client.test.ts` | onion-architecture, zod, security | `npm test -- adapters` |
| 3 | **M1 `list_agents` end to end.** `trim.ts` (`id,name,provider,model,enabled`), `agents-service.ts`, `tools/result.ts` (`ok` / `fail` with a last-resort try/catch), `list-agents.ts`, `index.ts`, root `.mcp.json` (see §8). Check raw-shape zod v3 against `registerTool` in SDK 1.31. | see left | onion-architecture, zod, security | `npm test`; `npm run --silent --prefix devdigest-mcp start </dev/null 2>/dev/null \| wc -c` = 0; `/mcp` shows connected |
| 4 | **Resolver.** `matching.ts` (case-insensitive, trim; ignores PRs with `id == null`), `resolver.ts` (`resolveRepo`, `resolvePull`, stateless). | `src/domain/matching.ts`, `src/services/resolver.ts`, test | onion-architecture, typescript-expert | `npm test -- matching` |
| 5 | **`get_conventions`.** Args `repo`, `includePending?` (default false), `limit?` (1–100, default 50). Filter `accepted`, sort by confidence desc, `evidence_snippet` ≤300 chars. Output `{repo,total,returned,truncated,conventions[]}`. Empty list is a normal result with a hint to extract/accept in the UI (MCP never triggers the LLM extraction). | service, tool, test | onion-architecture, zod, security | `npm test -- get-conventions` |
| 6 | **`get_findings`.** Args `repo`, `pr` (`int().positive()`), `run_id` (`uuid()`), `limit?` (1–50, default 20). `resolvePull` → `GET /pulls/:id/reviews`, keep `kind==='review'` and matching `run_id`. No review → `GET /pulls/:id/runs`: running/null → "still in progress"; failed/cancelled → matching message; absent → "run not found". Trim: drop dismissed (report `dismissed_count`), sort CRITICAL>WARNING>SUGGESTION, `rationale` ≤400, `suggestion` ≤300, `summary` ≤600, severity `counts`, `truncated`. | `review-service.ts`, `trim.ts`, tool, test | onion-architecture, zod, security | `npm test -- get-findings` |
| 7 | **`run_agent_on_pr`** (only write tool). Args `repo`, `pr`, `agent` (`uuid()`). Deadline starts at tool entry. (1) `resolvePull`. (2) pre-check `GET /agents`: unknown or `enabled:false` → "agent not found", no POST. (3) `POST /pulls/:prId/review {agentId}` → `run_id`; from here every message contains `run_id`, also written to stderr. (4) `sse.ts`: `fetch` GET `/runs/:id/events` with the deadline signal, read the body to the end (no EventSource); forward events as progress notifications if the client gave a `progressToken` (*check the SDK d.ts*). (5) Stream closed → `GET /pulls/:id/runs`: `done` → `GET /pulls/:id/reviews` → trimmed like `get_findings`; `failed`/`cancelled` → error from `RunSummary.error` (≤300 chars); running/null (stream dropped, e.g. API restart) → same as timeout; `done` without a persisted review → "call get_findings later". (6) Timeout → abort SSE, **no cancel**, message with `run_id` and `get_findings(...)`. An SSE error after the POST takes the same "left running" path. | `sse.ts`, `review-service.ts`, tool, test with fake SSE server | onion-architecture, zod, security, typescript-expert | `npm test -- run-agent-on-pr` |
| 8 | **`get_blast_radius` stub.** `resolvePull` for input validation, then `isError:false`, `{status:'not_implemented', repo, pr, message}`. | service, tool, test | onion-architecture, zod | `npm test -- blast-radius` |
| 9 | **Registration + stdio tests.** `InMemoryTransport` + `Client.listTools()`: exactly 5 tools, verbatim name/description/annotations, every input field has `.describe`. Spawn smoke test: every stdout line is valid JSON-RPC. Grep test for `console.log` / `process.stdout`. | `test/registration.test.ts`, `test/stdio.test.ts` | zod, typescript-expert | `npm test` |
| 10 | **Outside the package** (D5, D6). `.github/workflows/mcp.yml` modelled on `reviewer-core.yml` (paths `devdigest-mcp/**`, `server/src/vendor/shared/**`; `npm ci` → typecheck → test). `TESTING.md` suite-map row. Root `CLAUDE.md`: Where-things-live row, Commands row, npm sentence extended. `.claude/references/skill-routing.md`: add `devdigest-mcp/**` to the `onion-architecture` row and a "Commands per package" row. `.claude/skills/engineering-insights/SKILL.md`: module row `devdigest-mcp/** → devdigest-mcp/INSIGHTS.md`. `scripts/check-all.sh`: add the package. `devdigest-mcp/README.md` (env, registration, `/mcp`, client timeout), `devdigest-mcp/INSIGHTS.md` (fixed sections, no entries). | listed | `engineering-insights` (read) | `scripts/check-all.sh --force` passes and lists `devdigest-mcp` |
| 11 | **Manual E2E** (§7b). | — | — | checklist |

## 6a. Corrections to `01-mcp-server.md` (evidence)

1. **Disabled agent does not give 404.** `resolveTargets` uses `getById`, which does not filter `enabled` (`server/src/modules/reviews/service.ts:62-65`, `agents/repository.ts:89-95`), so the run starts. Pre-check via `GET /agents`.
2. **Non-uuid `agent` gives 500, not 404.** `RunRequest.agentId` is `z.string()` (`vendor/shared/contracts/platform.ts:272-275`) while `agents.id` is uuid (`db/schema/agents.ts:9`). Validate `agent` as uuid in the input schema.
3. **After the SSE stream closes the status can still be `running`/null.** `RunBus` is in memory (`platform/sse.ts`); an API restart loses the run. Add that branch, plus "done but no review persisted".
4. **`get_findings` must also read `GET /pulls/:id/runs`**, otherwise "still running" and "failed" from the error table are unreachable.
5. **Wire shapes.** `/pulls/:id/reviews` returns `ReviewDto` (`reviews/helpers.ts:36-50`, no response schema), structurally `ReviewRecord` (`review-api.ts:23-37`). Parse with `ReviewRecord.safeParse` and keep `kind==='review'` (summary rows have `verdict:null`). `RunSummary.status` is a nullable string, not an enum (`trace.ts:108`). Field names in the spec are otherwise correct.
6. **Deadline from tool entry**, not after the POST: `GET /repos/:id/pulls` syncs with GitHub and backfills on every call (`pulls/service.ts:60-71`).
7. **Default URL `127.0.0.1`, not `localhost`** (`config.ts:31-33`). The client's `localhost:3001` works in a browser; Node `fetch` resolution of `localhost` to `::1` is *unverified* on this machine, so we avoid the question.
8. **Caps and markers** (`limit`, `total`, `returned`, `truncated`) for `get_findings` and `get_conventions`.
9. **Milestone order:** resolver before `get_conventions`.
10. **Changes outside the package** extended: `.mcp.json`, `skill-routing.md` (both tables), `engineering-insights` module table, `check-all.sh`, package README/INSIGHTS. "No `.gitignore` change" confirmed.
11. **Migration `0013`** (intent layer) is applied by `./scripts/dev.sh` on every start (`scripts/dev.sh:82-84`); run `cd server && pnpm db:migrate` manually only if the API is started another way.

## 6b. Error mapping (always `isError: true`; one sentence what happened, one what to do)

| Case | Message (gist) |
|---|---|
| `unreachable` | `DevDigest API is not reachable at ${base}. Start it with ./scripts/dev.sh (API listens on 127.0.0.1:3001) or fix DEVDIGEST_API_URL in .mcp.json, then call this tool again.` |
| `not_api` | `${base} answered with HTML, not the DevDigest API — it looks like the web UI (Next.js, port 3000). Set DEVDIGEST_API_URL to the API (default http://127.0.0.1:3001) and reconnect the server via /mcp.` |
| 400 / 422 | `DevDigest rejected the request as invalid (${code}). Check the arguments: repo as "owner/name", pr as a positive integer, agent and run_id as ids returned by list_agents / run_agent_on_pr.` |
| 404 | contextual messages from `01-mcp-server.md` (repo / PR / agent / run) |
| 409 | `DevDigest reported a conflict: ${message}. Wait a few seconds and call the tool again.` |
| 429 | `DevDigest rate limit reached (starting reviews is limited to 10 per minute). Wait about a minute before calling ${tool} again — do not retry in a loop.` |
| 5xx | `The DevDigest API failed with an internal error (HTTP ${status}). Check the API terminal; if it shows "relation … does not exist", run "cd server && pnpm db:migrate", then retry.` |
| `contract` | `DevDigest returned an unexpected response from ${endpoint}. The MCP server and the API are probably on different commits — update both, then retry.` |
| run timeout / stream dropped | "Run timeout" row from `01-mcp-server.md`, always with `run_id` |

## 7. Test plan

- `cd devdigest-mcp && npm ci && npm run typecheck && npm test`. No Docker, no `*.it.test.ts`, no real network calls, no keys.
- After step 10 run `scripts/check-all.sh --force` to confirm the other suites are untouched.
- `domain/matching.test.ts`: match, repo-not-found, PR-not-found, PR with `id: null`.
- `adapters/devdigest-client.test.ts` against `test/helpers/fake-api.ts` (`node:http`): 200, 400, 422, 404, 409, 429, 500, HTML response (fake "Next.js"), closed port, schema mismatch; assert `details` and stack never reach the message.
- `tools/*.test.ts`: happy path plus the main edge per tool; services use a fake port.
- `run-agent-on-pr.test.ts` with a real fake SSE server: stream closes → done / failed / cancelled; stream held open with `RUN_TIMEOUT_MS=50` → timeout branch, request log must **not** contain `POST /runs/:id/cancel`, message contains `run_id`; stream drops → "left running"; disabled agent → `POST /pulls/:id/review` never called; 429 on POST.
- `registration.test.ts` and `stdio.test.ts` as in step 9.

### 7b. Manual E2E (minimal paid calls, OpenRouter, cheap models)

1. `./scripts/dev.sh`; `curl -s http://127.0.0.1:3001/health` → `{"status":"ok"}`.
2. In the UI: repo imported, PR visible (needs `GITHUB_TOKEN`), OpenRouter key set; `review_intent` and the test agent use cheap models (Settings → Models).
3. `cd devdigest-mcp && npm ci`; restart Claude Code in the repo root, approve the project server, `/mcp` → `devdigest` connected, 5 tools.
4. `ENABLE_TOOL_SEARCH` in `.claude/settings.json` may defer the tools; check discovery in natural language ("which review agents are configured in DevDigest?").
5. `get_conventions` with and without `includePending`; `get_blast_radius` → `not_implemented`.
6. **Paid call 1:** `run_agent_on_pr` on a small PR → findings; then `get_findings` with that `run_id` → same data, no cost.
7. **Paid call 2 (timeout):** temporarily `DEVDIGEST_RUN_TIMEOUT_MS=5000` in `.mcp.json`, reconnect, run → message with `run_id`; in the UI the run keeps going to `done` with no cancel; `get_findings(run_id)` returns the result. Restore the env afterwards.
8. Free negative cases: stop the API → `unreachable`; `DEVDIGEST_API_URL=http://localhost:3000` → `not_api`; unknown `owner/name`; unknown PR; disabled agent.
9. Cost: two review runs plus one intent call (cached per `head_sha`+`input_hash`). Keep the PR small.

## 8. Risks and known traps

- **A cold first run may not fit in 120 s.** The executor derives PR intent before the agents (`run-executor.ts:113-119`, `RUN_INTENT_TIMEOUT_MS = 45 s` in `intent-constants.ts`). The timeout path is therefore first-class (D2).
- **Claude Code's own tool timeout may be shorter than 120 s** (default *unverified*; the SDK `Client` default is 60 s without progress notifications). Mitigation: progress notifications per SSE event, `run_id` on stderr, README tells the user to set `MCP_TOOL_TIMEOUT=150000` in the environment of the `claude` process. Putting it in the server's `env` inside `.mcp.json` (as commit `a3ea46d` did) most likely has no effect.
- **tsx resolves `tsconfig.json` from the cwd.** Running `tsx devdigest-mcp/src/index.ts` from the repo root loses the alias. Use `npm run --silent --prefix devdigest-mcp start`; `--silent` is mandatory, otherwise the npm banner lands in stdout and breaks the protocol. `.mcp.json`: `{"mcpServers":{"devdigest":{"type":"stdio","command":"npm","args":["run","--silent","--prefix","devdigest-mcp","start"],"env":{"DEVDIGEST_API_URL":"http://127.0.0.1:3001"}}}}`.
- **Second zod copy.** `server/src/vendor/shared/*` imports `zod`; without the `zod` alias in tsconfig and vitest CI fails with `ERR_MODULE_NOT_FOUND` while local runs silently pick up `server/node_modules/zod`. CI must exercise the no-server-deps case.
- **SDK 1.31** needs `zod ^3.25 || ^4` and imports `zod/v4` internally; pin `^3.25.76` and verify raw-shape compatibility in step 3.
- **`GET /repos/:id/pulls` is not a pure read** (GitHub sync + DB writes). `readOnlyHint` is true from the user's viewpoint; keep the HTTP timeout generous (30 s).
- **Rate limits:** 120/min global, 10/min for `POST /pulls/:id/review`. Each `get_findings` makes 3–4 requests.
- **Prompt injection:** findings and conventions are LLM text about untrusted code. Return them only as truncated JSON fields.
- **Migrations:** `relation … does not exist` / 500 = `db:migrate` was skipped.
- **Never:** pnpm in this package, a copy of `vendor/shared`, `console.log`, `POST /runs/:id/cancel`, URLs from tool args, `docker compose down -v`.

## 9. Acceptance criteria

- 5 tools on a stdio `McpServer`; name, description and annotations verbatim from `01-mcp-server.md` (checked by `registration.test.ts`); flat args, every field has `.describe`, enums and bounds set.
- `list_agents`, `get_conventions`, `get_findings` return trimmed fields only; lists carry `total`/`returned`/`truncated`.
- `run_agent_on_pr` returns the findings of the finished run, blocks at most `RUN_TIMEOUT_MS` from tool entry, never calls `POST /runs/:id/cancel` on timeout (fake-SSE test), and the timeout error contains `run_id` and `get_findings(...)`.
- Disabled or unknown agent is rejected before the POST; a non-uuid agent never reaches the server.
- 400 and 422, 404, 409, 429, 5xx, ECONNREFUSED and an HTML response map to §6b; no stack, `details` or secrets in output.
- `get_blast_radius` returns `isError:false`, `status:'not_implemented'` after validating repo/PR.
- stdout is JSON-RPC only; `DEVDIGEST_API_URL` is configurable, default `http://127.0.0.1:3001`.
- `npm run typecheck && npm test` green in `devdigest-mcp/`; `mcp.yml` green; `scripts/check-all.sh` includes the package; manual E2E §7b done.

## 10. Open questions (remaining, with defaults)

1. **Dismissed findings in `get_findings`.** Default: exclude, return `dismissed_count`.
2. **`outputSchema` / `structuredContent`.** Default: no in v1, compact JSON in `text` (fewer tokens, fewer moving parts).
3. **Client-side timeout in Claude Code** — verify at E2E step 6 and record the result in `devdigest-mcp/INSIGHTS.md`.

Assumptions: one workspace, no auth; the repo list is small, so list-then-match is enough.

## 11. Handoff

- Order: 0 → 1 → 2 → 3 (M1, visible in Claude Code) → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11. Each step ends with green `npm run typecheck && npm test` in `devdigest-mcp/`.
- Do not touch: `server/**`, `client/**`, `reviewer-core/**`, `**/src/vendor/**`, migrations, other lockfiles, `server/clones/**`.
- Before merge: `architecture-reviewer` (ring boundaries, `fetch` only in `adapters/`, thin `tools/`), a manual or `/security-review` pass (input validation, leaks in messages, `redirect`, base URL), `plan-verifier` against §9.
- Insight candidates for `server/INSIGHTS.md` after implementation (the main agent records them): `GET /repos/:id/pulls` syncs with GitHub on every call; `POST /pulls/:id/review` accepts a disabled agent and returns 500 for a non-uuid `agentId`.
