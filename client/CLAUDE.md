# client/ — @devdigest/web

Next.js 15 (App Router), React 19. Read [../CLAUDE.md](../CLAUDE.md) for the
repo-wide picture first.

## Read when

- UI route map and which API calls each route makes: read [README.md](README.md).
- Deeper architecture notes/decisions beyond the README: read [docs/](docs/).
- Feature/requirement specs before building a screen: read [specs/](specs/).
  - Run Cost Badge (PR list / timeline / trace sidebar cost display): read
    [specs/run-cost-badge.md](specs/run-cost-badge.md).
- Past gotchas and decisions from earlier sessions: read [INSIGHTS.md](INSIGHTS.md).
- Vendored UI primitives: read [src/vendor/ui/README.md](src/vendor/ui/README.md).

## Non-default conventions

- All data access goes through `src/lib/hooks/*` (TanStack Query) →
  `src/lib/api.ts`; components never call `fetch` directly.
- Pages (`src/app/**/page.tsx`) stay thin — feature logic lives in colocated
  `_components/<Name>/` folders, each with its own `*.test.tsx`.
- UI primitives are vendored under `src/vendor/ui` (`@devdigest/ui`); shared
  Zod contracts under `src/vendor/shared` (`@devdigest/shared`) — same
  package as `server/src/vendor/shared`, kept in sync manually.
- i18n strings live in `messages/<locale>/*.json` (`next-intl`), not inline.

## Gotchas

- `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`) is the only way
  the client reaches the API — no server-side proxy.
- Component tests mock `fetch` (vitest + jsdom); they don't need the API or a
  browser. Real browser journeys belong in [`../e2e`](../e2e/README.md), not here.

## Do-not-touch

- `src/vendor/shared/**`, `src/vendor/ui/**` — vendored, edit at the sync
  source (see [src/vendor/ui/README.md](src/vendor/ui/README.md)).

## Commands

`pnpm dev` · `pnpm build` · `pnpm start` · `pnpm test` · `pnpm typecheck`
