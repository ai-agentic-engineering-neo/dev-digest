# client — @devdigest/web

Next.js 15 (App Router) · React 19 · TanStack Query 5 · next-intl 3 · vitest 2 + jsdom. Package manager: pnpm.

## Where things are
- `src/app/**/page.tsx` — thin pages; feature logic in colocated `_components/<Name>/` (each with its own `*.test.tsx`)
- `src/lib/api.ts` — the only place that calls `fetch` (base: `NEXT_PUBLIC_API_BASE`, default :3001)
- `src/lib/hooks/*` — every data hook (TanStack Query) lives here
- `src/components/app-shell/` — nav, breadcrumbs, `g`-then-key shortcuts
- `src/vendor/ui/` — `@devdigest/ui` primitives · `src/vendor/shared/` — client copy of `@devdigest/shared`
- `messages/en/*.json` — UI strings (next-intl)

## Commands
`pnpm dev` · `pnpm typecheck` · `pnpm test` · `pnpm lint` (fetch mocked — no API needed)

## Conventions (non-default)
- Components never call `fetch` or `api.ts` directly — add or extend a hook in `src/lib/hooks/`.
- No hard-coded UI text: add keys to `messages/en/` and use next-intl.
- Reuse `src/vendor/ui` primitives before adding new ones.

## Gotchas
- `src/vendor/shared` is a separate copy of the server's — keep them identical (`../scripts/check-shared-drift.sh`, run in CI).
- Never import `@devdigest/ui` from a Server Component (page/layout/not-found without `"use client"`): its barrel pulls recharts class components that crash under RSC ("Super expression must either be null or a function") — render UI kit components from a client view.

## Read when relevant
- `README.md` — UI route map and the API each page uses
- `docs/` · `specs/` (before a milestone feature) · `INSIGHTS.md` (before non-trivial changes)
- Skills: frontend-ui-architecture (where code goes), next-best-practices, react-best-practices, react-testing-library
