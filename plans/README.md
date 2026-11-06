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
