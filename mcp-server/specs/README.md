# mcp-server/specs

One file per MCP-server change: `YYYY-MM-DD-feature-name.md`, using the base
skeleton from [`../../specs/README.md`](../../specs/README.md). If the change
also needs a new or changed API endpoint, put the spec in the root
`../../specs/` so both sides stay in one document.

Module-specific points every spec here must cover — as behaviour inside
*Cross-module interactions* / *Contracts*, not as file locations:

```markdown
## Module specifics (mcp-server)
### Tools              <!-- tool name + input schema; read-only or write? -->
### API calls          <!-- which server endpoint(s) the tool wraps -->
### Output shape       <!-- what the compact result looks like; what `summary` says on partial data -->
### Errors & timeouts  <!-- API down, 404, poll budget (POLL_MAX_MS) exhausted -->
```

The server stays a thin stdio wrapper over the Fastify API on `:3001`. A spec
that needs business logic here belongs in `../../server/specs/`.
