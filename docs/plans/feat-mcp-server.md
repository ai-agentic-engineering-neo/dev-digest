# Plan: L04 local MCP server `devdigest-mcp` · branch feat/mcp-server

Design-system task: no

Source brief: `.pipeline/feat-mcp-server/brief.md` (decisions in §1, course requirements §2,
API surface §3 and best practices §4 are constraints here; §5 unknowns are flagged in
*Risks & open questions*). Status: **ready to hand off**. The open questions below have a
default and do not block implementation.

## Goal & acceptance criteria

A new npm package `mcp/` (`@devdigest/mcp`) runs a stdio MCP server that wraps the local
Fastify API on `:3001` with exactly five tools, plus one new server route
`GET /runs/:id/findings`.

- [ ] AC1 `tools/list` returns exactly, in this order: `devdigest_list_agents`,
  `devdigest_run_agent_on_pr`, `devdigest_get_findings`, `devdigest_get_conventions`,
  `devdigest_get_blast_radius`; each has a `title` (course name), a description of
  3–4 sentences under 2,048 chars, and the annotations from the table in row M9; only the
  run tool has `_meta["anthropic/requiresUserInteraction"] = true`; no tool has
  `_meta["anthropic/alwaysLoad"]`. Verified by `mcp/test/tools-list.test.ts`.
- [ ] AC2 Server `instructions` are at most 4 sentences and under 2,048 chars. Verified by
  `mcp/test/tools-list.test.ts`.
- [ ] AC3 `repo` resolves by `name` or `owner/name` (case-insensitive), `pr_number` resolves to
  the internal PR id; an unknown or ambiguous repo or PR returns `isError: true` with the
  candidates listed. Verified by `mcp/test/resolve.test.ts`.
- [ ] AC4 API errors (`{ error: { code, message, details } }`), 404, 422, 429 and a refused
  connection become `isError: true` results with actionable text; connection refused names
  `./scripts/dev.sh`. Verified by `mcp/test/api-client.test.ts` and `mcp/test/errors.test.ts`.
- [ ] AC5 `devdigest_run_agent_on_pr` posts `POST /pulls/:id/review { agentId }`, polls until the
  run leaves `running`, sends `notifications/progress` while waiting (when the caller sent a
  progress token), and returns the finished verdict + findings; at the max wait it returns a
  non-error result with `run_id`, `status: "running"` and the instruction to call
  `devdigest_get_findings`; a `failed`/`cancelled` run returns `isError: true` with the run
  error and `run_id`. Verified by `mcp/test/wait.test.ts` and `mcp/test/run-tool.test.ts`.
- [ ] AC6 `response_format` (`concise` default | `detailed`) and `min_severity` shape the
  output of `get_findings` and `run_agent_on_pr`; concise never includes rationale text;
  `list_agents` never includes `system_prompt`; `get_conventions` defaults to accepted rules.
  Verified by `mcp/test/format.test.ts`.
- [ ] AC7 `devdigest_get_blast_radius` returns `isError: true` with "not implemented yet
  (homework)" and the expected `BlastRadius` shape. Verified by `mcp/test/tools-list.test.ts`
  (calls it).
- [ ] AC8 `GET /runs/:id/findings` returns `RunFindings` (run summary, review verdict or null,
  findings) for a run in the workspace, 404 `not_found` for an unknown run, 422 for a
  non-uuid id. Verified by `server/test/run-findings.it.test.ts`.
- [ ] AC9 `mcp`: `npm run typecheck`, `npm test`, `npm run lint` green; server and client
  typecheck/lint/unit/lint:arch green with no new baseline entry; client contract copy
  identical. Verified by `verify.sh run --with-it` plus the explicit `mcp/` commands
  (verify.sh does not know `mcp/`, see Risks).
- [ ] AC10 Claude Code connects: `/mcp` shows `devdigest` connected with 5 tools, and
  `/context all` before/after shows the startup cost limited to tool names + instructions.
  Verified by the manual steps in the Verification plan (results pasted into the PR body).

## Out of scope

- A blast-radius module or route (`repoIntel.getBlastRadius` stays facade-only; homework).
- HTTP/SSE MCP transport, remote hosting, auth, OAuth, tokens; resources and prompts
  primitives.
- Any server change besides `GET /runs/:id/findings` (no lookup route by repo name / PR
  number, no workspace scoping fixes for `/runs/:id/trace|events|cancel`).
- Cancelling the server-side run when the MCP call is aborted.
- Running several agents in one call (`all: true`).
- Client UI changes (the client only receives the contract copy).
- Extending `insight.sh` / `pr-self-review` scripts for the new package (`.claude/skills/` is
  do-not-touch; see Risks).

## Relevant INSIGHTS

- `server/INSIGHTS.md` (What Doesn't Work, 2026-09-26) — naming a contract that already
  exists (`AgentStats`) fails the barrel with TS2308 while vitest passes. Grepped:
  `RunFindings` is unused in `server/src` and `client/src` → affects row S1.
- `server/INSIGHTS.md` (Tool & Library Notes, 2026-09-25) — `instanceof z.ZodError` fails across
  two zod instances (`server/src/app.ts:141`). Drives the zod decision: `mcp/` imports
  `@devdigest/shared` **type-only**, so no second runtime zod copy is loaded from
  `server/node_modules` → affects rows M2, M4.
- `server/INSIGHTS.md` (What Works / Recurring Errors, 2026-10-06) — IT tests that POST a review
  must override `secrets`, `github`, `llm.openrouter`, and a run turns `done` before its trace
  is written; `waitForPrRuns` waits for both. The review row and findings are written
  *before* `completeAgentRun` (`server/src/modules/reviews/run-executor.ts:259,270,284`), so a
  `done` status means findings are readable → affects rows S7, M6.
- `server/INSIGHTS.md` (Codebase Patterns, 2026-09-25) — pulls/settings routes query Drizzle
  directly; legacy, never a pattern → the new route goes routes → service → repository.

## Architecture constraints

| Rule / limit | Applies to | How the plan complies |
|---|---|---|
| routes-no-persistence | `reviews/routes.ts` | handler calls `service.findingsForRun`; no drizzle/db import |
| drizzle-only-in-driven-ring | new query | lives in `reviews/repository/run.repo.ts` |
| application-no-row-types | `reviews/service.ts` | repository maps rows → `RunFindings` DTO (via `findingRowToDto`) before returning; service sees only the DTO. `service.ts` is already baselined for `db/rows` (AgentRow); no new import is added |
| application-no-container | `reviews/service.ts` | baselined already (`server/.dependency-cruiser-known-violations.json:137`); the new method uses `this.repo`, adds no import. Do not copy the container pattern elsewhere |
| every repo method takes `workspaceId` | `findingsForRun` | filters `agent_runs.workspace_id` and `reviews.workspace_id`; unlike `getRunTrace` (`server/specs/review-flow.md:199`) |
| validate at the edge | new route | `schema: { params: IdParams, response: { 200: RunFindings } }` |
| shared is a leaf / copy rule | `review-api.ts` | edit server copy, copy file verbatim to `client/src/vendor/shared/contracts/review-api.ts` |
| Do not touch | lockfiles | `mcp/package-lock.json` written only by `npm install`; no edits to other lockfiles |
| Do not touch | `.claude/skills/**` | not edited; `insight.sh` and `verify.sh` gaps handled by explicit commands (Risks) |
| stdio hygiene | `mcp/src/**` | nothing but protocol on stdout: ESLint `no-console` error except `console.error`/`console.warn`; no `npm run` wrapper in `.mcp.json` (npm banners go to stdout) |
| no secrets in tool args | all tools | no tool accepts a token/key; package reads no secret; API has no auth (`server/src/adapters/auth/local.ts`) |
| MCP startup cost | `src/server.ts` | 5 tools, fixed registration order, short `instructions`, no `alwaysLoad` |

## Existing patterns to follow

- New npm package with path-aliased contracts → copy `reviewer-core/package.json`,
  `reviewer-core/tsconfig.json:21-26` (paths for `@devdigest/shared` and `zod`),
  `reviewer-core/eslint.config.mjs`, `reviewer-core/vitest.config.ts:6-10`, `reviewer-core/.gitignore`.
- Package docs → `reviewer-core/AGENTS.md`, `reviewer-core/CLAUDE.md` (one line `@AGENTS.md`),
  `e2e/INSIGHTS.md:1-9` (header + fixed sections).
- Route in reviews → `server/src/modules/reviews/routes.ts:132-137` (`/runs/:id/trace`) and
  `:140-143` (reads).
- Service read → `ReviewService.listRuns` (`server/src/modules/reviews/service.ts:71`).
- Repository facade method → `ReviewRepository.listRunsForPull`
  (`server/src/modules/reviews/repository.ts:81`); query + mapping → `run.repo.ts:40-69`
  (`listRunsForPull` select with agent name join) and `review.repo.ts:58-74`.
- Finding row → DTO → `findingRowToDto` (`server/src/modules/reviews/helpers.ts:34`).
- Contract next to its siblings → `ReviewRunResponse` in
  `server/src/vendor/shared/contracts/review-api.ts:52`.
- IT test → `server/test/reviews.it.test.ts:111-202` (`appWith` overrides, `setupRepoAndPr`,
  POST review, `waitForPrRuns`).
- API error body type → `ApiErrorBody` (`server/src/vendor/shared/contracts/platform.ts:294`).

## Design decisions the implementer must follow

### Zod reconciliation
- `mcp/package.json` depends on `zod ^3.25.0` (SDK 1.32.1 peer `^3.25 || ^4.0`) and
  `@modelcontextprotocol/sdk` pinned `1.32.1`. Tool input schemas use `import { z } from 'zod'`
  (zod 3 API; resolved to mcp's own `node_modules`).
- `tsconfig.json` maps `zod`/`zod/*` to `./node_modules/zod` like reviewer-core, so the shared
  contract files type-check against mcp's zod 3.25 (v3 API superset of 3.24.1).
- Every import from `@devdigest/shared` in `mcp/src` is `import type`. Enforce with ESLint
  `@typescript-eslint/consistent-type-imports` (error) **and** a `no-restricted-imports` rule
  that allows `@devdigest/shared` only with `allowTypeImports: true`. Consequence: at runtime
  nothing resolves `@devdigest/shared`, so tsx needs no path mapping when started from the repo
  root, and no second zod instance is loaded.
- API responses are trusted local JSON, typed by `import type` contracts; the client checks HTTP
  status and the error envelope only. (Rejected: re-parsing responses with the shared zod
  schemas at runtime, which would load `server/node_modules/zod` 3.24 next to 3.25.)

### API client (`src/api/client.ts`)
- `createApiClient({ baseUrl, fetch })` with `get<T>(path)` and `post<T>(path, body)`;
  JSON headers; per-request `AbortSignal.timeout(15_000)` combined with the tool's
  `extra.signal` via `AbortSignal.any`.
- Error mapping to a typed `ApiError { kind, status?, code?, message }`:
  - `fetch` throws `ECONNREFUSED`/TypeError → `kind: 'unavailable'`: "DevDigest API is not
    reachable at <baseUrl>. Start it with ./scripts/dev.sh (or set DEVDIGEST_API_URL)."
  - non-2xx with `{ error: { code, message } }` → `kind: 'api'` keeping code + message;
    404 → "not found"; 422 → "invalid input" + details summary; 429 → "rate limited
    (POST /pulls/:id/review allows 10/min; global 120/min), retry in <retry-after>s".
  - non-JSON body → `kind: 'api'` with status and the first 200 chars.
- `src/errors.ts` `toToolError(err)` → `{ isError: true, content: [{ type: 'text', text }] }`.
  Tool handlers catch everything; protocol errors only come from the SDK (unknown tool,
  invalid input).

### Id resolution (`src/api/resolve.ts`)
- `resolveRepo(api, repo)`: `GET /repos` → match `full_name` case-insensitively when the input
  contains `/`, otherwise `name`; 0 matches → error listing up to 10 `full_name`s; >1 match →
  error "ambiguous, use owner/name" with the matches.
- `resolvePull(api, repo, prNumber)`: `GET /repos/:id/pulls` → `number === prNumber` with a
  non-null `id` (`PrMeta.id` is nullish, `platform.ts:174`); not found → error listing up to 10
  open PR numbers + titles.
- Results carry names next to ids (`repo: "acme/payments-api"`, `pr: { id, number, title }`).

### Run + wait (`src/tools/run-agent-on-pr.ts`, `src/wait.ts`)
- Input: `repo` (string), `pr_number` (int > 0), `agent_id` (uuid; "from
  devdigest_list_agents"), `response_format`, `min_severity`.
- Flow: resolve repo + PR → `POST /pulls/:id/review { agentId }` → take `runs[0]` →
  `waitForRun` polls **`GET /runs/:run_id/findings`** (the new route; it carries the run
  `status`, so one cheap single-run query replaces scanning `GET /pulls/:id/runs`) every
  `pollIntervalMs` (default 3000) until `run.status !== 'running'`.
- Progress: when `extra._meta?.progressToken` is present, each poll sends
  `notifications/progress { progressToken, progress: elapsedSeconds, message: "<agent> on
  <repo>#<n>: running, <s>s" }` via `extra.sendNotification`. No `total` (unknown).
- Max wait: `DEVDIGEST_MCP_MAX_WAIT_MS` (default 300000, clamped 10s–600s). On expiry return a
  normal result `{ run_id, agent_name, status: "running", elapsed_s, next: "Call
  devdigest_get_findings with run_id <id> in a minute." }`.
- On 429 during polling: wait `retry-after` (default 10 s) and continue; on `extra.signal`
  abort: stop polling and return the same fallback (the server run continues).
- Terminal `done` → shape with `src/format.ts`. `failed`/`cancelled` → `isError: true`
  "Run <id> <status>: <error>. Check the API log or retry; run_id <id>."
- `waitForRun` takes `sleep` and `now` as injectable deps so tests run with a fake clock.

### Result shaping (`src/format.ts`)
- One JSON text block per result (`JSON.stringify(x)` without indentation); no `outputSchema`
  (results vary by `response_format`; keeps the compliance rule trivially satisfied).
- Severity order CRITICAL > WARNING > SUGGESTION; `min_severity` default `SUGGESTION`.
- Concise findings: `{ verdict, score, summary (≤300 chars), counts: {critical, warning,
  suggestion}, blockers, cost_usd, findings: [{ severity, category, title, file, line }] }`,
  at most 15 findings, sorted by severity then confidence, plus `omitted: n`.
- Detailed: adds `id`, `end_line`, `confidence`, `rationale` and `suggestion` (each ≤800 chars),
  at most 50 findings. Hard cap on the whole text ~40k chars (≈10k tokens); beyond it drop
  findings from the tail and set `truncated: true`.
- `list_agents`: `{ id, name, description (≤200), provider, model, enabled, strategy,
  skill_count, runs }`; input `include_disabled` (default false). Never `system_prompt`,
  `output_schema`.
- `get_conventions`: input `repo`, `status` (`accepted` default | `candidate` | `rejected` |
  `all`). Output `{ repo, scan: { status, finished_at, model } | null, rules: [{ category, rule,
  evidence: "path:line", confidence }], counts_by_status }` from `GET /repos/:id/conventions`
  (`ConventionsView = { scan, candidates }`, `knowledge.ts:225`, `ConventionsService.view`
  `server/src/modules/conventions/service.ts:30`). No evidence snippets. When no accepted rule
  exists: say so and point to the Conventions page (accept candidates) or a scan.
- `get_findings`: input `run_id` (uuid) **or** `repo` + `pr_number` (+ optional `agent_id`)
  meaning "latest finished run on that PR" (via `GET /pulls/:id/runs`, newest first, first
  with status ≠ running, matching the agent if given); neither given → `isError` with an
  example. A run still `running` → normal result with status and "retry later".
- PR-derived text (titles, rationale) is untrusted data returned to the model; it is placed
  only in JSON string fields, never in the description or instructions.

### Tool definitions (`registerTool`, in this order)

| # | name | title | annotations | `_meta` |
|---|---|---|---|---|
| 1 | `devdigest_list_agents` | `list_agents` | readOnly true, openWorld false | — |
| 2 | `devdigest_run_agent_on_pr` | `run_agent_on_pr` | readOnly false, destructive false, idempotent false, openWorld true | `anthropic/requiresUserInteraction: true` |
| 3 | `devdigest_get_findings` | `get_findings` | readOnly true, openWorld false | — |
| 4 | `devdigest_get_conventions` | `get_conventions` | readOnly true, openWorld false | — |
| 5 | `devdigest_get_blast_radius` | `get_blast_radius` | readOnly true, openWorld false | — |

Descriptions (copy verbatim; key info first; each 3–4 sentences):

1. "List the reviewer agents configured in DevDigest with their id, name, model and whether
   they are enabled. Call this first to get a valid agent_id for devdigest_run_agent_on_pr.
   Disabled agents are hidden unless include_disabled is true. Does not return agent prompts
   or past findings."
2. "Run one DevDigest reviewer agent on an imported pull request, wait for it to finish and
   return its verdict and grounded findings. This is the only tool that starts work: it calls
   an LLM, costs money and takes from seconds to a few minutes. Identify the PR by repo (name
   or owner/name) and pr_number, and the agent by agent_id from devdigest_list_agents. If the
   run is still going after the wait limit, it returns run_id and status running; then call
   devdigest_get_findings with that run_id."
3. "Return a concise verdict for an already-finished DevDigest review run: verdict, score,
   counts by severity and the top findings with file and line. Pass run_id, or repo plus
   pr_number (optionally agent_id) for the latest finished run on that PR. Use
   response_format detailed for rationale and suggestions, and min_severity to drop lower
   severities. Does not start a review; use devdigest_run_agent_on_pr for that."
4. "Return the coding conventions DevDigest extracted for a repository (the rules behind the
   repo-conventions skill), each with category and an evidence file:line. Defaults to the
   rules a human accepted; pass status candidate, rejected or all to see the others. Identify
   the repository by name or owner/name. Does not run a new scan."
5. "Planned: the impact map of a pull request (changed symbols and the downstream files that
   depend on them). Not implemented yet: it always returns an error describing the expected
   shape. Use devdigest_get_findings or the DevDigest UI meanwhile."

Server `instructions` (pass as `new McpServer({ name: 'devdigest', version }, { instructions })`):

"DevDigest tools review pull requests that are already imported into the local DevDigest app
(API on localhost:3001). Use them to list reviewer agents, run one agent on a PR and get its
grounded findings, read the verdict of a finished run, and read a repository's accepted coding
conventions. Identify PRs by repo name and PR number; get agent ids from
devdigest_list_agents. Only devdigest_run_agent_on_pr starts work and costs money."

## Work breakdown (ordered)

| # | Package | Module / ring | File (new/edit) | Change | Skills to apply | Test |
|---|---|---|---|---|---|---|
| S1 | server | vendor/shared · 0 | `src/vendor/shared/contracts/review-api.ts` (edit) | add `RunFindings = z.object({ run: RunSummary, review: z.object({ id, verdict: Verdict.nullable(), summary: string.nullable(), score: int.nullable() }).nullable(), findings: z.array(FindingRecord) })` + type; import `RunSummary` from `./trace.js` (check no import cycle: trace.ts must not import review-api.ts) | zod, typescript-expert | S7 |
| S2 | client | vendor copy | `client/src/vendor/shared/contracts/review-api.ts` (edit) | verbatim copy of S1 (`cp`), no hand edit | — | client typecheck; precheck `diff -r` |
| S3 | server | reviews · 3a | `src/modules/reviews/repository/run.repo.ts` (edit) | `findingsForRun(db, workspaceId, runId): Promise<RunFindings \| undefined>`: run row + agent name (same select as `listRunsForPull`, filtered by id + workspace); newest review with `reviews.run_id = runId AND workspace_id`; its findings; map with `findingRowToDto` (`../helpers.js`); undefined when the run is not in the workspace | drizzle-orm-patterns, postgresql-table-design, onion-architecture-backend, security | S7 |
| S4 | server | reviews · 3a | `src/modules/reviews/repository.ts` (edit) | facade `findingsForRun(workspaceId, runId)` delegating to S3 | drizzle-orm-patterns, onion-architecture-backend | S7 |
| S5 | server | reviews · 2 | `src/modules/reviews/service.ts` (edit) | `findingsForRun(workspaceId, runId)`: calls repo, throws `NotFoundError('Run not found')` on undefined; no new imports beyond `RunFindings` type | onion-architecture-backend | S7 |
| S6 | server | reviews · 3b | `src/modules/reviews/routes.ts` (edit) | `GET /runs/:id/findings` with `schema: { params: IdParams, response: { 200: RunFindings } }`, `getContext` first, default rate limit; add the line to the header comment | fastify-best-practices, onion-architecture-backend, security | S7 |
| S7 | server | test | `test/run-findings.it.test.ts` (new) | copy `reviews.it.test.ts` setup (overrides incl. secrets/github/openrouter, `setupRepoAndPr`); POST review → `waitForPrRuns` → GET `/runs/:id/findings` → `RunFindings.parse`, status `done`, 1 finding at line 11, verdict; random uuid → 404 `not_found`; `abc` → 422 | drizzle-orm-patterns | itself |
| S8 | server | docs | `specs/review-flow.md` (edit) | route list line 23 + new invariant after 26 (workspace-scoped, 404, review null while running/failed without review) | — | — |
| M1 | mcp | package | `mcp/package.json` (new), `mcp/package-lock.json` (generated by `npm install`) | name `@devdigest/mcp`, private, `type: module`, `engines.node >=22`; scripts `start: tsx src/index.ts`, `typecheck: tsc --noEmit -p tsconfig.json`, `test: vitest run`, `lint: eslint .`; deps `@modelcontextprotocol/sdk` `1.32.1` exact, `zod ^3.25.0`, `tsx ^4.19.2` (runtime, used by `.mcp.json`); devDeps as reviewer-core (`@eslint/js`, `@types/node ^22`, `eslint`, `globals`, `typescript`, `typescript-eslint`, `vitest ^2.1.8`) | security (supply chain: exact SDK pin) | — |
| M2 | mcp | config | `mcp/tsconfig.json`, `mcp/eslint.config.mjs`, `mcp/vitest.config.ts`, `mcp/.gitignore` (new) | tsconfig = reviewer-core's with `include: ["src/**/*.ts", "test/**/*.ts"]`, `types: ["node"]`, same `paths` (shared + zod); eslint = reviewer-core's + `no-console: ["error", { allow: ["error", "warn"] }]` + `consistent-type-imports` + `no-restricted-imports` (`@devdigest/shared` type-only); vitest node env, `include: test/**/*.test.ts`; .gitignore `node_modules/` | typescript-expert | typecheck/lint |
| M3 | mcp | src | `mcp/src/config.ts` (new) | read `DEVDIGEST_API_URL` (default `http://localhost:3001`, must be http/https URL, trailing slash stripped), `DEVDIGEST_MCP_MAX_WAIT_MS`, `DEVDIGEST_MCP_POLL_MS` (default 3000, min 1000); invalid → throw at startup with a stderr message | security | `format.test.ts` or `config` case in `api-client.test.ts` |
| M4 | mcp | src | `mcp/src/api/client.ts`, `mcp/src/errors.ts` (new) | API client + error mapping + `toToolError` per *Design decisions* | typescript-expert, security | `test/api-client.test.ts`, `test/errors.test.ts` (fake fetch: 2xx, envelope 404/422/429, non-JSON 500, ECONNREFUSED) |
| M5 | mcp | src | `mcp/src/api/resolve.ts` (new) | `resolveRepo`, `resolvePull` per *Design decisions* | security | `test/resolve.test.ts` (name, owner/name, case, ambiguous, unknown, PR missing, null id) |
| M6 | mcp | src | `mcp/src/wait.ts` (new) | `waitForRun({ fetchRun, intervalMs, maxWaitMs, signal, onProgress, sleep, now })` → `{ kind: 'finished', data } \| { kind: 'timeout', last } \| { kind: 'aborted', last }`; 429 back-off | typescript-expert | `test/wait.test.ts` (fake clock: done after 3 polls + 3 progress calls; timeout; abort; 429 then done) |
| M7 | mcp | src | `mcp/src/format.ts` (new) | shapers for agents, findings (concise/detailed, min_severity, caps, truncation), conventions | — | `test/format.test.ts` (no rationale in concise; no system_prompt; severity filter; cap + `omitted`; accepted default) |
| M8 | mcp | src | `mcp/src/tools/list-agents.ts`, `run-agent-on-pr.ts`, `get-findings.ts`, `get-conventions.ts`, `get-blast-radius.ts` (new) | each exports `NAME`, `DESCRIPTION`, and `register(server, deps)` calling `server.registerTool(name, { title, description, inputSchema (zod raw shape), annotations, _meta? }, handler)`; handlers wrap in try/catch → `toToolError`. Blast radius: no input, returns `isError: true` text "devdigest_get_blast_radius is not implemented yet (homework, L04). Expected result shape: { changed_symbols: [...], downstream: [...], summary: string } (BlastRadius in @devdigest/shared contracts/brief.ts)." | zod, security | `test/run-tool.test.ts` (fake fetch end to end through an in-memory client: resolve → POST → polls → findings; fallback; failed run) |
| M9 | mcp | src | `mcp/src/server.ts` (new) | `INSTRUCTIONS` constant; `createServer({ api, config })` builds `McpServer` and registers M8 in the fixed order | typescript-expert | `test/tools-list.test.ts`: `InMemoryTransport.createLinkedPair()` + SDK `Client`; asserts names/order, titles, annotations table, `_meta` only on run tool, no `anthropic/alwaysLoad`, each description < 2,048 chars and 3–4 sentences, instructions < 2,048 chars; calls blast radius → `isError` |
| M10 | mcp | src | `mcp/src/index.ts` (new) | entry: load config, `createApiClient({ fetch: globalThis.fetch })`, `createServer`, `server.connect(new StdioServerTransport())`; log start line and fatal errors with `console.error`; exit 1 on startup failure | security | manual (Verification §3) |
| M11 | repo root | config | `.mcp.json` (new) | `{ "mcpServers": { "devdigest": { "type": "stdio", "command": "${CLAUDE_PROJECT_DIR:-.}/mcp/node_modules/.bin/tsx", "args": ["${CLAUDE_PROJECT_DIR:-.}/mcp/src/index.ts"], "env": { "DEVDIGEST_API_URL": "http://localhost:3001" }, "timeout": 660000 } } }` — no secrets; `${CLAUDE_PROJECT_DIR:-.}` is the documented way to write project-relative paths (see Risks) | security | manual `/mcp` |
| D1 | mcp | docs | `mcp/AGENTS.md`, `mcp/CLAUDE.md` (new) | AGENTS.md in the reviewer-core format: what, commands (npm), layout, conventions (stdout = protocol only; type-only shared imports; one write tool; tool budget: 5 tools, descriptions ≤ 4 sentences; adding a tool updates `tools-list.test.ts`), read-when-relevant; CLAUDE.md = `@AGENTS.md` | — | — |
| D2 | mcp | docs | `mcp/README.md` (new) | setup (`cd mcp && npm ci`, API running via `./scripts/dev.sh`), tools table, env vars, `.mcp.json` entry, approving the project server in `/mcp`, disabling it (`disabledMcpjsonServers` in `.claude/settings.local.json`), `MCP_TIMEOUT` (startup) vs per-server `timeout`, `MAX_MCP_OUTPUT_TOKENS`, troubleshooting (API down, stdout pollution) | — | — |
| D3 | mcp | docs | `mcp/INSIGHTS.md` (new) | header + the seven fixed sections with `_None yet._`, byte-for-byte the layout of `e2e/INSIGHTS.md:1-9` and the headings in `insight.sh:23-34` (see Risks: `insight.sh` cannot target `mcp` yet) | — | — |
| D4 | root | docs | `AGENTS.md` (edit) | Layout table row `mcp/` · `@devdigest/mcp` · "Local stdio MCP server, HTTP client of the API (L04)" · `mcp/AGENTS.md`; package-manager rule adds `mcp/`; Commands line adds `mcp/` to the npm group; Do-not-touch lockfiles add `mcp/package-lock.json`; Naming: packages list adds `mcp` | — | — |
| D5 | root | docs | `README.md` (edit) | L04 row: point to `mcp/README.md` (blast radius still homework) | — | — |

## Contracts & migrations

- Contract changes: new `RunFindings` (+ type) in `server/src/vendor/shared/contracts/review-api.ts`,
  exported through the existing barrel → copied to `client/src/vendor/shared/contracts/review-api.ts`
  in row S2. Name grepped: no existing `RunFindings` in `server/src` or `client/src`.
- Migration: none (read-only query over `agent_runs`, `agents`, `reviews`, `findings`).

## Verification plan

| Package | Commands | Needs Docker |
|---|---|---|
| all touched (server, client) | `bash .claude/skills/pr-self-review/scripts/verify.sh run --with-it` (no `--e2e`: no UI flow changes) | yes |
| mcp (verify.sh does not cover it) | `cd mcp && npm ci && npm run typecheck && npm test && npm run lint` | no |
| server, while building S3–S7 | `cd server && pnpm exec vitest run run-findings.it.test` · `pnpm lint:arch` | yes |
| contract copy | `diff server/src/vendor/shared/contracts/review-api.ts client/src/vendor/shared/contracts/review-api.ts` (empty) | no |

Manual Claude Code checks (paste results into the PR body):

1. Before adding the server (on a checkout without `.mcp.json`, or with the server listed in
   `disabledMcpjsonServers`): start Claude Code in the repo, run `/context all`, note the MCP
   tools and total token lines.
2. `./scripts/dev.sh` running; `cd mcp && npm ci`.
3. With `.mcp.json` enabled: restart Claude Code, approve the project server, run `/mcp` →
   `devdigest` connected, 5 tools listed with titles; the run tool shows as non-read-only.
4. `/context all` again: the delta must be only the deferred tool names + instructions (tool
   search on); record before/after numbers.
5. Smoke: ask for the agents (`devdigest_list_agents`), the accepted conventions of
   `acme/payments-api`, the findings of the latest run on PR #482; then one
   `devdigest_run_agent_on_pr` with a cheap agent and confirm the approval prompt appears and
   progress is shown; stop the API and confirm the `./scripts/dev.sh` error text.

## Risks & open questions

Non-blocking (default taken, flag to the user):

- **`insight.sh` and `pr-self-review` do not know `mcp/`.** `insight.sh` hardcodes
  `MODULES="server client reviewer-core e2e"` (`.claude/skills/engineering-insights/scripts/insight.sh:20`)
  and `precheck.sh:72` / `verify.sh:69` / `route.sh` only route those four packages, and
  `.claude/skills/` is do-not-touch. Default: create `mcp/INSIGHTS.md` with the exact skeleton
  (D3) and run `mcp/` checks explicitly. Question: should a separate, user-approved change add
  `mcp` to `insight.sh` and the pr-self-review scripts? Options: A follow-up change by the user /
  B leave as is.
- **Polling target.** Plan polls the new `GET /runs/:id/findings` (single run, includes status)
  instead of `GET /pulls/:id/runs` from the brief. Brief §5: SSE `GET /runs/:id/events` would
  avoid polling but its replay buffer is in-memory and the route is not workspace-scoped
  (`server/specs/review-flow.md:199-204`). Default: poll every 3 s (20 req/min, under the global
  120/min that the web UI on the same IP also consumes, `server/src/app.ts:99`).
- **Zod reconciliation** (brief §5): resolved by type-only shared imports (see Design decisions).
  If the implementer needs a runtime value from `@devdigest/shared`, stop and ask; do not add a
  runtime alias.
- **`ConventionsService.view` shape** (brief §5): verified, returns `{ scan, candidates }` (all
  statuses) — `server/src/modules/conventions/service.ts:30-37`; filtering happens in the MCP
  package.
- **`.mcp.json` working directory — resolved 2026-10-12.** Claude Code does not document the
  cwd it spawns stdio servers with; its docs recommend `${CLAUDE_PROJECT_DIR:-.}` for
  project-relative paths in a project-scoped `.mcp.json` (the variable is set in the server's
  environment, so the `:-.` default is required). `command` and `args` use that prefix.
- **Read tools have a side effect.** `GET /repos/:id/pulls` syncs from GitHub and upserts PRs
  when a token is configured (`server/src/modules/pulls/routes.ts:42-60`), so `repo`+`pr_number`
  resolution can be slow and touches GitHub. Annotations stay `readOnlyHint: true,
  openWorldHint: false` (idempotent cache refresh); documented in `mcp/README.md`.
- **SDK surface — verified 2026-10-12 against the 1.32.1 typings** (`dist/esm/server/mcp.d.ts:161-168`,
  `dist/esm/inMemory.d.ts`, `dist/esm/shared/protocol.d.ts:189,207`, `dist/esm/server/index.d.ts:15`):
  `registerTool` config accepts `title`, `description`, `inputSchema`, `outputSchema`, `annotations`
  and `_meta`; `InMemoryTransport` is exported from `@modelcontextprotocol/sdk/inMemory.js`; the
  handler `extra` carries `_meta` (with `progressToken`) and `sendNotification`; the `McpServer`
  options accept `instructions`. No fallback needed.
- **Cancel race** (`server/specs/review-flow.md:192-198`): a cancelled run can later flip to
  `done`; the MCP tool reports whatever terminal status it first sees.
- **Tool name prefix**: Claude Code exposes `mcp__devdigest__devdigest_list_agents`; the
  `devdigest_` prefix is kept per brief §4 for other clients.
- **Untrusted text in results**: finding titles/rationale derive from PR content and LLM output
  and reach the calling model; kept in JSON fields only, with length caps.

Blocking: none.

## Handoff to reviewers

- Architecture review focus: S3 mapping rows → DTO inside the driven ring (no row types into
  `service.ts` beyond the existing baseline), S6 route schema with `response`, `pnpm lint:arch`
  unchanged baseline, client contract copy identical; `mcp/` imports of `@devdigest/shared`
  type-only, no `server/` runtime import, tool registration order fixed, no stdout writes.
- Security review focus: `findingsForRun` workspace scoping (unlike `getRunTrace`); IdParams
  uuid validation; `mcp/src/config.ts` URL validation; no secret accepted or read; the run tool
  is the only non-read-only tool and carries `requiresUserInteraction`; error texts never echo
  request bodies or env; untrusted finding text capped and confined to JSON fields;
  `@modelcontextprotocol/sdk` pinned exactly, lockfile generated by npm.
