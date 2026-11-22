# client — @devdigest/web

## Stack
Next.js 15 (App Router) · React 19 · TanStack Query 5 · next-intl 3 · Tailwind 4 ·
Vitest 2 + Testing Library 16 + jsdom · TypeScript 5.9 · pnpm

## Commands
`pnpm dev` (:3000) · `pnpm test` (fetch mocked, no API needed) · `pnpm typecheck` · `pnpm build`

## Map
- `src/app/**/page.tsx` — routes; pages are thin
- `src/app/**/_components/<Name>/` — feature UI, colocated with its `*.test.tsx`
- `src/lib/api.ts` — the only HTTP client (`NEXT_PUBLIC_API_BASE`, default :3001)
- `src/lib/hooks/*` — every data hook (TanStack Query)
- `src/components/app-shell/` — nav, breadcrumbs, `g`-then-key shortcuts
- `src/vendor/ui/` (`@devdigest/ui`) · `src/vendor/shared/` (`@devdigest/shared`)
- `messages/<locale>/*.json` — next-intl strings

## Conventions
- Components never call `fetch`; data goes component → hook in `src/lib/hooks` → `api.ts`.
- New feature component = its own `_components/<Name>/` folder + a test.
- UI text lives in `messages/`, not hardcoded.

## Gotchas
- `src/vendor/shared` is a COPY of `server/src/vendor/shared` and has drifted — sync both.
- Real browser journeys are tested in `../e2e`, not here.

## Read when
| When | Read |
|---|---|
| Route map / which API each page uses | `README.md` |
| Using or adding UI primitives | `src/vendor/ui/README.md` |
| Test strategy | `../TESTING.md` |
| Deep reference | `docs/` |
| Implementing a milestone | `specs/` |
| Before non-trivial changes | `INSIGHTS.md` |
