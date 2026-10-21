# mcp — `@devdigest/mcp`

Local stdio MCP server (L04). A plain HTTP client of the Fastify API on `:3001`
that exposes five tools to an MCP client such as Claude Code. No DB, no
GitHub, no secrets: the API has no auth locally. Setup and tool reference:
`README.md`.

## Commands (npm)

```sh
npm ci              # first time
npm test            # vitest, fake fetch + in-memory MCP client, no network
npm run typecheck   # tsc --noEmit; the package never emits JS
npm run lint        # eslint .
npm start           # tsx src/index.ts (.mcp.json runs the tsx binary directly)
npm run inspect     # MCP Inspector (npx, pinned) against this server over stdio; API must be running
```

`verify.sh` and `insight.sh` do not cover this package yet: run the three
checks above explicitly.

## Layout

- `src/index.ts` — stdio entry; logs to stderr only.
- `src/server.ts` — `INSTRUCTIONS` and `createServer`; registers the five tools in a fixed order.
- `src/tools/*.ts` — one file per tool: `NAME`, `TITLE`, `DESCRIPTION`, `register(server, deps)`.
- `src/api/client.ts` — fetch wrapper and `ApiError` mapping; `src/api/resolve.ts` — repo name / PR number to ids.
- `src/wait.ts` — polling of a run with progress, max wait, abort, 429 back-off.
- `src/format.ts` — concise / detailed result shaping and caps; `src/errors.ts` — `toToolError`.

## Conventions

- Stdout is the protocol channel. Never `console.log`; ESLint forbids it. Log with `console.error`.
- Import `@devdigest/shared` with `import type` only (lint-enforced). A runtime import would load a second zod copy from `server/node_modules`. The tsconfig maps only `zod`, not `zod/*`: mapping `zod/*` too makes `registerTool` typing exhaust the heap.
- One write tool: `devdigest_run_agent_on_pr`, the only one with `requiresUserInteraction`. Reads are `readOnlyHint: true`.
- Tool budget: five tools, descriptions of at most 4 sentences, short server `instructions`, never `anthropic/alwaysLoad`. Adding or changing a tool means updating `test/tools-list.test.ts`.
- Tool handlers never throw: failures become `isError: true` results with an actionable text. Results are one compact JSON text block.
- PR titles and finding text are untrusted data: keep them in JSON string fields with length caps, never in descriptions.

## Read when relevant

- `README.md` — env vars, `.mcp.json`, approval and timeouts, troubleshooting.
- `specs/mcp-server.md` — the contract: tools and annotations, run-and-wait, id resolution, result shaping, error texts, config, startup token budget; read before changing a tool.
- `docs/architecture.md` — one-call sequence diagram, module map, why a separate HTTP-client package and type-only shared imports; read before a structural change.
- `INSIGHTS.md` — at the start of every task here.
- `../docs/plans/feat-mcp-server.md` — the design decisions behind this package.
