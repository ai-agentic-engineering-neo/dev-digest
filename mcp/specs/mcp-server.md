# MCP server (L04) — `@devdigest/mcp`

A local stdio MCP server that lets an MCP client (Claude Code) list reviewer
agents, run one on an imported PR, and read verdicts, findings and conventions.
This file owns the tool contract, the run-and-wait behaviour, id resolution,
result shaping, error mapping and configuration. How the package is put
together and why: [`../docs/architecture.md`](../docs/architecture.md). Setup
and troubleshooting: [`../README.md`](../README.md). The one API route it
added, `GET /runs/:id/findings`, is specified in
[`server/specs/review-flow.md`](../../server/specs/review-flow.md) (route list
and invariant 26a). There is no client half.

Status: **implemented 2026-10-12**. Manual check in Claude Code (`/mcp`,
`/context all`, approval prompt) is pending.

## Tools

Registered in this fixed order by `src/server.ts` `createServer`. Each tool is
one file in `src/tools/` exporting `NAME`, `TITLE`, `DESCRIPTION`, `register`.
`title` is the bare name without the `devdigest_` prefix.

| Tool | Title | Annotations | `_meta` |
|---|---|---|---|
| `devdigest_list_agents` | `list_agents` | `readOnlyHint: true`, `openWorldHint: false` | none |
| `devdigest_run_agent_on_pr` | `run_agent_on_pr` | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: true` | `anthropic/requiresUserInteraction: true` |
| `devdigest_get_findings` | `get_findings` | `readOnlyHint: true`, `openWorldHint: false` | none |
| `devdigest_get_conventions` | `get_conventions` | `readOnlyHint: true`, `openWorldHint: false` | none |
| `devdigest_get_blast_radius` | `get_blast_radius` | `readOnlyHint: true`, `openWorldHint: false` | none |

`devdigest_run_agent_on_pr` is the only write tool and the only one with
`requiresUserInteraction`, so the client asks for approval on every call. No
tool sets `anthropic/alwaysLoad`.

### Inputs

| Tool | Field | Type | Default |
|---|---|---|---|
| `list_agents` | `include_disabled` | boolean | `false` |
| `run_agent_on_pr` | `repo` | string, min 1 (name or `owner/name`) | required |
| | `pr_number` | positive integer | required |
| | `agent_id` | uuid | required |
| | `response_format` | `concise` · `detailed` | `concise` |
| | `min_severity` | `CRITICAL` · `WARNING` · `SUGGESTION` | `SUGGESTION` |
| `get_findings` | `run_id` | uuid, optional | none |
| | `repo`, `pr_number` | as above, optional (used when `run_id` is absent) | none |
| | `agent_id` | uuid, optional (filters the runs considered) | none |
| | `response_format`, `min_severity` | as above | `concise`, `SUGGESTION` |
| `get_conventions` | `repo` | string, min 1 | required |
| | `status` | `accepted` · `candidate` · `rejected` · `all` | `accepted` |
| `get_blast_radius` | `repo` | string, min 1 | required |
| | `pr_number` | positive integer | required |

### Outputs

Every result is one text content block holding compact JSON (`toToolResult`).
Failures are `isError: true` with a plain-text message (see Error mapping).

| Tool | Payload |
|---|---|
| `list_agents` | `{ agents: [{ id, name, description (max 200 chars), provider, model, enabled, strategy, skill_count, runs }] }`. Disabled agents are dropped unless `include_disabled`. Prompts are never returned. |
| `run_agent_on_pr` | Finished run: the findings payload below. Still running after the max wait: `{ run_id, agent_name, status: 'running', elapsed_s, next }`. |
| `get_findings` | Finished run: the findings payload. Run still `running`: `{ run_id, status: 'running', next }`. |
| `get_conventions` | `{ repo, scan: { status, finished_at, model } or null, rules: [{ category, rule, evidence: 'path:line', confidence }], counts_by_status }`, plus a `note` when `status` is `accepted` and there are no accepted rules. |
| `get_blast_radius` | `{ repo, pr_number, summary (max 300 chars), degraded, reason, changed_symbols (max 60), changed_symbols_total, downstream (max 20): [{ symbol, callers_total, callers (max 10): [{ name, file, line }], endpoints_affected, crons_affected }], downstream_total, history (max 5): [{ pr_number, title (max 120 chars), author, merged_at, files_overlap (max 10), files_overlap_total, notes (max 200 chars) }] }`, plus a reason-specific `note` when the map is degraded and empty (rebuild advice for index reasons; `flag_off` and `repo_too_large` say a rebuild will not help). Served by `GET /pulls/:id/blast` (`BlastRadiusResponse`); never a model call. |

Findings payload (`format.ts` `shapeFindings`): `{ run_id, agent_name, status,
verdict, score, summary (max 300 chars), counts { critical, warning, suggestion },
blockers, cost_usd, findings, omitted, truncated? }`. `verdict` is `null` when
the run has no review. `counts` is over all findings, before `min_severity`.

## Run and wait (`devdigest_run_agent_on_pr`)

1. Resolve `repo`, then `pr_number` (next section).
2. `POST /pulls/:id/review` with `{ agentId }`. The first entry of the response
   `runs` is the target. No entry is an error: "The API did not start a run".
3. `waitForRun` (`src/wait.ts`) polls `GET /runs/:id/findings` every
   `DEVDIGEST_MCP_POLL_MS` until `run.status` is no longer `running` or the max
   wait passes. The first poll is immediate.
4. After each poll that is still `running`, if the client sent a
   `progressToken`, the tool sends `notifications/progress` with
   `progress` = elapsed seconds and message `"<agent> on <owner/name>#<n>:
   running, <s>s"`. A failed notification is ignored. Without a token nothing
   is sent.
5. Outcomes:
   - `done`: the findings payload.
   - `failed` or `cancelled`: an error result, `"Run <id> <status>:
     <run.error or 'no error recorded'>. Check the API log or retry; run_id <id>."`
     (`run-result.ts` `terminalRunPayload`, shared with `get_findings`).
   - max wait reached (`DEVDIGEST_MCP_MAX_WAIT_MS`): not an error; the
     `running` payload above, with `next` pointing to `devdigest_get_findings`.
   - client abort (`extra.signal`): polling stops and the call is cancelled.
6. A 429 during polling does not fail the call: the next pause is the
   `Retry-After` seconds, or 10 s when absent, and the max wait still applies.
   Any other API error propagates as a tool error.

`get_findings` with `repo` + `pr_number` resolves the PR, lists
`GET /pulls/:id/runs`, optionally filters by `agent_id`, and takes the first
(newest) run whose status is not `running`. If only a running run exists it
returns `{ run_id, status: 'running', next }`; if none exists it returns an
error telling the caller to start one. With neither `run_id` nor
`repo` + `pr_number` it returns "Missing target" with an example.

## Id resolution (`src/api/resolve.ts`)

| Rule | Behaviour |
|---|---|
| Repo | `GET /repos`. A value containing `/` matches `full_name`, otherwise `name`; both case-insensitive, trimmed. |
| Repo ambiguous | Several matches: error `Repository "<x>" is ambiguous, use owner/name. Matches: …`. |
| Repo unknown | Error `Repository "<x>" is not imported in DevDigest. Known repositories: …` with at most 10 names, or `none`. |
| PR | `GET /repos/:id/pulls`, matched on `number`; the internal `id` is used afterwards. |
| PR unknown | Error `PR #<n> was not found in this repository. Open PRs: #<n> <title>; …`. Candidates are open PRs only (not `closed` or `merged`), at most 10, or `none`. |

`GET /repos/:id/pulls` may sync from GitHub when a token is configured, so
resolution can be slow. The tools are still annotated read-only.

## Result shaping (`src/format.ts`)

| Rule | Value |
|---|---|
| Order | Severity (CRITICAL, WARNING, SUGGESTION) then confidence, both descending. |
| `min_severity` | Findings below the floor are dropped from `findings` but still counted in `counts`. |
| Cap | `concise`: 15 findings. `detailed`: 50. |
| `omitted` | total findings minus findings returned, so it covers both the severity filter and the cap. |
| Concise item | `severity, category, title, file, line`. |
| Detailed item | adds `id, end_line, confidence, rationale, suggestion`; `rationale` and `suggestion` clipped to 800 chars. |
| Truncation | If the JSON text exceeds 40 000 chars, findings are cut 5 at a time until it fits and `truncated: true` is set. |
| Conventions | Filtered by `status`; `all` keeps every row. |

PR titles, finding titles and rationale are untrusted text. They appear only
as JSON string values, never in a tool description or in the server
instructions.

## Error mapping

`src/api/client.ts` turns every failure into an `ApiError`; `src/errors.ts`
`toToolError` turns errors into `{ isError: true, content: [text] }`. Handlers
never throw.

| Case | Text |
|---|---|
| API unreachable (fetch rejects) | `DevDigest API is not reachable at <url>. Start it with ./scripts/dev.sh (or set DEVDIGEST_API_URL).` |
| No answer within 15 s | `DevDigest API at <url> did not answer within 15s.` |
| 404 with error envelope | `Not found: <message>` |
| 422 with error envelope | `Invalid input: <message> (<details, max 300 chars>)` |
| 429 | `Rate limited by the DevDigest API (POST /pulls/:id/review allows 10/min; global 120/min), retry in <n>s.` (`retry in a minute` without `Retry-After`) |
| Other envelope error | `<message> (<code>)` |
| Non-envelope error body | `DevDigest API returned HTTP <status>: <first 200 chars of body>` |
| 2xx but not JSON | `DevDigest API returned non-JSON for <METHOD> <path>: <first 200 chars>` |
| `UserError` (resolution, failed run, missing target) | its message as written |
| Client abort | `The call was cancelled.` |
| Anything else | `Unexpected error: <message>. Check the MCP server stderr log.` |

Environment values and request bodies are never echoed.

## Configuration (`src/config.ts`)

| Variable | Default | Rule |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Must parse as an `http:` or `https:` URL; trailing slashes stripped. Invalid value: startup fails with a message on stderr, exit 1. |
| `DEVDIGEST_MCP_MAX_WAIT_MS` | `300000` | Positive integer, clamped to 10 000..600 000. |
| `DEVDIGEST_MCP_POLL_MS` | `3000` | Positive integer, minimum 1 000. |

A non-integer or non-positive value of the two numeric variables fails startup
the same way. There are no secrets and no auth: the local API has none.

`.mcp.json` at the repo root registers one stdio server, `devdigest`:
`command` `${CLAUDE_PROJECT_DIR:-.}/mcp/node_modules/.bin/tsx`, `args`
`${CLAUDE_PROJECT_DIR:-.}/mcp/src/index.ts`, `env.DEVDIGEST_API_URL`
`http://localhost:3001`, `timeout` 660000 (above the 600 000 ms maximum wait, so the
`running` fallback result reaches the client before its timeout). It runs `tsx` directly rather than
`npm run`, because npm banners would write to stdout, which is the protocol
channel. The `:-.` default is there because `CLAUDE_PROJECT_DIR` is set only in
the spawned server's environment.

## Startup token cost

What an MCP client loads at session start is paid on every session, so the
package keeps it small. Checked by `test/tools-list.test.ts`.

| Rule | Value |
|---|---|
| Tool count | five |
| Order | fixed (registration order in `createServer`), so `tools/list` is deterministic |
| Server `instructions` | `INSTRUCTIONS` in `src/server.ts`, at most 4 sentences, under 2 048 characters |
| Tool descriptions | 3-4 sentences each, under 2 048 characters |
| `anthropic/alwaysLoad` | never set |
| Untrusted text | never in descriptions or instructions |

## Invariants

1. Stdout carries only protocol. Logs use `console.error`; ESLint forbids `console.log`. Enforced by `eslint.config.mjs` and `src/index.ts`.
2. `@devdigest/shared` is imported with `import type` only, so no second zod instance loads at runtime. Enforced by lint.
3. Exactly one tool writes: `devdigest_run_agent_on_pr`. Checked by `test/tools-list.test.ts`.
4. A tool handler never throws; every failure is `isError: true`. Enforced by the `try/catch` in each `register` and `toToolError`.
5. A run that outlives the max wait is a normal result with `status: 'running'` and a `run_id`, not an error.
6. Agent prompts are never returned.

## Out of scope

- Rebuilding the repo index from the MCP server. A degraded blast radius says
  so in `reason` and `note`; the resync lives in the DevDigest UI
  (`POST /repos/:id/resync`).
- No HTTP or SSE transport; stdio only.
- No authentication and no multi-workspace support: the API has no auth in
  local mode.
- No tool to import repos, run conventions scans, or accept findings.
