# client — `@devdigest/web`

## Commands (pnpm)
- `pnpm dev` (:3000, needs API on :3001) · `pnpm test` (vitest + jsdom) · `pnpm typecheck`

## Read when
- Adding a page or wiring a screen to the API → read `README.md` (UI route map)
- Changing a real user journey → also read `../e2e/README.md` (flows may need updating)
- Implementing a planned feature → look for its spec in `specs/`
- Start of every task here → read `INSIGHTS.md` first; at the end → `engineering-insights` wrap-up

## Conventions (non-default)
- Pages (`src/app/**/page.tsx`) stay thin; feature logic lives in colocated
  `_components/<Name>/` folders, each with its own `*.test.tsx`.
- Data only through TanStack Query hooks in `src/lib/hooks/*` → `src/lib/api.ts`.
  No direct `fetch` in components.
- Every user-facing string goes to `messages/en/*.json` (next-intl).
- Shared chrome (nav, breadcrumbs, `g`-then-key shortcuts) is in `src/components/app-shell`.
- Component tests mock `fetch`; they never need the API or a browser.

## Gotchas
- `src/vendor/shared` is a copy of the server's contracts and has drifted —
  a contract change must land in `../server/src/vendor/shared` too.
- API base comes from `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).

## Do not touch
- `src/vendor/ui` (`@devdigest/ui`) — vendored primitives; compose, don't edit.
