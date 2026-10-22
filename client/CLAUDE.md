# client — `@devdigest/web`, the Next.js 15 studio

Full description: [README.md](README.md). Project root: [../CLAUDE.md](../CLAUDE.md)

## Commands

- `pnpm dev` — web on `:3000` (expects the API on `NEXT_PUBLIC_API_BASE`, default `http://localhost:3001`)
- `pnpm test` — vitest + jsdom, fetch mocked, no API needed
- `pnpm typecheck`

## Module boundaries

- Depends on: the server's REST API and SSE (`/runs/:id/events`); `@devdigest/shared`
  (local copy in `src/vendor/shared`); `@devdigest/ui` (`src/vendor/ui`).
- Nothing depends on the client except `e2e/`.
- Does NOT: talk to GitHub, the LLM or the DB directly.

## Rules

- All HTTP goes through `src/lib/api.ts`; all data access through hooks in `src/lib/hooks/*`.
- Route-local components live in `_components/<Name>/` next to the route that owns them;
  shared ones go in `src/components/`.
- UI strings go in `messages/en/*.json` (next-intl), never hard-coded.
- Build on primitives from `@devdigest/ui` before adding new base components.
- If you change a contract in `src/vendor/shared`, make the same change in
  `server/src/vendor/shared` (the source of truth).

## Documentation

| When | Read |
|---|---|
| Adding or changing a page | [README.md — UI route map](README.md#ui-route-map) |
| Writing tests | [README.md — Testing](README.md#testing), [../TESTING.md](../TESTING.md) |
| Understanding the API you call | [../server/README.md — API map](../server/README.md#api-map-starter) |
| Deeper client docs | [docs/](docs/README.md) |
| Implementing a feature | [specs/](specs/README.md) — find the spec first |

## Insights

@INSIGHTS.md
