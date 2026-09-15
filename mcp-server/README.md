# `@devdigest/mcp-server`

Local MCP server exposing DevDigest's review agents over stdio. Wraps the
Fastify API at `http://localhost:3001` (no auth — a stdio-spawned local
process is a trusted caller, and the API it calls is itself localhost-only).
See [`docs/plans/mcp/server.md`](../docs/plans/mcp/server.md) for the full
design record.

## Setup

```sh
cd mcp-server
npm install
npm run build     # emits dist/ — required once, and again after any source change
```

Claude Code re-spawns the process per session (no hot reload), so `.mcp.json`
at the repo root points at the **built** entry point, not a dev-mode runner.
Once built, DevDigest's tools should show up as `devdigest__*` in a new
session, as long as `./scripts/dev.sh` (or at least the API on `:3001`) is
running.

For active development, `npm run dev` (`tsx watch`) runs the same server
without a build step — useful for manual testing, but not what `.mcp.json`
invokes.

## The 5 tools

- **`list_agents`** — configured reviewer agents; the `id` field is what
  `run_agent_on_pr`'s `agent` argument expects.
- **`run_agent_on_pr(repo, pr, agent)`** — the only write tool. Starts a
  review, polls for up to `POLL_MAX_MS` (default 8000ms, `POLL_INTERVAL_MS`
  default 1000ms), and returns the finished `{verdict, findings[]}`. If the
  poll budget runs out first, returns a `run_id` to check later with
  `get_findings` instead.
- **`get_findings(repo, pr, run_id?)`** — the compact result of an
  already-completed run; does not trigger one.
- **`get_conventions(repo)`** — accepted repo conventions + last-scan
  metadata.
- **`get_blast_radius(repo, pr)`** — **stub**. Always returns `isError: true`
  with a "not implemented yet" message; the underlying logic exists
  server-side (`repoIntel.getBlastRadius()`) but has no HTTP route yet —
  wiring that up is later homework.

## Testing

```sh
npm test         # hermetic — no network access, ApiClient is stubbed
npm run typecheck
```
