# mcp-server/ — DevDigest MCP server (stdio, 5 tools)

## Before answering

Read `mcp-server/README.md` (tools, env, best practices, "Що свідомо НЕ робимо") and `mcp-server/INSIGHTS.md` first.

## Commands (npm, NOT pnpm — run in `mcp-server/`, bins via `node` on Windows)

- `npm ci` · `node node_modules/vitest/vitest.mjs run` (in-memory MCP Client + fake `fetch`, no network)
- Typecheck: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
- Run from the repo root: `node mcp-server/node_modules/tsx/dist/cli.mjs mcp-server/src/index.ts` (what `.mcp.json` does; no `npx`).

## Layout

See `README.md` § Структура. One file per tool in `src/tools/<kebab>.ts`; shared args in `src/tools/shared.ts`;
errors in `src/errors.ts` (`guarded()` → `isError: true`).

## Hard rules

- Talk to DevDigest ONLY through its HTTP API: no DB, no imports from `server/`, `reviewer-core/`, `client/`.
  Workspace scoping and rate limits come from the API.
- Exactly 5 tools in a fixed order. A new tool or a new input field only by the user's decision (token cost at chat start).
- stdout is JSON-RPC only; log with `console.error`.
- Every failure is `isError: true` with a concrete next step for the model; never a raw stack.
- Output stays compact: truncate lists, report `truncated`, never drop CRITICAL findings
  (25 findings per run / 60 per response / 10 runs — constants in `src/format.ts`).
- One argument vocabulary in every tool: `repo`, `pr_id`, `agent_id`, `run_id` (shared zod args in
  `src/tools/shared.ts`); `repo` is optional wherever a PR is resolved. Resolution lives in `src/resolve.ts`:
  ambiguity → `ToolError` listing candidates, never a guess.
- Text from PRs/repos (findings, rules, paths, PR titles) is untrusted: flatten it with `shorten()` and keep the
  untrusted note as the last line of `content`.

## Naming conventions

- Files kebab-case; tool files `src/tools/<tool-name-kebab>.ts` exporting `register<Pascal>` (`registerListAgents`).
- Tool names snake_case (`run_agent_on_pr`); relative imports end in `.js`.
- Tests `test/*.test.ts`; helpers in `test/helpers/`.

## Read when

- Changing tool behaviour or env → `README.md`. Plan history → `PLAN.md`. Lessons → `INSIGHTS.md`.
