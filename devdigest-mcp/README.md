# devdigest-mcp

Local MCP server that exposes the DevDigest PR-review flow to an LLM client
(Claude Code) through five tools. It is a thin stdio adapter over the existing
Fastify API: no DB, no business logic, no secrets. npm package (`@devdigest/mcp`);
never use pnpm here.

Specs: [`specs/01-mcp-server.md`](specs/01-mcp-server.md) (tools, descriptions,
errors) and [`specs/02-development-plan.md`](specs/02-development-plan.md)
(decisions, architecture, risks). Not duplicated here.

## Tools

| Tool | What it does |
|------|--------------|
| `list_agents` | Lists the configured review agents with the id other tools need. |
| `get_conventions` | Returns a repo's accepted coding conventions with evidence. |
| `get_findings` | Returns the verdict and findings of a completed run (`repo`, `pr`, `run_id`). |
| `run_agent_on_pr` | Runs an agent on a PR and returns its findings when the run finishes (up to ~2 min; the only write tool). |
| `get_blast_radius` | Returns the PR's blast radius (same data as the browser): changed symbols, downstream callers as `file:line`, affected endpoints/crons, and the degraded status of the repo index. No LLM. |

## Environment

| Variable | Default | Meaning |
|----------|---------|---------|
| `DEVDIGEST_API_URL` | `http://127.0.0.1:3001` | DevDigest API base URL. `:3000` is the web UI, not the API. |
| `DEVDIGEST_RUN_TIMEOUT_MS` | `120000` | Max wait for `run_agent_on_pr` (1000..120000; may only be lowered). On timeout the run is left running and the message names its `run_id`. |
| `DEVDIGEST_HTTP_TIMEOUT_MS` | `30000` | Timeout of a single HTTP request to the API. |

## Running and registration

This is a **stdio** server: the MCP client starts it as a child process, not
`./scripts/dev.sh`. It does need the API running (`./scripts/dev.sh` or
`cd server && pnpm dev`).

```sh
cd devdigest-mcp && npm ci          # once
```

The repo-root `.mcp.json` (committed) registers it as `devdigest`, running
`npm run --silent --prefix devdigest-mcp start`. `--silent` is mandatory: the npm
banner on stdout would corrupt the JSON-RPC stream. Restart Claude Code in the
repo root, approve the project server, then run `/mcp` and check that `devdigest`
is connected with 5 tools.

Checks: `npm run typecheck && npm test` (hermetic: fake API and SSE server, no
network, no keys).

## Client tool timeout

A cold `run_agent_on_pr` can take longer than the client's own tool timeout.
Set `MCP_TOOL_TIMEOUT=150000` in the environment of the `claude` process, for
example `MCP_TOOL_TIMEOUT=150000 claude`. Putting it in the server's `env` in
`.mcp.json` most likely has no effect (unverified). If a call is cut off, the
run continues server-side; fetch the result with `get_findings` and the `run_id`
(also printed to the server's stderr).
