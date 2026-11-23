# client — CLAUDE.md

`@devdigest/web`: Next.js 15 App Router + React 19 + TanStack Query, pnpm. Talks to the API only through `src/lib/api.ts`.

## Commands (`cd client`)
`pnpm dev` · `pnpm test` (vitest + jsdom, fetch mocked, no API needed) · `pnpm typecheck` · `pnpm build`

## Map
`src/app/**/page.tsx` (thin routes) · `src/app/<route>/_components/` (feature UI) · `src/components/` (shared chrome) · `src/lib/api.ts` + `src/lib/hooks/*` (all data access) · `messages/en/*.json` · `src/vendor/{shared,ui}`

## Conventions
- Component = folder `_components/<Name>/`:
  `<Name>.tsx` · `index.ts` (`export { Name, Name as default } from "./Name"`) · `styles.ts` (`export const s = {...}` of `CSSProperties` with CSS vars) · optional `constants.ts`, `helpers.ts`, `<Name>.test.tsx`; children go in nested `_components/`.
- Styling goes through `styles.ts` objects; `className` only for global utility classes (`mono`, `tnum`).
- Data: components never call `fetch`/`apiFetch`; add a hook in `src/lib/hooks/<domain>.ts` and export it from the barrel.
- UI primitives come from `@devdigest/ui`; types and schemas from `@devdigest/shared`.
- i18n: one namespace file per feature in `messages/en/<ns>.json` (auto-merged); use `useTranslations("<ns>")` / `getTranslations("<ns>")`; no hardcoded UI strings.

## Do not touch
- `src/vendor/shared`: mirror of `server/src/vendor/shared`; change the server copy first.
- `src/vendor/ui`: vendored design kit; extend it, don't restyle it for one page.

## Gotchas
- Messages load from `process.cwd()/messages` → run Next from `client/`.
- API base comes from `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`) and is also in the CSP `connect-src` (`next.config.mjs`). A new API origin must work in both.
- The API's CORS only allows `http://localhost|127.0.0.1:${WEB_PORT}`; a different web port must match the server's `WEB_PORT`.

## Read when
- Read `README.md` when adding a route or wiring a page to an API endpoint (route map).
- Read `src/vendor/ui/README.md` before building UI (tokens, layout, primitives).
- Read `docs/` for client reference that doesn't fit the README.
- Read `specs/` before implementing a client feature; write the spec first if missing.
- Read `INSIGHTS.md` before any work in this package (root Insights protocol); add entries only via the `engineering-insights` skill.
