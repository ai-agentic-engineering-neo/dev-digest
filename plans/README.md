# plans

Development Plans — **how and in what order** a feature is built (tasks, file ownership, waves,
verification). `<pkg>/specs/` stays the source of **what** to build; a plan links to its specs.

- Written by the `planner` agent from [TEMPLATE.md](TEMPLATE.md) as `plans/<feature-kebab>.md`.
- Executed with `/implement-plan plans/<feature>.md`: wave by wave, one `implementer-backend` /
  `implementer-frontend` per task, gate after each wave.
- Plan lifecycle: `draft` → user sets `approved` → `in progress` → `done`.
  Task lifecycle: `todo` → `done` | `blocked: <reason>` (written by `/implement-plan`, not by implementers).

## Verify commands (single source — planner copies from here, /implement-plan runs them)

On Windows `pnpm <script>` can fail with "Access is denied" — call bins via node. Run inside the package.

| Package | Typecheck | Unit tests | Extra |
|---|---|---|---|
| `server/` (pnpm) | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | `node node_modules/vitest/vitest.mjs run <file>` · all: `… run --exclude '**/*.it.test.ts'` | layers: `node scripts/check-architecture.mjs` · DB tests `*.it.test.ts` need Docker: `… run .it.test` |
| `client/` (pnpm) | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | `node node_modules/vitest/vitest.mjs run <file>` | — |
| `reviewer-core/` (npm) | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | `node node_modules/vitest/vitest.mjs run <file>` | any change ⇒ also server unit tests |
| `e2e/` (npm) | — | `npm run e2e:hermetic` (isolated stack; slow — integration wave only) | — |

## Plans

<!-- - [feature.md](feature.md) — one line: what it builds -->
- [review-and-docs-agents.md](review-and-docs-agents.md) — in progress (W3 smoke run left) · four subagents (`test-writer`, `architecture-reviewer`, `plan-verifier`, `doc-writer`) with write/Bash-scope hooks + `/implement-plan` Finish gate; executed by the main session
- [multi-agent-review.md](multi-agent-review.md) — done · `/repos/:repoId/multi-agent` (parallel per-agent runs, Columns/Tabs, client-side conflicts, AgentBadge, FindingCard/RunTraceDrawer promoted) + `GET /agents/run-estimates`; 13 tasks in 5 waves
- [intent-layer.md](intent-layer.md) — in progress (all 12 tasks done; e2e flow 09 pending CI) · L03 Intent Layer: new `modules/intent` (source gathering, one cheap `review_intent` call, deterministic confidence, `pr_intent` cache + override via generated migration 0015, `/pulls/:id/intent` routes), reviewer-core `intent` prompt slot, executor pre-work + trace line, Overview intent card, e2e flow 09; 12 tasks in 5 waves
- [intent-reliability.md](intent-reliability.md) — approved · server-only Intent Layer hardening: true single-flight + 60 s negative cache per (head_sha, input_hash) in `IntentService`, one structured pino record per intent step (`cache`, `latencyMs`, `costUsd`, `reason`), rate limit on `PUT /pulls/:id/intent`, 429 → `rate_limited` at warn, `parseIntentSources` unit test; 5 tasks in 3 waves (W1 parallel), no migration, no client change
- [mcp-server.md](mcp-server.md) — done · audit + fixes of the existing stdio MCP server (5 tools): compliance matrix, reviewer-core `DEFAULT_REVIEW_MAX_TOKENS` (402 fix), `run_agent_on_pr` reuses an active run / coerces `pr` / next-step errors, progress+cancel+stdio smoke tests, `get_conventions` cap, mcp-server CLAUDE.md/INSIGHTS.md, `.mcp.json` via local tsx; 6 tasks in 3 waves, no server change
- [blast-radius.md](blast-radius.md) — done (P1; optional P3 T11 skipped; e2e flow 11 pending CI) · L05 Blast Radius: W0 = depgraph Windows POSIX-path fix (D1) + facade per-symbol caller cap / `viaFile` (D2) + module-local `BlastRadiusResponse` contract + client mirror/hook/i18n; new `modules/blast` (`GET /pulls/:id/blast`, pure mapping + honest degraded reason from index state), Overview "Blast radius" panel (summary, callers `file:line` → GitHub, endpoint/cron chips, degraded + Resync), real MCP `get_blast_radius` over the same route, e2e flow 11, optional P3 tree/graph; 12 tasks in 5 waves, no migration
