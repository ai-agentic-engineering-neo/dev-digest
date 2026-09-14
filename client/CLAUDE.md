# client — agent map

`@devdigest/web`, the studio UI: import repos, browse PRs, run/read AI reviews, author agents. Next.js App Router, data via TanStack Query over the Fastify API.

## Stack

Next.js 15 (App Router) · React 19 · TanStack Query 5.62 · next-intl 3.26 · mermaid 11.15 · react-markdown 9 · TypeScript 5.7 · Vitest 2.1

## Commands

- `pnpm dev` (`:3000`) · `pnpm build` · `pnpm start` · `pnpm typecheck`
- `pnpm test` — vitest + jsdom, `fetch` mocked; no API or browser needed (real journeys live in [`../e2e`](../e2e/README.md))

## Map

| dir | what's there |
|---|---|
| `src/app` | routes (App Router `page.tsx` per route) |
| `src/components` | cross-cutting chrome (`app-shell`, `diff-viewer`, `mermaid-diagram`, `page-shell`) |
| `src/lib` | `api.ts` (fetch base), `hooks/` (TanStack Query hooks), theme/toast/providers |
| `src/i18n` | next-intl setup; messages in `messages/<locale>/*.json` |
| `src/vendor/ui` | vendored UI primitives (`@devdigest/ui`) — see Do-not-touch |
| `src/vendor/shared` | vendored shared Zod contracts (`@devdigest/shared`) — see Do-not-touch |

## Conventions (non-default)

- API base is `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`); every data call goes through a hook in `src/lib/hooks/*`, not ad-hoc `fetch` in components
- Pages stay thin — feature logic lives in colocated `_components/<Name>/` folders next to the route, each with its own `*.test.tsx`

## Gotchas

- Component tests mock `fetch`, so they don't catch real API/contract drift — that's what `e2e/` is for, not a redundant layer

## Do-not-touch

- `src/vendor/ui`, `src/vendor/shared` — vendored/synced, not owned here

## Session Protocol

- **Start:** before working here, read [INSIGHTS.md](./INSIGHTS.md) and note anything relevant to the task.
- **End:** before finishing, invoke `engineering-insights` — write a new entry only if something substantial and not already recorded came up.

## Docs

- [README.md](./README.md) — UI route map, deeper diagrams
- [docs/](./docs/) — reference material too detailed for this file
- [docs/specs/](./docs/specs/) — feature specs (SDD)
- [INSIGHTS.md](./INSIGHTS.md) — running log of decisions/gotchas
