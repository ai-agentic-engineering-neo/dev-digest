# client (`@devdigest/web`) — instructions for Claude

Next.js 15 (App Router), React 19, TanStack Query, next-intl. Source of truth: `client/README.md`.

## Commands

- Dev server (`:3000`): `pnpm dev`
- Unit/component tests (vitest + jsdom, `fetch` mocked, no API needed): `pnpm test`
- Typecheck: `pnpm typecheck` · Build: `pnpm build` · Serve build: `pnpm start`
- The API must be running at `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`) for the app to work; tests don't need it.
- Browser journeys are covered by `../e2e`, not by this package.

## Where things go

- Feature requirements and acceptance criteria → `specs/` (see `specs/README.md`).
- How-to and architecture notes → `docs/` (see `docs/README.md`).
- Gotchas and dated decisions → `insights.md`.

## Rules

- Pages (`src/app/**/page.tsx`) stay thin. Feature logic goes in colocated `_components/<Name>/` folders, each with its own `*.test.tsx`.
- All server data goes through hooks in `src/lib/hooks/*`, which call `src/lib/api.ts`. Don't call `fetch` directly from components.
- Shared UI primitives are vendored under `src/vendor/ui` (`@devdigest/ui`); shared contracts under `src/vendor/shared`. Treat them as copies of the server's contracts.
- App-shell chrome (nav, breadcrumbs, `g`-then-key shortcuts) lives in `src/components/app-shell`.
- UI strings belong in `messages/en/*.json`, not hard-coded in components.
- Test with React Testing Library queries and user interactions, not implementation details (see `TESTING.md`).
