# client — `@devdigest/web`

## Commands (pnpm)
- `pnpm dev` (:3000, needs API on :3001) · `pnpm test` (vitest + jsdom) · `pnpm typecheck` · `pnpm lint`

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
- `src/vendor/shared` is a byte-identical copy of `../server/src/vendor/shared`
  (the source of truth). Change contracts on the server side, copy them over and
  run `../scripts/check-shared-drift.sh` (non-zero exit on any drift).
- Runtime values (schemas) may be imported from
  `@devdigest/shared`: `next.config.mjs` maps its `./x.js` specifiers to `.ts`.
  The barrel pulls zod into the route; take `FEATURE_MODELS` from the zod-free
  `@devdigest/shared/constants/feature-models`.
- API base comes from `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).

## Do not touch
- `src/vendor/ui` (`@devdigest/ui`) — vendored primitives; compose, don't edit.
