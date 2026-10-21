# DevDigest MCP server (`devdigest-mcp`)

A local stdio [MCP](https://modelcontextprotocol.io) server that lets an MCP client
(Claude Code) review pull requests through the DevDigest API. It is an HTTP client of the
Fastify API on `:3001`; it adds one route there, `GET /runs/:id/findings`.

## Setup

```sh
./scripts/dev.sh          # API on :3001 (Postgres, migrate, seed)
cd mcp && npm ci
```

The repo-root `.mcp.json` registers the server as `devdigest` (project scope, stdio,
`${CLAUDE_PROJECT_DIR:-.}/mcp/node_modules/.bin/tsx ${CLAUDE_PROJECT_DIR:-.}/mcp/src/index.ts`).
`${CLAUDE_PROJECT_DIR:-.}` is how Claude Code's docs spell a project-relative path in a
project-scoped `.mcp.json` (the variable exists only in the spawned server's environment, so
the `:-.` default is needed). It calls `tsx` directly instead of `npm run`, because npm
banners would pollute stdout. Open Claude Code in the repo root,
approve the project server, then check that `/mcp` shows `devdigest` connected with 5 tools.

To poke at the server outside Claude Code, run the MCP Inspector against it (the API must
be up; the Inspector is fetched by `npx` at a pinned version, not installed as a dependency):

```sh
cd mcp && npm run inspect     # opens the Inspector UI; List Tools → call devdigest_list_agents
```
To turn it off, add `devdigest` to `disabledMcpjsonServers` in your local Claude Code settings.

## Tools

| Tool | Title | Kind | What it does |
|---|---|---|---|
| `devdigest_list_agents` | `list_agents` | read | Agents with id, name, model, enabled (never the prompt) |
| `devdigest_run_agent_on_pr` | `run_agent_on_pr` | **write** | Runs one agent on a PR, waits, returns verdict + findings. Asks for approval every time |
| `devdigest_get_findings` | `get_findings` | read | Verdict and findings of a finished run (by `run_id`, or `repo` + `pr_number`) |
| `devdigest_get_conventions` | `get_conventions` | read | A repo's conventions; accepted rules by default |
| `devdigest_get_blast_radius` | `get_blast_radius` | read | A PR's impact map from the repo index: changed symbols, callers, endpoints, crons, prior PRs on the same files (`repo` + `pr_number`) |

`repo` is a name or `owner/name`; `pr_number` is resolved to the internal id. The findings tools take
`response_format` (`concise` default, `detailed`) and `min_severity`.

Reads that take `repo` + `pr_number` call `GET /repos/:id/pulls`, which syncs from GitHub when a
token is configured, so they can be slow. They are still annotated read-only (a cache refresh).

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | API base URL (http/https) |
| `DEVDIGEST_MCP_MAX_WAIT_MS` | `300000` | Max wait of `run_agent_on_pr` (clamped 10s to 600s); then returns `run_id` + `running` |
| `DEVDIGEST_MCP_POLL_MS` | `3000` | Poll interval (min 1000) |

Claude Code side: `MCP_TIMEOUT` is the server startup timeout; the per-server `timeout` in
`.mcp.json` (660000 ms, above the 600000 ms maximum wait so the running fallback can still reach the client) bounds a tool call; `MAX_MCP_OUTPUT_TOKENS` caps a result (results stay far below it).

## Troubleshooting

- "DevDigest API is not reachable": start `./scripts/dev.sh`, or set `DEVDIGEST_API_URL`.
- The server fails to connect with a JSON parse error: something wrote to stdout. Only protocol may go there; logs go to stderr.
- Spawn failure in `/mcp`: the `command` and `args` paths rely on `${CLAUDE_PROJECT_DIR:-.}` expanding to the repo root; if that does not happen on your setup, put an absolute `command` path in a local override (`.claude/settings.local.json` or a user-scope server).
- The run tool hits the rate limit: `POST /pulls/:id/review` allows 10 per minute.

## Checks

```sh
npm run typecheck && npm test && npm run lint
```
