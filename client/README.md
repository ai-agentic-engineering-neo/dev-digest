# `@devdigest/web` — the studio (Next.js 15)

The DevDigest UI: import repos, browse pull requests, run and read AI reviews,
and author agents. App Router with React Server/Client components, data through
TanStack Query hooks over the Fastify API. (This is the starter surface; course
lessons add the Skills, Memory, Eval, Blast/Brief, multi-agent, CI, and
dashboard screens.)

## Quick start

```sh
pnpm install
pnpm dev        # :3000 — expects the API on :3001
```

`NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`) points at the engine.

| Script | What |
|--------|------|
| `pnpm dev` · `pnpm build` · `pnpm start` | develop · build · serve |
| `pnpm test` | vitest + jsdom, `fetch` mocked — no API or browser needed |
| `pnpm typecheck` | type-check |

## Where to read next

| Topic | Document |
|-------|----------|
| Folder map, conventions, gotchas, do-not-touch zones | [CLAUDE.md](CLAUDE.md) |
| Non-obvious findings recorded while working here | [INSIGHTS.md](INSIGHTS.md) |
| Route map, data layer, run lifecycle, error UX, i18n | [docs/architecture.md](docs/architecture.md) |
| What each screen must do and which states it handles | [specs/ui-flows.md](specs/ui-flows.md) |
| The vendored design system | [src/vendor/ui/README.md](src/vendor/ui/README.md) |
| Test strategy | [../TESTING.md](../TESTING.md) · browser journeys in [../e2e](../e2e/README.md) |
