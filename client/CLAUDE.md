# client — @devdigest/web

Before changing this package read `docs/README.md`.
Feature contracts: `specs/` (one file per feature).

Next.js 15 (App Router) · React 19 · TanStack Query 5 · next-intl 3 · Tailwind 4 · vitest 2 + jsdom

## Commands (pnpm)
- `pnpm dev` (:3000) · `pnpm lint` (ESLint 9 flat, `eslint.config.mjs`) · `pnpm typecheck` · `pnpm test` (fetch mocked — no API needed)

## Map
- `src/app/**/page.tsx` thin pages · feature logic in colocated `_components/<Name>/` (+ `*.test.tsx`)
- `src/lib/api.ts` single fetch client · `src/lib/hooks/*` every data hook
- `src/components/app-shell` nav, breadcrumbs, `g`-then-key shortcuts
- `src/vendor/ui` UI primitives (`@devdigest/ui`) · `messages/<locale>/*.json` i18n strings

## Non-default conventions
- No `fetch` in components — add a hook in `src/lib/hooks` that goes through `src/lib/api.ts`.
- Response types come from `@devdigest/shared`, not hand-written interfaces.
- User-visible text goes through next-intl messages, never hardcoded.
- Every new `_components/<Name>/` ships with its own `*.test.tsx`.

## Gotchas
- API base = `NEXT_PUBLIC_API_BASE` (default http://localhost:3001); server CORS allows only `WEB_PORT`.

## Read when
- Adding a page/route or wiring a new API call → `README.md` (route map)
- Building a lesson screen → `specs/`, then `docs/`
- Before a non-trivial UI change → `INSIGHTS.md`
