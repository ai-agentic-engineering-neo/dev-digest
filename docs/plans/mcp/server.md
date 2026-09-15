# Plan: `mcp-server/` — local MCP server for DevDigest

Branch: `feat/LAB4-mcp-servers`. Status: implemented per this plan (see repo
`mcp-server/` once it lands). This file is the durable design record; update
it if the shipped shape drifts from what's below rather than letting it rot.

## Goal

A new top-level package `mcp-server/` (sibling to `server/`, `client/`,
`reviewer-core/`, `e2e/`) exposing exactly 5 MCP tools over **stdio**
transport, each a thin, result-shaping wrapper around the existing Fastify
API at `http://localhost:3001`. No auth — a stdio-spawned local subprocess is
a trusted caller, and the backend it talks to is itself localhost-only.

## The 5 tools

1. **`list_agents`** — which reviewer-agents are configured. The `id` field
   returned here is what `run_agent_on_pr`'s `agent` argument expects.
2. **`run_agent_on_pr(repo, pr, agent)`** — the only write/mutating tool.
   Flat primitive args. Composite: starts a review run, polls (bounded), and
   returns the finished findings in one call — the caller never orchestrates
   raw API calls itself.
3. **`get_findings(repo, pr, run_id?)`** — compact `{verdict, findings[]}`
   for an already-completed run. Not a trigger.
4. **`get_conventions(repo)`** — repo conventions (same feature as L02).
5. **`get_blast_radius(repo, pr)`** — **intentional stub**. Real
   implementation is later homework. Never touches the network; always
   returns `isError: true` with a "not implemented, don't retry, don't infer"
   message.

## Design principles (apply to every tool)

- **Result, not operation** — return the outcome, not force the caller to
  sequence multiple raw calls (`run_agent_on_pr` embodies this).
- **Flat arguments** — every input schema is flat top-level primitives, never
  a nested object. Nested args measurably increase model tool-calling errors.
- **Concise structured responses** — only the fields the agent needs, never a
  raw forward of the backend JSON. Caps token cost per call.
- **Errors that lead forward** — every error names the recovery action
  ("agent not found — call list_agents") instead of a bare 404/exception, so
  the calling agent can self-correct on its next turn instead of stalling.

## Architecture decisions

- **Package location**: new top-level `mcp-server/`, own `package.json`,
  **npm** (not pnpm) — matches the existing `reviewer-core/`/`e2e/`
  convention that this is "not a monorepo workspace." `mcp-server` is a
  runnable process (unlike `reviewer-core`, consumed as source and never
  emitting JS), so its `build` script is a real `tsc` emit, not a
  typecheck-only alias.
- **Auth**: none. Validate all tool inputs with zod regardless — arguments
  are LLM-generated and shaped by conversation content (e.g. a reviewed PR's
  diff), not just the trusted process boundary.
- **SDK**: `@modelcontextprotocol/sdk` (pinned `^1.30.0`), `McpServer` +
  `registerTool` (the older `server.tool()` is deprecated), `zod@^3.25.76`
  (SDK's peer range is `^3.25 || ^4.0`; repo convention elsewhere pins
  `^3.24.1`, below that floor — `mcp-server` needs its own newer 3.x, no
  cross-package effect since it's a separate `node_modules`).
- **Tool errors**: MCP's `isError: true` result-content pattern for
  tool-level failures (missing agent, run not found, stub), never a
  protocol-level JSON-RPC error, which reads to the agent as "the tool itself
  is broken."
- **Transport discovery**: `.mcp.json` at repo root (checked into git,
  project-scoped) — `{"mcpServers":{"devdigest":{"type":"stdio","command":"node","args":["mcp-server/dist/index.js"],"env":{"API_BASE_URL":"http://localhost:3001"}}}}`.
  Points at the **built** entry point — Claude Code re-spawns the process per
  session, so `.mcp.json` must not depend on `tsx` being available globally.
- **Bounded polling, not SSE**, for `run_agent_on_pr`: the composite tool
  needs a hard client-safe timeout regardless (MCP clients enforce their own
  tool-call budget, commonly reported ~7-10s implicit), so holding an SSE
  connection open inside the handler would need the same bail-out timer for
  no benefit, plus stream-lifecycle complexity a `GET` poll doesn't have.
  `POLL_INTERVAL_MS=1000`, `POLL_MAX_MS=8000` (env-overridable). Hitting the
  "still running" branch is the **expected common case** (a real review
  routinely takes longer than 8s), not an edge case.
- **CI**: out of scope for this lab. No `.github/workflows/mcp-server.yml`
  yet — revisit if/when this package gets a PR-gating flow like the other
  four.

## Confirmed backend facts that shape the design

- **`POST /pulls/:id/review` is fire-and-forget.** Its own contract doc
  comment (`server/src/vendor/shared/contracts/review-api.ts`, on
  `ReviewRunResponse`) says "the (synchronous) run completes" — that's
  **stale**. `ReviewService.runReview` (`server/src/modules/reviews/service.ts`)
  does `void this.executor.executeRuns(...).catch(...)` and returns
  `{ runs, reviews: [] }` immediately; `reviews` is always empty on this
  response. `run_agent_on_pr` must poll; it cannot trust the POST response to
  carry findings. (Recorded as an insight — see Definition of done.)
- **No endpoint reads a run by `run_id` alone.** `GET /pulls/:id/runs` (→
  `RunSummary[]`, `status: running|done|failed|cancelled`) and
  `GET /pulls/:id/reviews` (→ `ReviewRecord[]`, each carrying `run_id`) are
  both PR-scoped. `get_findings` therefore takes `{repo, pr, run_id?}` (all
  flat), not `run_id` alone.
- **No lookup-by-name endpoint** for repos or PRs — `GET /repos` and
  `GET /repos/:id/pulls` are the only list reads. `resolve.ts` does the
  owner/name → id and PR-number → id matching client-side; the caller passes
  `"acme/payments-api"` + `482`, never a uuid (another instance of "result,
  not operation").
- **`get_blast_radius`'s real logic already exists** server-side
  (`repoIntel.getBlastRadius()` in `server/src/modules/repo-intel/service.ts`)
  but has **no HTTP route**. Wrapping it for real is a new server endpoint —
  explicitly out of scope here; the tool stays a pure stub.

## Confirmed contract shapes (from `@devdigest/shared`)

- `Agent` — `id, name, description, provider, model, system_prompt,
  output_schema, enabled, version, strategy, ci_fail_on, repo_intel`
  (`contracts/knowledge.ts`).
- `Repo` — `id, workspace_id, owner, name, full_name, default_branch,
  clone_path, last_polled_at, created_by` (`contracts/platform.ts`).
- `PrMeta` — `id, number, title, author, branch, base, head_sha, additions,
  deletions, files_count, status, opened_at, updated_at, score, cost_usd,
  findings` (`contracts/platform.ts`).
- `ReviewRunResponse` — `pr_id, runs: ReviewRunTarget[], reviews:
  ReviewRecord[]`; `ReviewRunTarget` — `run_id, agent_id, agent_name`
  (`contracts/review-api.ts`).
- `RunSummary` — `run_id, agent_id, agent_name, provider, model, status,
  error, duration_ms, tokens_in, tokens_out, cost_usd, findings_count,
  grounding, ran_at` (`contracts/trace.ts`).
- `ReviewRecord` — `id, pr_id, agent_id, run_id, agent_name, kind, verdict,
  summary, score, model, grounding, created_at, findings: FindingRecord[]`;
  `FindingRecord` = `Finding` + `review_id, accepted_at, dismissed_at`
  (`contracts/review-api.ts`, `contracts/findings.ts`).
- `Finding` — `id, severity, category, title, file, start_line, end_line,
  rationale, suggestion, confidence, kind, trifecta_components, evidence`
  (`contracts/findings.ts`).
- `ConventionCandidate` — `id, category, rule, evidence_path,
  evidence_line_start, evidence_line_end, evidence_snippet, confidence,
  accepted`; `ConventionScan` — `repo_id, sample_file_count, candidate_count,
  scanned_at, pull_number` (`contracts/knowledge.ts`).
- API errors: `AppError` taxonomy in `server/src/platform/errors.ts` →
  `{error:{code,message,details}}`, `code` ∈
  `not_found|validation_error|external_service_error|config_error|...`,
  status ∈ `404|422|502|500|...`.

Per the decision to keep `mcp-server` a genuinely standalone package (not
tsconfig-aliasing into `server/src/vendor/shared` the way `reviewer-core`
does), these shapes are **hand-mirrored** into `mcp-server/src/types.ts`,
trimmed to only the fields each tool needs. This is a third hand-copy of the
same contracts (`client/src/vendor/shared/` is the second, already
documented in root `INSIGHTS.md` as lagging by 5 files) — accepted
deliberately for this lab, flagged as a recurring drift risk, not a novel one.

## Build steps (dependency order)

**Batch 0 — sequential:**
1. Package scaffolding (`package.json`, `tsconfig.json`, `.gitignore`).
2. `types.ts` (hand-mirrored trimmed shapes) + `client.ts` (`ApiClient`
   interface, `FetchApiClient`, typed `ApiCallError`).
3. `resolve.ts` — `resolveRepo`/`resolvePr`, error messages that name the
   next action.
4. `shape.ts` — `shapeReviewRecord` (trim + sort + cap 50 findings +
   `truncated`), `shapeRunStatus` (shared wording for running/failed/
   cancelled, reused by both `get_findings` and `run_agent_on_pr`).

**Batch 1 — independent tool files (no shared-file overlap):**
5. `list_agents`
6. `get_conventions`
7. `get_blast_radius` (stub — zero network calls)
8. `get_findings`

**Batch 2 — sequential:**
9. `run_agent_on_pr` (composite, write, bounded poll, reuses step 4's
   `shapeReviewRecord`).

**Batch 3 — sequential:**
10. `tools/index.ts` (central registration) + `src/index.ts` (entry point;
    stdio hygiene — nothing but the MCP protocol writes to stdout, all
    diagnostics go to stderr).
11. `.mcp.json` + `mcp-server/README.md`.

**Batch 4:**
12. Consolidating hermetic tests for `client`/`resolve`/`shape` (no network
    access; mirrors `TESTING.md`'s "mock the outside world" philosophy — this
    package has no DB-backed `.it.test.ts` tier, everything is HTTP and HTTP
    is what's mocked).

## Definition of done

- `cd mcp-server && npm run typecheck && npm test && npm run build` all
  green.
- Manual smoke test against a running `./scripts/dev.sh` stack covering all
  5 tools, including the stub's `isError: true` response and
  `run_agent_on_pr`'s timeout branch.
- `pr-self-review` before opening a PR.
- `engineering-insights` recording (a) the stale `ReviewRunResponse` doc
  comment vs. actual fire-and-forget behavior, and (b) the third hand-copy
  drift risk, tied to the existing root `INSIGHTS.md` entry about the
  client's copy.

## Open items (not blocking, revisit later)

- `POLL_INTERVAL_MS`/`POLL_MAX_MS` defaults are this plan's proposal, not a
  value anyone benchmarked — fine to tune after real usage.
- Exact `registerTool` input-schema shape (`ZodRawShape` vs. wrapped
  `z.object(...)`) verified against the installed SDK version at
  implementation time, not guessed from memory.
- No CI workflow for `mcp-server/` yet (explicit decision, see above).
