# client — @devdigest/web

Next.js 15 (App Router) · React 19 · TanStack Query 5 · next-intl 3 · Vitest 2 + RTL (jsdom).
Package manager: pnpm.

## Commands
- `pnpm dev` (:3000) · `pnpm test` · `pnpm typecheck` · `pnpm build`
- API base: `NEXT_PUBLIC_API_BASE` (default http://localhost:3001)

## Map
- `src/app/**` — routes; page-private components in `_components/`
- `src/lib/api.ts` — apiFetch + ApiError · `src/lib/hooks/*` — every data hook
- `src/vendor/ui` — UI kit (`@devdigest/ui`) · `src/vendor/shared` — contracts copy
- `messages/<locale>/*.json` — i18n strings

## Conventions
- Component = folder: `Name.tsx`, `constants.ts`, `helpers.ts`, `styles.ts`, `index.ts`.
- Data only through hooks in `src/lib/hooks` → apiFetch. No raw fetch in components.
- UI text via next-intl messages, not hard-coded strings.
- Tests mock fetch; no API needed.

## Read when…
- Adding a page or hook → README.md (UI route map)
- Feature work → specs/ · Deep dives → docs/
- Before any change → INSIGHTS.md

## Gotchas
- `src/vendor/shared` is a COPY of server/src/vendor/shared — server is canonical.

## Do not touch
- `src/vendor/ui` primitives unless the task is the UI kit (see src/vendor/ui/README.md).
